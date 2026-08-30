#!/usr/bin/env node
// Snapshot every public table to JSON.
//
// The free Supabase plan has no PITR, so before a migration run this export is
// the only way back. docs/DEV-SETUP.md step 2 used to say "export
// business-critical prod tables to JSON" and name neither the tables nor a
// tool; this is that step, made runnable.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   node scripts/export-prod.mjs [outDir]
//
// The service-role key is required: it bypasses RLS, and an anon-key export
// would silently return empty arrays for every protected table — a backup that
// looks fine and restores nothing. Pass it on the command line as above rather
// than putting it in .env, so it does not linger on disk. The key is never
// printed or written to the output.
//
// NOT covered — know this before relying on the output:
//   * auth.users (accounts, emails, password hashes) — outside PostgREST's
//     reach. Account rows here reference user ids that a restore cannot
//     recreate on its own.
//   * Storage objects: payment slips, banners, venue maps, rules images.
//   * Database functions, policies and grants — those live in supabase/.
// It is a data snapshot, not a disaster-recovery image.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  SUPABASE_URL=https://<ref>.supabase.co \\\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/export-prod.mjs [outDir]",
  );
  process.exit(1);
}

const allowEmpty = process.argv.includes("--allow-empty");

// Every table in the public schema as of 2026-08-30. Ordered parent-before-
// child so the files can be replayed in listing order on a restore.
const TABLES = [
  "app_config",
  "account_roles",
  "go_institute",
  "institute_merge",
  "go_person",
  "go_player_database",
  "award_limit_exemption",
  "profile",
  "managed_player",
  "tournament",
  "category",
  "promo_code",
  "seat_hold",
  "seat_hold_line",
  "registration_batch",
  "registration_seat",
  "promo_redemption",
  "seat_withdrawal",
  "seat_division_change",
  "live_division",
  "live_match",
  "live_standing",
  "live_config",
  // Leftover from the go_person migration; cheap to keep, awkward to miss.
  "_pre_go_person_backup",
];

const PAGE = 1000;

async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/${encodeURIComponent(table)}?select=*`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          Range: `${from}-${from + PAGE - 1}`,
          Prefer: "count=exact",
        },
      },
    );
    if (!res.ok) {
      throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

// Pre-flight: prove the key actually bypasses RLS before writing anything.
//
// Sniffing the key's shape is not good enough — the newer publishable keys are
// not JWTs, so a format check lets an anon key through, and PostgREST then
// answers every request with a cheerful empty array. The failure mode is a
// backup that reports success, writes files, and restores nothing. So instead
// ask an empirical question: can this key see rows in a table RLS hides from
// anon?
async function assertServiceRole() {
  const res = await fetch(`${url}/rest/v1/profile?select=id&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok) {
    console.error(`Pre-flight read of "profile" failed: HTTP ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }
  // content-range looks like "0-0/139"; the total is what matters.
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? "0");
  if (total > 0) return;
  console.error(
    'This key cannot see any rows in "profile".\n' +
      "Almost certainly it is an anon/publishable key rather than the service-role\n" +
      "key: RLS hides the table, PostgREST returns [], and the export would look\n" +
      "successful while backing up nothing.\n\n" +
      "Use the service_role key from Project Settings → API.\n" +
      "If the database really is empty, re-run with --allow-empty.",
  );
  process.exit(1);
}

if (!allowEmpty) await assertServiceRole();

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? join("backups", stamp);
mkdirSync(outDir, { recursive: true });

const manifest = { exportedAt: new Date().toISOString(), url, tables: {} };
let failed = 0;

for (const table of TABLES) {
  try {
    const rows = await fetchAll(table);
    writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
    manifest.tables[table] = rows.length;
    console.log(`${String(rows.length).padStart(6)}  ${table}`);
  } catch (err) {
    failed++;
    manifest.tables[table] = { error: String(err.message ?? err) };
    console.error(`  FAILED  ${table}: ${err.message ?? err}`);
  }
}

writeFileSync(join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2));

const total = Object.values(manifest.tables).reduce(
  (n, v) => n + (typeof v === "number" ? v : 0),
  0,
);
console.log(`\n${total} rows across ${TABLES.length - failed} tables → ${outDir}`);
if (failed) {
  console.error(
    `${failed} table(s) failed. This snapshot is INCOMPLETE — do not treat it ` +
      `as a safety net for a migration run.`,
  );
  process.exit(1);
}
