# Backup and restore

Two scripts, one directory format. `scripts/export-prod.mjs` writes a snapshot;
`scripts/restore-prod.mjs` replays one into an **empty** project. Read the
"What is not in a backup" section before promising anyone a recovery.

> **The free Supabase plan has no point-in-time recovery.** There is no "roll
> the database back 20 minutes" button, no automatic daily snapshot you can
> restore from, and no second project standing by. Before any migration run, and
> before the day of an event, the export below is the only way back.

## Taking a backup

```bash
SUPABASE_URL=https://ytgbimtjayecaxfyssta.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
node scripts/export-prod.mjs [outDir] [--no-auth] [--no-storage]
```

Default `outDir` is `backups/<timestamp>`. Pass the key **on the command line**,
not in `.env`, so it does not linger on disk; the script never prints or writes
it.

The **service-role key is required**, and the script proves the key it was given
really bypasses RLS before it writes anything: it reads `profile` and checks the
row count is non-zero. A shape check would not do — the newer publishable keys
are not JWTs, so an anon key would pass a format test and then PostgREST would
answer every request with a cheerful empty array. That failure mode is a backup
that reports success, writes files, and restores nothing. (If the database
genuinely is empty, `--allow-empty` skips the pre-flight.)

What it writes into `outDir`:

| | |
|---|---|
| `<table>.json` | every row of every insertable relation, pretty-printed |
| `auth_users.json` | the account rows from the GoTrue admin API — **no secrets** |
| `storage/_buckets.json` | bucket definitions (public flag, size limit, mime allow-list) |
| `storage/<bucket>.objects.json` | the object index with sizes and mime types |
| `storage/<bucket>/…` | the actual bytes — banners, venue maps, payment slips |
| `_manifest.json` | the restore's instruction sheet (see below) |

**The table list is discovered at run time** from PostgREST's OpenAPI document,
not hardcoded — and that is not a refinement, it is a bug fix. The previous
hardcoded array was written on 2026-08-30 and silently missed
`tournament_live_token` and `tournament_judge` — the two tables the whole
judge/live subsystem rests on — from every backup taken after `20260908_0001`.
A list maintained by hand is a list that goes stale without anybody noticing.
The same OpenAPI document supplies each column's foreign-key note, which is how
the manifest can record a **parent-before-child order** and the primary keys.

The FK graph is not acyclic: `seat_hold.batch_id` points at
`registration_batch` while `registration_batch.hold_id` points back. When the
topological sort gets stuck, the export breaks the cycle on the table with the
fewest unmet parents and records the offending columns as `deferred` in the
manifest; the restore inserts those as null and patches them in a second pass.
Both columns of that pair are nullable, which is what makes the trick safe — a
future cycle through a NOT NULL column would fail loudly on the insert rather
than quietly drop data.

The script **exits non-zero** if any table, the auth list, or any storage object
failed, and says so: an incomplete snapshot is not a safety net.

### Where the files may live

`backups/` is gitignored. That is not the same as protected. It holds names,
phone numbers, dates of birth, institutes, refund bank accounts and ~124
payment-slip images — real personal data for ~150 people, as plain JSON and
plain image files on a laptop.

- Keep the directory **encrypted at rest**: `age -p`, `gpg --symmetric`, or an
  encrypted volume/disk image. Encrypting one tar of the whole directory is the
  simplest version.
- **Delete it when the drill or the migration run is over.** Do not let copies
  accumulate in a synced home directory.
