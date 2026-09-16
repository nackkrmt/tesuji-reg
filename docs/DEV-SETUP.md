# Development setup — one track

TesujiReg runs on **one branch and one Supabase project**:

| | |
|---|---|
| Git branch | `main` — every push auto-deploys **production** |
| Vercel | one Production deployment; no preview environment |
| Supabase project | `tesujireg` (`ytgbimtjayecaxfyssta`) — the only one |
| Data | **real registrations** |

The `v1`/`v2` two-track scheme this file used to describe was retired on
2026-09-07, and the second Supabase project it named is no longer part of the
workflow. There is nowhere to rehearse a change against real-shaped data unless
you build one (see [Fresh-environment bootstrap](#fresh-environment-bootstrap)),
which is exactly what the restore drill in
[BACKUP-RESTORE.md](./BACKUP-RESTORE.md) is for. Treat that as the consequence
of single-track: the safety has to come from the mock backend, the test suite
and `begin; … rollback;`, not from a staging copy.

The finished v2 launch procedure lives in
[history/2026-09-05-v2-launch.md](./history/2026-09-05-v2-launch.md). Running an
event is [EVENT-DAY.md](./EVENT-DAY.md).

## Local development

Node **24** (`package.json` `engines`, `.nvmrc`, CI). `nvm use` picks it up.

```bash
npm install
npm run dev          # localStorage mock — no env file, no backend, no risk
npm run dev:supabase # the real project named in .env — prints which one first
```

`npm run dev` hard-codes `NEXT_PUBLIC_DATA_BACKEND=mock` in the script itself.
This is the change that matters most in this file: `dev` used to load `.env` and
point a local dev server at production silently, and this document described a
dev/prod env split that did not exist. Reaching the real database is now an
explicit choice, and `scripts/warn-live-dev.mjs` makes the choice visible — it
reads `NEXT_PUBLIC_SUPABASE_URL` in Next.js precedence order and prints the
**project ref** (never the key), in red when that ref is production.

Env-file precedence, if you need to override `.env` temporarily:

```
.env.development.local > .env.local > .env.development > .env
```

All four are gitignored. Delete a temporary override when you are done — a
forgotten `.env.local` silently wins over everything else.

Three silent-failure traps:

- `NEXT_PUBLIC_DATA_BACKEND` must be exactly `supabase` or `mock`. There is no
  default: with a Supabase URL configured, anything else throws at build time
  in `lib/data/index.ts` on purpose, because the mock's fake auth makes every
  signed-in user an admin. A stray space or capital trips the guard.
- All `NEXT_PUBLIC_*` vars are inlined at **build time**. Changing Vercel env
  vars does nothing until the next deployment. The same inlining is why the
  mock-mode screenshot recipe needs a separate copy of the repo: a warm `.next`
  cache still holds the old URL.
- On the mock, "it works but nothing hits the network" is the expected
  behaviour, not a bug. Check which backend you are on before debugging a fetch.

Quick identity check: view-source of `/live/<tid>` and look at
`window.__SUPABASE_URL` — it names the project the running build actually uses
(alongside `window.__LIVE_TID`, the tournament that board is scoped to).

## Branch and deploy rules

- `main` is production. There is no staging. Push means deploy.
- A local pre-push hook blocks pushes to `main`; that hook is the guard against
  deploying by reflex, so keep it and pass `--no-verify` when you mean it.
- `.github/workflows/ci.yml` runs `lint` → `typecheck` → `test` → `build`, plus
  `deno check` for the edge functions and an advisory `npm audit`. It does
  **not** gate the deploy — Vercel builds the same push in parallel. Making it
  a real gate needs branch protection plus a Vercel "Ignored Build Step".
- `.github/workflows/health.yml` curls `/api/health` every 15 minutes, which is
  the only thing watching production between releases.

Two dependency facts worth knowing before a hotfix under time pressure:

- `xlsx` does not come from the npm registry (that package is unmaintained;
  SheetJS distributes its own patched builds). It used to install straight from
  `cdn.sheetjs.com`, which put a third party's uptime in the path of every
  `npm ci` — CI, every Vercel build, and a hotfix mid-tournament. Since
  2026-09-15 the tarball is **vendored at `vendor/xlsx-0.20.3.tgz`** and
  `package.json` points at `file:vendor/…`. The lockfile keeps the original
  sha512, so `npm ci` still verifies the bytes and now needs no network. To
  upgrade: download the new tarball, check its sha512 against the lockfile entry
  it replaces, commit it, delete the old one.
- The only finding left in `npm audit --omit=dev` is the **postcss copy bundled
  inside `next`** (build-time, our own CSS as input). No 15.x release fixes it;
  `npm audit fix --force` wants `next@16`, a breaking change. Left on purpose —
  the CI audit step is `continue-on-error` and fails only on a *new*
  critical in a runtime dependency. The per-advisory triage of the old Next 14
  CVEs (AVIF image RCE, Windows path RCE, middleware bypass, Server-Action
  SSRF, the RSC DoS class) is moot: the Next 15 upgrade landed.

## Schema changes

1. Author a new file in `supabase/migrations/`, named
   `YYYYMMDD_NNNN_snake_name.sql`, sorting after the last one. Start it with a
   comment block explaining **why** it exists — the defect and its consequence
   — in the voice of the existing files.
2. Dry-run it against prod inside `begin; … rollback;` via the Supabase MCP
   (`execute_sql`). Assert the *end state*, not just that the SQL parses.
3. Apply with MCP `apply_migration`. The Supabase CLI is blocked on the
   maintainer's machine, which is why everything here is "paste through the
   MCP" rather than `supabase db push`.
4. Regenerate `lib/data/database.types.ts` if table shapes changed, and commit
   the SQL and the types together.

Migrations are **additive / expand-contract**: new tables, nullable-or-defaulted
columns, new RPCs. Never drop or rename something the currently deployed code
reads — the deployed build keeps serving while the migration runs. Destructive
cleanup is its own later migration.

`CREATE FUNCTION` grants EXECUTE to `PUBLIC`, so every function you create or
replace must be followed by
`revoke all on function public.<name>(<args>) from public, anon, authenticated;`
and then the grants it should have. **Naming `public` in that revoke is
mandatory** — omitting it is a live bug this repo has already shipped once
(`_is_live_writer`, re-opened to anon by `20260908_0001` and closed again by
`20260915_0001`).

PostgREST resolves overloads by signature, so a `create or replace` that
changes the argument list silently creates a **second** overload instead of
replacing the first. Drop the old signature explicitly when an argument list has
to change (`20260915_0005` does this for `live_submit_result`).

### Deploy order is per-migration, and it is not always "SQL first"

Some of this set must ship in a specific order relative to the frontend. Read
each file's header; the current ones are:

| Migration | Order |
|---|---|
| `20260915_0001_storage_and_grant_hardening` | **Frontend first.** The new slip policy rejects an upload written to the bucket root, which is what the older `uploadSlip` did. Ship the build that writes `<uid>/<file>`, confirm one real upload, then apply. Applied the other way round, every slip upload fails in between. |
| `20260915_0005_live_replace_round_preserves_results` | **SQL first.** The judge console sends the two new optional arguments; PostgREST answers `PGRST202` for arguments a function does not have. |
| `20260915_0006_resubmit_and_server_clock` | **SQL first**, same reason (new RPCs the build calls). |

Those pull in opposite directions, so there is no single "apply everything, then
push" or "push, then apply everything" that avoids a broken window. This
three-step order has none, and is the one to use:

1. **Apply `0002`, `0003`, `0004`, `0005`, `0006`** — everything except `0001`.
   All five are safe against the build that is currently deployed: `0002` and
   `0004` change nothing a running client calls differently, `0003`'s new slip
   check accepts the bucket-root names today's client still writes (that is why
   `_is_slip_path` allows both shapes — and that validator is defined in `0003`
   itself, not in `0001`, precisely so this split order leaves no window where a
   function is called before it exists), and `0005`/`0006` only add optional
   arguments and new functions.
2. **Push `main`.** Vercel deploys the build that writes slips to `<uid>/…` and
   calls the new RPCs, which step 1 has already taught the database.
3. **Apply `0001`.** It tightens storage to `<uid>/…` only — which the build from
   step 2 already satisfies. Upload one slip through the real form first.

Then regenerate `lib/data/database.types.ts` and delete the two temporary casts
that exist only because the generated types predate these migrations (they are
commented as such, in `app/api/divisions/[id]/result/route.ts` and
`SupabaseDataLayer.resubmitRegistration`).

Never run any step mid-tournament.

### What the dry-runs showed (2026-09-15)

Each migration was executed against production inside `begin; … rollback;` and
the end state asserted before the rollback. Row counts were re-checked
afterwards and were identical, so nothing below touched live data.

| Checked | Result |
|---|---|
| `0001` draft-hiding | anon sees the published board unchanged (11 divisions / 449 matches / 162 participants); with the owning tournament flipped to `draft`, anon sees 0/0/0 and `list_participants` returns `[]` |
| `0001` grants | `anon` loses INSERT on `registration_batch`; `authenticated` loses TRUNCATE on `profile` but keeps the UPDATE/INSERT the app needs |
| `0001` oracles | `live_check_token` gone, `_is_live_writer` not executable by `anon` |
| `0002` backfill | flagged self-declared ranks go 6 → 11 profiles and **7 → 19** managed players (the file header says 17; 19 is what prod actually produces). Nothing currently flagged becomes unflagged |
| `0002` trigger order | `trg_*_autolink_person` sorts before `trg_*_rank_flag`, so the flag reads the person the autolink just resolved. Verified end to end: a client asserting `rank_self_declared = false` is overridden, and a 15-kyu claimed against a listed rank is flagged |
| `0003` `delete_category` | refuses all 7 live categories; the counting probe confirms the new guard is strictly stronger than `seats_taken > 0` |
| `0004` permissions | the migration role **can** purge `cron.job_run_details` (132,791 → 10,080 rows, ~20 MB of a 47 MB database) and schedule the nightly job |
| `0005` on real data | re-exporting an unchanged pairing preserved all 5 entered results; re-seating one table cleared only that table; a table omitted from the payload was still deleted |
| `0006` | `resubmit_registration` created with the right signature and grants; `_is_slip_path` accepts both slip shapes and rejects traversal, URLs and nested folders |

Not executed: the `reserve_seats` body in `0002` and the rest of `0003`. Their
signatures are covered by `lib/rpc-coverage.test.ts`, which replays every
create/drop in filename order and checks the arguments each `.rpc()` call sends.
Apply those two singly — `apply_migration` is transactional, so a mistake aborts
without leaving a partial change.

### What is applied, and what is not

Check the ledger rather than trusting this list:

```sql
select version, name from supabase_migrations.schema_migrations
order by version desc limit 12;
```

As of 2026-09-15 the newest applied entry is `roster_registrations`
(`20260912103750`). The six `20260915_*` files in this repo are authored and
reviewed but **not yet applied to production**. The ledger also holds two
entries with no repo file (`live_force_pairing`, `live_match_score_text`) and
its apply order is not filename order (`award_xml_append` was applied before
`live_write_guards_and_admin_gate`) — both are known and harmless: nothing in
either pair shares objects, and the end state matches the repo.

## Fresh-environment bootstrap

Rebuilding on an empty project runs these, in this order:

1. `supabase/schema-baseline.sql` — tables, types, RLS policies, buckets. A
   2026-07-11 dump from prod, hand-corrected since (the eight money columns are
   `numeric(10,2)`, as prod has always had them; replaying the migrations never
   fixed that because the tables are created `if not exists`).
2. `supabase/bootstrap/0000_prereq_functions.sql` — `_is_admin`, which every
   admin RLS policy from `20260630_0002` onward calls. It was authored in the
   dashboard, so no migration creates it, and `20260702_0001` resolves it at
   `CREATE` time from a SQL-language body: without this file the run dies with
   `function public._is_admin(text) does not exist`.
3. `supabase/bootstrap/0001_dashboard_functions.sql` — the other functions
   authored in the SQL editor that exist in no migration. Regenerate with
   `scripts/dump-prod-functions.sql`.
4. `supabase/bootstrap/0002_operational_objects.sql` — the pg_cron schedule for
   `release_expired_holds` and the realtime publication membership. Without it a
   rebuilt environment never expires seat holds on a timer.
5. `supabase/bootstrap/0003_storage_objects.sql` — the buckets and every
   `storage.objects` policy. These were dashboard-authored too, and
   `schema-baseline.sql` contains no `storage` at all, so before this file a
   rebuilt environment came up with no public bucket and every banner and
   venue-map upload failed. It states the posture **after**
   `20260915_0001`, not the open policy prod ran until then.
6. `supabase/migrations/*.sql` in filename order.

`lib/rpc-coverage.test.ts` fails CI if the app calls an RPC that none of the
repo's SQL defines, so step 3 stays honest as new functions are added.

**The baseline and the migrations overlap.** `schema-baseline.sql` is a
2026-07-11 dump, so it already contains the end state of every migration up to
`20260709_0004`. Replaying those files on top of it raises "already exists" on
tables, columns, constraints and policies — expected, and safe to skip. Nothing
dated `20260710` or later may be skipped, and a failing `create function` is
never skippable at any date: functions are `create or replace`, so an error
there is a real error.

This is the weakest part of the setup and it is worth saying plainly: the
procedure asks an operator to run ~25 files that partially fail and to judge
each error. It works — the memory of the last rebuild says so only after two
repo fixes — but it is a multi-hour manual exercise with a real chance of a
silently skipped statement. The durable fix is to regenerate a single baseline
from a current `pg_dump --schema-only --no-owner` and move everything dated
before it into a `_applied-before-baseline/` folder kept for history only,
leaving `bootstrap/0002` and `0003` as the extra steps.

**Never apply the baseline or the bootstrap to prod** — everything in them is
already live there.

### Comparing prod against the repo

`supabase/bootstrap/0001_dashboard_functions.sql` says its definitions were
"verified byte-for-byte … md5", and `scripts/dump-prod-functions.sql` says the
local half of that check lives in `lib/rpc-coverage.test.ts`. Neither is true
today: no md5 value is recorded anywhere in the repo, and that test only
regex-matches function names. Comparing raw `pg_proc.prosrc` against the repo is
also misleading — of 36 money/security-critical functions, 21 match exactly and
15 differ **only in `--` comments and whitespace**, because what was applied was
a comment-trimmed variant (several ledger entries literally say "See
supabase/migrations/… for the full …"). No functional drift was found in any of
them. So strip comments before comparing:

```sql
select p.proname,
       md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'),
                          '\s', '', 'g')) as normalized_md5
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname;
```

Migrations that redefine a bootstrap function later (`20260908_0001`,
`20260915_*`) make the bootstrap copy stale for those names by design — the
migration is the newer truth, and a fresh environment replays it in step 6.

## Dashboard checklist

Things SQL cannot set, and which a rebuilt or freshly configured project needs:

- **Authentication → Sign In / Providers → Email → "Confirm email" OFF.** With
  it on, signup lands on the app's "check your email" screen instead of a
  session.
- **Custom SMTP, before registration closes.** The app's only outbound mail is
  Supabase Auth's password-reset/confirm message, and with no custom SMTP the
  built-in sender is rate-limited **for the whole project** to a handful of
  messages an hour (`supabase/config.toml`'s local default is `email_sent = 2`,
  and `[auth.email.smtp]` is commented out). On the day registration closes and
  again on competition morning, many parents hit "forgot password" at once;
  without SMTP most of those mails silently never arrive and the support load
  lands on one organiser. A Resend free tier is enough. Then raise
  Authentication → Rate Limits → "Rate limit for sending emails" to match.
- **Edge function secrets** — `SLIPOK_API_KEY` + `SLIPOK_BRANCH_ID` only if slip
  verification is being switched on. Without them `verify-slip` answers with a
  simulated `demo` status, which is a usable state, not an error.

## Edge functions

Four functions, deployed by hand (MCP `deploy_edge_function` or
`supabase functions deploy <name>`), which is why the repo can drift from what
is live. Deployed versions on `ytgbimtjayecaxfyssta`, read 2026-09-15:

| Function | Version | `verify_jwt` |
|---|---|---|
| `verify-slip` | 10 | false |
| `sync-go-database` | 9 | false |
| `admin-reset` | 7 | true |
| `purge-slips` | 6 | true |

Re-read those with MCP `list_edge_functions` rather than trusting the table;
the point of writing them down is to notice when a redeploy did not happen.
`deno task --config supabase/functions/deno.json check` is the only check that
understands their imports — `tsc` and ESLint both exclude the directory.

## Backups and retention

Full procedure, including what a backup does **not** contain, in
[BACKUP-RESTORE.md](./BACKUP-RESTORE.md). The two rules that belong here:

- The free plan has **no point-in-time recovery**. Before any migration run,
  `node scripts/export-prod.mjs` is the only way back.
- `backups/` holds real personal data — names, phone numbers, dates of birth,
  refund bank details and the payment slip images — as plain JSON and plain
  files on a laptop. It is gitignored, which is not the same as protected.
  Keep the directory **encrypted at rest** (`age`, `gpg --symmetric`, or an
  encrypted volume) and **delete it once the drill or the migration run is
  over**. Under PDPA those copies are the organiser's responsibility, exactly
  like the originals.

Server-side retention is the `purge-slips` edge function: for a tournament that
is `status='closed'` and whose competition date is older than the window
(default 90 days, minimum 30), it deletes the slip objects, nulls the columns
that pointed at them and blanks the bank fields of resolved refunds. A call with
no body is a **dry run** that reports what it would delete; `{"apply": true}`
is what deletes. It needs an admin JWT, or the service-role key as the bearer
token so a scheduler can drive it.

`cron.job_run_details` also needed a retention job of its own — pg_cron writes a
row per minute and never deletes them, and at audit time that table was 44% of
the database. `20260915_0004` schedules a weekly sweep keeping 7 days.

## Free-plan gotchas

- **No PITR.** See above.
- A project **auto-pauses after ~1 week idle**. Symptom: fetches fail or time
  out. Fix: restore the project (dashboard or MCP `restore_project`) — it is not
  an app regression. Production is busy enough not to pause; a scratch project
  built for a drill will.
- A free org allows **2 active projects**, so a rebuild-and-restore drill has
  room for exactly one scratch project at a time. Delete it afterwards, along
  with the backup directory you restored from.
- Storage counts toward the 500 MB tier and nothing used to remove anything
  from it: every replaced banner stayed in the bucket (no DELETE policy until
  `20260915_0001`) and slips were never purged (until `purge-slips`). ~100
  stray 10 MB uploads exhausted the tier, after which slip uploads fail and
  registration stops.
