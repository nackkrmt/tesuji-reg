#!/usr/bin/env node
// Replay a directory made by scripts/export-prod.mjs into an EMPTY Supabase
// project: auth users first, then every public table in the manifest's order,
// then the bytes of every storage bucket.
//
// This is the half of disaster recovery that did not exist. The export has been
// run since 2026-08; nothing has ever put one back, so "we have a backup" was
// an untested claim. Run it at least once against the dev project and write the
// date and the row counts into docs/DEV-SETUP.md — a restore nobody has
// rehearsed is not a restore.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   node scripts/restore-prod.mjs backups/2026-09-15T… \
//     --project-ref=<ref> --yes-i-know-this-overwrites
//
// Order of operations for a real recovery, all three steps required:
//   1. create the project,
//   2. apply supabase/schema-baseline.sql + supabase/bootstrap/* +
//      supabase/migrations/* (this script restores DATA, never schema),
//   3. run this.
//
// WHAT COMES BACK AND WHAT DOES NOT — read before promising anyone a recovery:
//   * Rows in public.*: yes, all of them, including the ids, so every foreign
//     key still lines up.
//   * Accounts: the id, email, phone and metadata come back, so account_id
//     references resolve. Their PASSWORDS DO NOT — the admin API never hands
//     out hashes, so there is nothing in the backup to restore. Every restored
//     user must go through "forgot password" (or a magic link) before they can
//     sign in. Sessions, refresh tokens, MFA factors and OAuth identities are
//     gone too: a Google-linked account comes back as an email-only account.
//   * Storage objects: yes, bytes and all, when the backup was taken WITHOUT
//     --no-storage. Their created_at/owner metadata is not preserved.
//   * Schema, functions, policies, grants, pg_cron jobs: no. Step 2 above.
//
// Safety rails, because the destination of this script is by definition a
// database you are willing to overwrite:
//   * --yes-i-know-this-overwrites must be typed in full.
//   * --project-ref=<ref> must match the ref in SUPABASE_URL, so the
//     destination has to be named twice, by hand, from two different places.
//   * every table named in the manifest must be empty. Pointing this at a live
//     project is the accident worth engineering against, and a live project
//     always has rows.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

const backupDir = args.find((a) => !a.startsWith("--"));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const wantRef = value("project-ref");
const confirmed = flag("yes-i-know-this-overwrites");
const dryRun = flag("dry-run");
const skipAuth = flag("no-auth");
const skipStorage = flag("no-storage");
const resume = flag("resume-partial-restore");

const USAGE =
  "  SUPABASE_URL=https://<ref>.supabase.co \\\n" +
  "  SUPABASE_SERVICE_ROLE_KEY=<key> \\\n" +
  "  node scripts/restore-prod.mjs <backupDir> \\\n" +
  "    --project-ref=<ref> --yes-i-know-this-overwrites\n" +
  "  optional: --dry-run --no-auth --no-storage --resume-partial-restore";

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!backupDir) die(`Missing <backupDir>.\n${USAGE}`);
if (!url || !key) die(`Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n${USAGE}`);

// The ref is the project id in <ref>.supabase.co; anything else (a local
// PostgREST during a drill) is identified by its host, so the double-naming
// rule below still holds outside the cloud.
function projectRef(u) {
  try {
    const host = new URL(u).hostname;
    return host.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1] ?? new URL(u).host;
  } catch {
    return null;
  }
}

const urlRef = projectRef(url);
if (!wantRef || !urlRef || wantRef !== urlRef) {
  die(
    "--project-ref must name the same project as SUPABASE_URL.\n" +
      `  SUPABASE_URL points at: ${urlRef ?? "(unrecognised URL shape)"}\n` +
      `  --project-ref says:     ${wantRef ?? "(missing)"}\n\n` +
      "Naming the destination twice is the point: it is the difference between\n" +
      "restoring into the rebuilt project and restoring over a live one.",
  );
}
if (!confirmed && !dryRun) {
  die(
    `This REWRITES every table in project ${urlRef}.\n` +
      "Re-run with --yes-i-know-this-overwrites once you are sure, or with\n" +
      "--dry-run to see the plan without touching anything.",
  );
}

