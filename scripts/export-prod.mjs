#!/usr/bin/env node
// Snapshot a Supabase project: every public table, the auth users, and the
// bytes of both storage buckets — into one timestamped directory that
// scripts/restore-prod.mjs can replay into an empty project.
//
// The free Supabase plan has no PITR, so before a migration run this export is
// the only way back. docs/DEV-SETUP.md step 2 used to say "export
// business-critical prod tables to JSON" and name neither the tables nor a
// tool; this is that step, made runnable.
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
//   node scripts/export-prod.mjs [outDir] [--no-auth] [--no-storage]
//
// The service-role key is required: it bypasses RLS, and an anon-key export
// would silently return empty arrays for every protected table — a backup that
// looks fine and restores nothing. Pass it on the command line as above rather
// than putting it in .env, so it does not linger on disk. The key is never
// printed or written to the output.
//
// The table list is discovered at run time from PostgREST's OpenAPI document,
// not hardcoded. The previous hardcoded array was written on 2026-08-30 and
// silently missed tournament_live_token and tournament_judge — the two tables
// the whole judge/live subsystem rests on — from every backup taken after
// 20260908_0001. A list that has to be maintained by hand is a list that goes
// stale without anybody noticing.
//
// NOT covered — know this before relying on the output:
//   * Password hashes, sessions, refresh tokens, MFA factors and OAuth
//     identities. The GoTrue admin API lists users but never returns their
//     secrets, so a restored account exists with the same id and email and no
//     way to sign in until the person resets their password. Nothing this
//     script can do changes that; plan a "reset your password" mail-out as part
//     of any real recovery.
//   * Database schema: tables, functions, policies, grants, cron jobs. Those
//     live in supabase/ and are replayed by the migrations, not from here.
//     Restore order is always: create project → apply supabase/ → run
//     scripts/restore-prod.mjs.
//
// The output directory holds real personal data — names, phone numbers, emails
// and 124 payment slips. backups/ is gitignored; keep the directory encrypted
// at rest (age/gpg) and delete it when the drill is over.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
const skipAuth = process.argv.includes("--no-auth");
const skipStorage = process.argv.includes("--no-storage");

const PAGE = 1000;
const svc = { apikey: key, Authorization: `Bearer ${key}` };

// ── table discovery ──────────────────────────────────────────────────────────
// PostgREST publishes an OpenAPI document at the API root that is generated
// from the live catalog: one definition per exposed relation, and for every
// foreign-key column a description note of the form
// "<fk table='tournament' column='id'/>". That gives us both halves of what a
// backup needs — which tables exist today, and which must be written first —
// without a second connection to the database.
async function discoverSchema() {
  const res = await fetch(`${url}/rest/v1/`, { headers: svc });
  if (!res.ok) {
    throw new Error(`OpenAPI read failed: HTTP ${res.status} ${await res.text()}`);
  }
  const spec = await res.json();
  const defs = spec.definitions ?? spec.components?.schemas ?? {};
  const paths = spec.paths ?? {};

  const tables = [];
  const parents = new Map(); // table -> Map(column -> parent table)
  const primaryKeys = new Map(); // table -> [columns]

  for (const [name, def] of Object.entries(defs)) {
    // "(rpc) foo" definitions describe function arguments, not relations.
    if (name.startsWith("(")) continue;
    // Only relations PostgREST will accept an INSERT on can be restored, which
    // is also what separates a table from a read-only view here.
    if (!paths[`/${name}`]?.post) continue;

    tables.push(name);
    const fks = new Map();
    const pk = [];
    for (const [col, prop] of Object.entries(def.properties ?? {})) {
      const note = String(prop.description ?? "");
      const fk = note.match(/<fk table='([^']+)' column='[^']+'\/>/);
      if (fk) fks.set(col, fk[1]);
      if (note.includes("<pk/>")) pk.push(col);
    }
    parents.set(name, fks);
    primaryKeys.set(name, pk);
  }

  if (tables.length === 0) {
    throw new Error("OpenAPI document listed no insertable tables");
  }
  return { tables, parents, primaryKeys };
}