- Under PDPA those copies are the organiser's responsibility exactly like the
  originals. The server-side half of the same promise is the `purge-slips` edge
  function (see [DEV-SETUP.md § Backups and retention](./DEV-SETUP.md#backups-and-retention)).

## What is not in a backup

Know this **before** telling anyone the data is safe:

- **Passwords, sessions, refresh tokens, MFA factors and OAuth identities.** The
  GoTrue admin API lists users but never returns their secrets, so there is
  nothing in the backup to restore. A restored account exists with the same id
  and email and **no way to sign in** until the person resets their password. A
  Google-linked account comes back as an email-only account. Plan a "reset your
  password" mail-out as part of any real recovery — and note that without custom
  SMTP the built-in mailer is rate-limited to a handful of messages an hour, so
  that mail-out needs SMTP configured first.
- **The schema.** Tables, functions, policies, grants, pg_cron jobs and the
  realtime publication are not in the snapshot. They live in `supabase/` and are
  replayed from there.
- **Object metadata.** Storage bytes come back; their `created_at` and `owner`
  do not.
- **`cron.job_run_details`, logs, analytics.** Not captured, not wanted.

## Restoring

Three steps, all required, in this order:

1. **Create the project.**
2. **Apply the schema** — `supabase/schema-baseline.sql`, then
   `supabase/bootstrap/*`, then `supabase/migrations/*` in filename order. This
   script restores **data, never schema**. Full procedure:
   [DEV-SETUP.md § Fresh-environment bootstrap](./DEV-SETUP.md#fresh-environment-bootstrap).
3. **Replay the data:**

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
node scripts/restore-prod.mjs backups/2026-09-15T… \
  --project-ref=<ref> --yes-i-know-this-overwrites
```

Optional: `--dry-run` (prints the plan, touches nothing), `--no-auth`,
`--no-storage`, `--resume-partial-restore`.

Order of operations inside the script: accounts first (every `account_id` in the
public tables points at `auth.users`, so they must exist before the first
insert), then the tables in the manifest's order, then the deferred columns from
the FK cycle, then the storage bytes. Ids are supplied explicitly and the id
GoTrue returns is **checked, not assumed** — if it ever ignored the requested
id, every foreign key in the backup would dangle, so the run stops before any
table is written.

### The safety rails, and why each exists

The destination of this script is by definition a database you are willing to
overwrite, so it is deliberately hard to point at the wrong one:

- `--yes-i-know-this-overwrites` must be typed in full.
- `--project-ref=<ref>` must match the ref in `SUPABASE_URL`. **The destination
  has to be named twice, by hand, from two different places** — that is the
  difference between restoring into the rebuilt project and restoring over a
  live one.
- **Every table in the manifest must be empty.** A restore is only defined
  against an empty project: merging a backup into live data would duplicate
  registrations and resurrect deleted rows. A live project always has rows, so
  this check is what stops the accident worth engineering against. Only a run
  that died halfway should use `--resume-partial-restore`, which upserts on top
  of what is already there (`merge-duplicates`, keyed on the manifest's primary
  keys).
- Pre-flight asks GoTrue's admin endpoint whether the key is really the service
  role — the export's "can you see RLS-hidden rows" question has no answer
  against an empty target, but the admin API 401s for an anon key.
- At the end, restored row counts are **compared against the manifest** rather
  than trusted, and any shortfall is printed and exits non-zero. A table that
  silently took fewer rows than the backup holds is the failure this script
  exists to make visible.

A format-1 backup (taken before 2026-09-15) has no `order`, no `deferred`, no
`primaryKeys`, no auth users and no storage. The script warns and tries anyway;
`seat_hold.batch_id` will probably break the run, and the accounts its rows
reference will not exist. Take a fresh export rather than relying on one.

## Rehearse it

**A restore nobody has rehearsed is not a restore.** The export has been run
since 2026-08; until 2026-09-15 nothing could put one back, so "we have a
backup" was an untested claim. The drill:

1. Create a scratch Supabase project (a free org allows 2 active projects, so
   there is room for exactly one).
2. Apply `schema-baseline.sql` + `bootstrap/*` + `migrations/*`.
3. `node scripts/restore-prod.mjs <dir> --project-ref=<scratch> --dry-run`, read
   the plan, then run it for real.
4. Record **the date and the row counts** here, delete the scratch project, and
   delete the backup directory.

| Drill date | Backup used | Result |
|---|---|---|
| _(not yet run)_ | | |

Until that table has a row in it, treat recovery as unproven.