const svc = { apikey: key, Authorization: `Bearer ${key}` };
const CHUNK = 500;

// ── pre-flight ───────────────────────────────────────────────────────────────
// The export proves its key bypasses RLS by reading rows RLS hides. A restore
// target is empty, so that question has no answer here — ask GoTrue instead.
// The admin endpoint is service-role-only and 401s for an anon/publishable key,
// which would otherwise fail much later, halfway through the insert run.
async function assertServiceRole() {
  const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
    headers: svc,
  });
  if (res.ok) return;
  die(
    `This key cannot use the GoTrue admin API (HTTP ${res.status}).\n` +
      "Almost certainly it is an anon/publishable key rather than the\n" +
      "service_role key from Project Settings → API. A restore needs the\n" +
      "service role: it writes past RLS and recreates accounts.",
  );
}

/** Row count PostgREST reports for a table, or null when it is not exposed. */
async function countRows(table) {
  const res = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?select=*`, {
    headers: { ...svc, Range: "0-0", Prefer: "count=exact" },
  });
  if (!res.ok) return null;
  return Number(res.headers.get("content-range")?.split("/")[1] ?? "0");
}

// ── the backup ───────────────────────────────────────────────────────────────
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(backupDir, "_manifest.json"), "utf8"));
} catch (err) {
  die(`Cannot read ${join(backupDir, "_manifest.json")}: ${err.message ?? err}`);
}

// format 1 backups (before 2026-09-15) predate the manifest's order/deferred/
// primaryKeys fields. Their files are still replayable — the old hardcoded
// TABLES array was itself in parent-before-child order — but seat_hold.batch_id
// would break the run, and there is no auth or storage in them at all.
const order = manifest.order ?? Object.keys(manifest.tables ?? {});
const deferred = manifest.deferred ?? {};
const primaryKeys = manifest.primaryKeys ?? {};
if (!manifest.order) {
  console.warn(
    "This is a format-1 backup: no FK order, no deferred columns, no\n" +
      "auth users and no storage. Replaying it may fail on circular foreign\n" +
      "keys, and the accounts it references will not exist. Take a fresh\n" +
      "export before relying on this.",
  );
}
if (order.length === 0) die("The manifest lists no tables.");

const readTable = (table) => {
  const file = join(backupDir, `${table}.json`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

console.log(`Restoring ${backupDir} → ${urlRef}${dryRun ? "  (dry run)" : ""}`);
await assertServiceRole();

// ── refuse a non-empty destination ───────────────────────────────────────────
const occupied = [];
for (const table of order) {
  const n = await countRows(table);
  if (n === null) {
    console.warn(`  ?  ${table}: not exposed by this project — skipping it`);
    continue;
  }
  if (n > 0) occupied.push(`${table} (${n} rows)`);
}
if (occupied.length > 0 && !resume) {
  die(
    "\nThis project is NOT empty:\n  " +
      occupied.join("\n  ") +
      "\n\nA restore is only defined against an empty project — merging a backup\n" +
      "into live data would duplicate registrations and resurrect deleted rows.\n" +
      "Create a fresh project (or wipe this one through the admin Danger Zone),\n" +
      "apply supabase/, then run this again. If you are retrying a run that died\n" +
      "halfway, --resume-partial-restore upserts on top of what is already there.",
  );
}
if (occupied.length > 0) {
  console.warn(`\n--resume-partial-restore: upserting over ${occupied.length} non-empty table(s)`);
}

// ── pass 0: accounts ─────────────────────────────────────────────────────────
// Every account_id in the public tables points at auth.users, so the accounts
// have to exist before the first insert. Ids are supplied explicitly; if GoTrue
// ever ignores the requested id the whole restore is worthless (the FKs would
// dangle), so the id that comes back is checked rather than assumed.
let usersCreated = 0;
let usersExisting = 0;
const userErrors = [];
if (!skipAuth) {
  let users = [];
  try {
    users = JSON.parse(readFileSync(join(backupDir, "auth_users.json"), "utf8"));
  } catch {
    console.warn("  no auth_users.json in this backup — skipping accounts");
  }
  for (const u of users) {
    if (dryRun) {
      usersCreated++;
      continue;
    }
    const payload = {
      id: u.id,
      email: u.email ?? undefined,
      phone: u.phone || undefined,
      email_confirm: Boolean(u.email),
      phone_confirm: Boolean(u.phone),
      user_metadata: u.user_metadata ?? {},
      app_metadata: u.app_metadata ?? {},
    };
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { ...svc, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) {
      if (out.id !== u.id) {
        die(
          `GoTrue created ${u.id} under a different id (${out.id}).\n` +
            "Every foreign key in the backup points at the old id, so the restore\n" +
            "would produce orphaned rows. Stopping before any table is written.",
        );
      }
      usersCreated++;
    } else if (res.status === 422 || res.status === 409) {
      usersExisting++; // already there (a resumed run)
    } else {
      userErrors.push(`${u.id}: HTTP ${res.status} ${out.msg ?? out.error ?? ""}`);
    }
  }
  console.log(
    `${String(usersCreated).padStart(6)}  auth.users created` +
      (usersExisting ? `, ${usersExisting} already present` : "") +
      (userErrors.length ? `, ${userErrors.length} FAILED` : "") +
      "  (no passwords — everyone must reset)",
  );
}

// ── pass 1: rows ─────────────────────────────────────────────────────────────
async function insertChunk(table, rows, hasPk) {
  const res = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: {
      ...svc,
      "Content-Type": "application/json",
      // merge-duplicates makes a resumed run idempotent; a table with no
      // primary key has no conflict target, so it can only ever plain-insert.
      Prefer: hasPk ? "return=minimal,resolution=merge-duplicates" : "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
}

const restored = {};
const tableErrors = [];
for (const table of order) {
  const rows = readTable(table);
  if (rows === null) {
    tableErrors.push(`${table}: no ${table}.json in the backup`);
    console.error(`  MISSING  ${table}`);
    continue;
  }
  const hold = deferred[table] ?? [];
  const body = hold.length
    ? rows.map((r) => ({ ...r, ...Object.fromEntries(hold.map((c) => [c, null])) }))
    : rows;
  if (dryRun) {
    restored[table] = rows.length;
    console.log(
      `${String(rows.length).padStart(6)}  ${table}` +
        (hold.length ? `  (${hold.join(", ")} held back)` : ""),
    );
    continue;
  }
  try {
    for (let i = 0; i < body.length; i += CHUNK) {
      await insertChunk(table, body.slice(i, i + CHUNK), (primaryKeys[table] ?? []).length > 0);
    }
    restored[table] = rows.length;
    console.log(
      `${String(rows.length).padStart(6)}  ${table}` +
        (hold.length ? `  (${hold.join(", ")} deferred)` : ""),
    );
  } catch (err) {
    tableErrors.push(`${table}: ${err.message ?? err}`);
    console.error(`  FAILED  ${table}: ${err.message ?? err}`);
  }
}

// ── pass 2: the columns held back for the FK cycle ───────────────────────────
// seat_hold.batch_id and registration_batch.hold_id point at each other, so one
// of them went in as null above. Fill it now that both rows exist.
let patched = 0;
for (const [table, cols] of Object.entries(deferred)) {
  const rows = readTable(table);
  if (!rows) continue;
  const pk = primaryKeys[table] ?? [];
  if (pk.length === 0) {
    tableErrors.push(
      `${table}: ${cols.join(", ")} were held back but the table has no primary ` +
        `key to patch them by — those values are LOST`,
    );
    continue;
  }
  for (const row of rows) {
    const patch = Object.fromEntries(
      cols.filter((c) => row[c] !== null && row[c] !== undefined).map((c) => [c, row[c]]),
    );
    if (Object.keys(patch).length === 0) continue;
    if (dryRun) {
      patched++;
      continue;
    }
    const filter = pk
      .map((c) => `${c}=eq.${encodeURIComponent(String(row[c]))}`)
      .join("&");
    const res = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?${filter}`, {
      method: "PATCH",
      headers: { ...svc, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (res.ok) patched++;
    else tableErrors.push(`${table} ${filter}: HTTP ${res.status} ${await res.text()}`);
  }
}
if (patched) console.log(`${String(patched).padStart(6)}  deferred column(s) filled in`);

// ── pass 3: storage ──────────────────────────────────────────────────────────
let uploaded = 0;
const storageErrors = [];
if (!skipStorage) {
  let buckets = [];
  try {
    buckets = JSON.parse(readFileSync(join(backupDir, "storage", "_buckets.json"), "utf8"));
  } catch {
    console.warn("  no storage/_buckets.json in this backup — skipping files");
  }
  for (const bucket of buckets) {
    if (!dryRun) {
      const res = await fetch(`${url}/storage/v1/bucket`, {
        method: "POST",
        headers: { ...svc, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bucket.id,
          name: bucket.name ?? bucket.id,
          public: Boolean(bucket.public),
          file_size_limit: bucket.file_size_limit ?? null,
          allowed_mime_types: bucket.allowed_mime_types ?? null,
        }),
      });
      // 409 = the bucket already exists, which is fine and common: the storage
      // policies in supabase/ create it during step 2.
      if (!res.ok && res.status !== 409) {
        storageErrors.push(`bucket ${bucket.id}: HTTP ${res.status} ${await res.text()}`);
        continue;
      }
    }

    let index = [];
    try {
      index = JSON.parse(
        readFileSync(join(backupDir, "storage", `${bucket.id}.objects.json`), "utf8"),
      );
    } catch {
      index = [];
    }
    const types = new Map(index.map((o) => [o.name, o.mimetype]));

    const root = join(backupDir, "storage", bucket.id);
    const walk = (dir, prefix) => {
      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        return [];
      }
      return entries.flatMap((entry) => {
        const full = join(dir, entry);
        const name = prefix ? `${prefix}/${entry}` : entry;
        return statSync(full).isDirectory() ? walk(full, name) : [{ full, name }];
      });
    };

    let here = 0;
    for (const file of walk(root, "")) {
      if (dryRun) {
        uploaded++;
        here++;
        continue;
      }
      const encoded = file.name.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${url}/storage/v1/object/${bucket.id}/${encoded}`, {
        method: "POST",
        headers: {
          ...svc,
          "Content-Type": types.get(file.name) ?? "application/octet-stream",
          "x-upsert": "true",
        },
        body: readFileSync(file.full),
      });
      if (res.ok) {
        uploaded++;
        here++;
      } else storageErrors.push(`${bucket.id}/${file.name}: HTTP ${res.status}`);
    }
    console.log(`${String(here).padStart(6)}  storage/${bucket.id}`);
  }
}

// ── report ───────────────────────────────────────────────────────────────────
// Row counts are compared against the manifest rather than trusted: a table
// that silently took fewer rows than the backup holds is the failure this whole
// script exists to make visible.
const short = [];
for (const [table, expected] of Object.entries(manifest.tables ?? {})) {
  if (typeof expected !== "number") continue;
  const got = restored[table];
  if (got !== expected) short.push(`${table}: backup ${expected}, restored ${got ?? 0}`);
}

const problems = [...tableErrors, ...userErrors, ...storageErrors];
console.log(
  `\n${Object.values(restored).reduce((a, b) => a + b, 0)} rows into ${urlRef}` +
    (skipStorage ? "" : `, ${uploaded} file(s)`),
);
if (short.length) {
  console.error("Row counts do not match the backup:\n  " + short.join("\n  "));
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n  ` + problems.join("\n  "));
}
if (!dryRun && !skipAuth) {
  console.log(
    "\nReminder: restored accounts have NO password. Nobody can sign in until\n" +
      "they reset it — send the mail-out before announcing the site is back.",
  );
}
if (short.length || problems.length) process.exit(1);