// Parent-before-child, so the files can be replayed in listing order.
//
// The graph is not acyclic: seat_hold.batch_id points at registration_batch
// while registration_batch.hold_id points back at seat_hold. When the sort gets
// stuck we break the cycle on the table with the fewest unmet parents and
// record the offending columns as "deferred" — the restore inserts those as
// null and patches them in a second pass. Both columns of that pair are
// nullable, which is what makes the trick safe; if a future cycle runs through
// a NOT NULL column the restore will fail loudly on the insert rather than
// quietly drop data.
function orderTables(tables, parents) {
  const pending = new Set(tables);
  const done = new Set();
  const order = [];
  const deferred = {};

  const unmet = (t) => {
    const out = new Set();
    for (const [col, parent] of parents.get(t) ?? []) {
      if (parent !== t && pending.has(parent) && !done.has(parent)) out.add(col);
    }
    return out;
  };

  while (pending.size > 0) {
    let progressed = false;
    for (const t of [...pending].sort()) {
      if (unmet(t).size === 0) {
        pending.delete(t);
        done.add(t);
        order.push(t);
        progressed = true;
      }
    }
    if (progressed) continue;

    const stuck = [...pending].sort(
      (a, b) => unmet(a).size - unmet(b).size || a.localeCompare(b),
    )[0];
    deferred[stuck] = [...unmet(stuck)].sort();
    pending.delete(stuck);
    done.add(stuck);
    order.push(stuck);
  }
  return { order, deferred };
}

