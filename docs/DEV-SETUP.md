# Development setup — the v1/v2 two-track scheme

TesujiReg runs on two parallel tracks while v2 is under development:

| | **v1 (live)** | **v2 (in development)** |
|---|---|---|
| Git branch | `main` | `v2` |
| Vercel | Production (real domain) | Preview: `tesuji-reg-git-v2-tesuji.vercel.app` |
| Supabase project | `tesujireg` (`ytgbimtjayecaxfyssta`) | `tesujireg-dev` (`TODO-dev-ref`) |
| Local env file | `.env` (only used by `next build`/`start`) | `.env.development` (used by `next dev`) |
| Data | **Real registrations — do not touch** | Disposable test data |

## Local development

`npm run dev` loads env files in this precedence (Next.js):

```
.env.development.local > .env.local > .env.development > .env
```

`.env.development` points at **tesujireg-dev**, so local dev never touches prod
by default. To deliberately run localhost against prod (read-only debugging),
create a temporary `.env.local` with the prod values — **and delete it when
done**: a forgotten `.env.local` silently overrides the dev pointer.

Two silent-failure traps:

- `NEXT_PUBLIC_DATA_BACKEND` unset → the app falls back to `MockDataLayer`
  (localStorage) without erroring. If the app "works" but nothing hits the
  network, check this first.
- All `NEXT_PUBLIC_*` vars are inlined at **build time**. Changing Vercel env
  vars does nothing until the next deployment.

Quick identity check: view-source of `/live` and look at
`window.__SUPABASE_URL` — it names the project the running build actually uses.

## Branch rules

- `main` = the live v1 site. **Hotfixes only.** Every push auto-deploys
  Production.
- `v2` = all new work. Every push auto-deploys a Preview against the dev DB
  (branch-scoped env vars in Vercel).
- After every change on `main` (or weekly): `git switch v2; git merge main;
  git push` — keep drift small.
- **Never merge `v2` → `main` before launch day.**

## Schema changes during v2

1. Author a new file in `supabase/migrations/` (next `YYYYMMDD_NNNN_name.sql`).
2. Apply it to **tesujireg-dev only** (Supabase MCP `apply_migration`; the CLI
   is blocked on this machine).
3. Regenerate `lib/data/database.types.ts` from the **dev** project.
4. Commit the SQL + types together on `v2`.

Migrations must be **additive / expand-contract**: new tables, nullable-or-
defaulted columns, new RPCs — never drop or rename anything the deployed v1
code reads. On launch day these same files run against prod *while v1 is still
serving*; additivity is what makes that safe. Destructive cleanup waits for a
post-launch "contract" migration.

Edge-function changes deploy to the **dev** project only until launch.

## Fresh-environment bootstrap

Rebuilding on an empty project takes three steps, in this order:

1. `supabase/schema-baseline.sql` — tables, types, RLS policies, buckets.
2. `supabase/bootstrap/0001_dashboard_functions.sql` — the 26 functions that
   were authored in the SQL editor and exist in no migration. Dumped from prod
   with `pg_get_functiondef()` and verified byte-for-byte by md5; regenerate
   with `scripts/dump-prod-functions.sql`.
3. `supabase/migrations/*.sql` in filename order.

`lib/rpc-coverage.test.ts` fails CI if the app calls an RPC that none of the
repo's SQL defines, so this stays honest as new functions are added.

Still **not** in the repo: the pg_cron schedule for `release_expired_holds`
and the realtime publication membership beyond what `20260702_0001` sets. A
rebuilt environment will not expire seat holds on a timer until that is added.

**Never apply bootstrap to prod** — the functions there are already live.

## Free-plan gotchas

- `tesujireg-dev` **auto-pauses after ~1 week idle**. Symptom: localhost/preview
  fetches fail or time out. Fix: restore the project (dashboard or MCP
  `restore_project`) — it is not an app regression.
- Supabase free orgs allow 2 active projects; both slots are now in use.

## Launch-day runbook (v2 → production)

1. Freeze `main`; final `git merge main` into `v2`; full verification pass on
   the v2 Preview.