// ── readers ──────────────────────────────────────────────────────────────────
async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/${encodeURIComponent(table)}?select=*`,
      {
        headers: { ...svc, Range: `${from}-${from + PAGE - 1}`, Prefer: "count=exact" },
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

// auth.users is outside PostgREST's reach, but the GoTrue admin API will list
// it page by page for the service role. What comes back is the account row
// minus every secret (see the header): id, email, phone, metadata, timestamps.
// Those ids are what half the public tables reference, so without this file a
// restore has nothing to point account_id at.
async function fetchAuthUsers() {
  const users = [];
  const perPage = 200;
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      { headers: svc },
    );
    if (!res.ok) {
      throw new Error(`auth users: HTTP ${res.status} ${await res.text()}`);
    }
    const body = await res.json();
    const batch = Array.isArray(body.users) ? body.users : [];
    users.push(...batch);
    if (batch.length < perPage) return users;
  }
}

/** Every object in a bucket, walking pseudo-folders (list is one level deep). */
async function listBucket(bucket) {
  const objects = [];
  const prefixes = [""];
  while (prefixes.length > 0) {
    const prefix = prefixes.pop();
    for (let offset = 0; ; offset += PAGE) {
      const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { ...svc, "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix,
          limit: PAGE,
          offset,
          sortBy: { column: "name", order: "asc" },
        }),
      });
      if (!res.ok) {
        throw new Error(`${bucket}: list failed HTTP ${res.status}`);
      }
      const items = await res.json();
      for (const item of items) {
        if (!item.name) continue;
        // A null id row is a pseudo-folder, not an object.
        if (item.id === null) prefixes.push(`${prefix + item.name}/`);
        else if (item.name !== ".emptyFolderPlaceholder") {
          objects.push({
            name: prefix + item.name,
            size: item.metadata?.size ?? null,
            mimetype: item.metadata?.mimetype ?? null,
          });
        }
      }
      if (items.length < PAGE) break;
    }
  }
  return objects;
}

/** Storage paths come from user uploads; never let one escape the backup dir. */
function safeRelative(name) {
  const parts = name.split("/").filter((p) => p !== "" && p !== "." && p !== "..");
  return parts.length > 0 ? parts.join("/") : null;
}

async function downloadObject(bucket, name, dest) {
  const encoded = name.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${encoded}`, {
    headers: svc,
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// ── pre-flight ───────────────────────────────────────────────────────────────
// Prove the key actually bypasses RLS before writing anything.
//
// Sniffing the key's shape is not good enough — the newer publishable keys are
// not JWTs, so a format check lets an anon key through, and PostgREST then
// answers every request with a cheerful empty array. The failure mode is a
// backup that reports success, writes files, and restores nothing. So instead
// ask an empirical question: can this key see rows in a table RLS hides from
// anon?
async function assertServiceRole() {
  const res = await fetch(`${url}/rest/v1/profile?select=id&limit=1`, {
    headers: { ...svc, Prefer: "count=exact" },
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

let schema;
try {
  schema = await discoverSchema();
} catch (err) {
  console.error(
    `Could not discover the table list: ${err.message ?? err}\n` +
      "The export refuses to guess — a backup built from a stale hand-written\n" +
      "list is how tournament_judge and tournament_live_token went missing.",
  );
  process.exit(1);
}

const { order, deferred } = orderTables(schema.tables, schema.parents);

// The manifest is the restore's instruction sheet: the order to replay, which
// columns to hold back to the second pass, and which key to patch them by.
const manifest = {
  exportedAt: new Date().toISOString(),
  url,
  format: 2,
  order,
  deferred,
  primaryKeys: Object.fromEntries(
    order.map((t) => [t, schema.primaryKeys.get(t) ?? []]),
  ),
  tables: {},
  authUsers: skipAuth ? null : 0,
  buckets: skipStorage ? null : {},
};
let failed = 0;

for (const table of order) {
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

if (!skipAuth) {
  try {
    const users = await fetchAuthUsers();
    writeFileSync(join(outDir, "auth_users.json"), JSON.stringify(users, null, 2));
    manifest.authUsers = users.length;
    console.log(`${String(users.length).padStart(6)}  auth.users (no passwords)`);
  } catch (err) {
    failed++;
    manifest.authUsers = { error: String(err.message ?? err) };
    console.error(`  FAILED  auth.users: ${err.message ?? err}`);
  }
}

if (!skipStorage) {
  mkdirSync(join(outDir, "storage"), { recursive: true });
  try {
    const res = await fetch(`${url}/storage/v1/bucket`, { headers: svc });
    if (!res.ok) throw new Error(`bucket list failed HTTP ${res.status}`);
    const buckets = await res.json();
    writeFileSync(
      join(outDir, "storage", "_buckets.json"),
      JSON.stringify(buckets, null, 2),
    );
    for (const bucket of buckets) {
      const objects = await listBucket(bucket.id);
      let saved = 0;
      const skipped = [];
      for (const obj of objects) {
        const rel = safeRelative(obj.name);
        if (!rel) {
          skipped.push(obj.name);
          continue;
        }
        try {
          await downloadObject(
            bucket.id,
            obj.name,
            join(outDir, "storage", bucket.id, ...rel.split("/")),
          );
          saved++;
        } catch (err) {
          skipped.push(`${obj.name}: ${err.message ?? err}`);
        }
      }
      writeFileSync(
        join(outDir, "storage", `${bucket.id}.objects.json`),
        JSON.stringify(objects, null, 2),
      );
      manifest.buckets[bucket.id] = { listed: objects.length, saved, skipped };
      console.log(
        `${String(saved).padStart(6)}  storage/${bucket.id}` +
          (skipped.length ? `  (${skipped.length} SKIPPED)` : ""),
      );
      if (skipped.length) failed++;
    }
  } catch (err) {
    failed++;
    manifest.buckets = { error: String(err.message ?? err) };
    console.error(`  FAILED  storage: ${err.message ?? err}`);
  }
}

writeFileSync(join(outDir, "_manifest.json"), JSON.stringify(manifest, null, 2));

const total = Object.values(manifest.tables).reduce(
  (n, v) => n + (typeof v === "number" ? v : 0),
  0,
);
console.log(`\n${total} rows across ${order.length - failed} tables → ${outDir}`);
if (Object.keys(deferred).length > 0) {
  console.log(
    `Circular FKs deferred to the restore's second pass: ` +
      Object.entries(deferred)
        .map(([t, cols]) => `${t}.${cols.join("/")}`)
        .join(", "),
  );
}
console.log(`Replay into an EMPTY project with: node scripts/restore-prod.mjs ${outDir}`);
if (failed) {
  console.error(
    `${failed} item(s) failed. This snapshot is INCOMPLETE — do not treat it ` +
      `as a safety net for a migration run.`,
  );
  process.exit(1);
}