2. Safety net: free plan has no PITR, so take a snapshot first —

   ```
   SUPABASE_URL=https://ytgbimtjayecaxfyssta.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service-role key> \
   node scripts/export-prod.mjs
   ```

   Writes one JSON file per table plus a row-count manifest into `backups/`
   (gitignored — it holds real personal data). The script refuses to run with
   an anon key: RLS would return empty arrays and hand you a backup that looks
   fine and restores nothing. It does **not** capture `auth.users` or storage
   objects (slips, banners, venue maps), so it is a data snapshot, not a full
   recovery image. `live_division` matters most here: 20260822_0004's backfill
   re-points existing rows and has no documented reverse.
3. Dry-run each new migration against prod as `begin; …; rollback;` via MCP.
4. Apply the new migration files to prod **in filename order** via
   `apply_migration`. On failure: fix forward; never down-migrate. v1 keeps
   serving throughout because migrations are additive.
   Outstanding as of 2026-09-04, in this order:
   `20260725_0001`, `20260822_0001`…`0004`, `20260904_0001`…`0003`.
   (`20260827_0001` is already applied, so the ledger will be non-monotonic —
   expected, not a problem.)

   The three `20260904_*` files were dry-run against production inside
   `begin; … rollback;` and their end state asserted, not just their syntax:
   - `0001_grant_hygiene` — closes the one unauthenticated write path
     (`_recompute_batch_total`) and the anon bulk-PII read
     (`search_go_player_database`), while leaving `submit_registration`,
     `withdraw_seat`, `swap_seat`, `release_batch` and `get_batch_public`
     executable by `authenticated` (each already gates on `auth.uid()`).
     Verified with `has_function_privilege` after applying in-transaction.
   - `0002_withdrawal_owner_read` — owner-select policy on `seat_withdrawal`.
   - `0003_admin_reopen_batch` — undo a confirm/reject. The rejected→reopen
     path re-acquires the seats `reject_registration` gave back, refusing with
     `INSUFFICIENT_SEATS` rather than overselling. Exercised end-to-end against
     a real confirmed batch (rejected, then reopened) inside a rolled-back
     transaction: `seats_taken` returned to exactly its original value and a
     second reopen correctly raised `NOT_REOPENABLE`.
5. Redeploy `supabase/functions/admin-reset` — **required, and strictly after
   step 4**. The deployed copy predates the scoped rewrite: it ignores
   `tournament_id` and calls the retained 3-arg RPC, so a Danger-Zone reset the
   UI labels "this tournament only" wipes *every* tournament. Until this step
   completes, treat `/admin/reset` as off-limits. Set `SLIPOK_*` secrets only if
   slip verification is being switched on.
6. `git switch main; git merge --ff-only v2; git push --no-verify origin main`
   → Production build (prod env vars unchanged). `--no-verify` is needed because
   a local pre-push hook blocks pushes to `main`; that hook is the guard against
   doing this accidentally, so do not remove it.
7. Smoke test prod:
   - `curl https://<domain>/api/health` → **200 with `"ok": true`**. This is the
     check that matters: it probes the columns and RPC overloads this code
     needs. Do *not* smoke-test by curling `/live/snapshot` for a 200 —
     `buildFullUpdate` coerces a failed query to `[]`, so a schema-mismatched
     deploy answers 200 with an empty board that looks like "no event yet".
   - `/live` renders divisions; server logs carry no `[live] … query failed`.
   - Incognito `/`: drafts are absent (0002).
   - `/admin/rules`: edit and save one section, then revert.
   - `window.__SUPABASE_URL` = prod ref; login, register through step B.
   - Verify the admin-reset function's version advanced (MCP
     `list_edge_functions`). Do not exercise the Danger Zone on prod.
8. Rollback: bad build → Vercel Instant Rollback (v1 still works against the
   migrated DB). Bad migration → additive objects are harmless to leave; land a
   fix-forward migration. Once v1 rollback is no longer needed, schedule the
   contract/cleanup migration and decide whether to pause or keep
   `tesujireg-dev`.
