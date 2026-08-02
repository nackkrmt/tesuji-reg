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

`supabase/bootstrap/` recreates the full schema (tables, all RPCs, policies,
storage buckets, cron, realtime) on an empty Supabase project — this is how
`tesujireg-dev` was provisioned, and it supersedes the old "base schema is not
in the repo" caveat. **Never apply it to prod.** If a hotfix migration lands on
prod before launch, refresh the affected bootstrap file too.

## Free-plan gotchas

- `tesujireg-dev` **auto-pauses after ~1 week idle**. Symptom: localhost/preview
  fetches fail or time out. Fix: restore the project (dashboard or MCP
  `restore_project`) — it is not an app regression.
- Supabase free orgs allow 2 active projects; both slots are now in use.

## Launch-day runbook (v2 → production)

1. Freeze `main`; final `git merge main` into `v2`; full verification pass on
   the v2 Preview.
2. Safety net: free plan has no PITR — export business-critical prod tables to
   JSON first (or upgrade to Pro for launch week).
3. Dry-run each new migration against prod as `begin; …; rollback;` via MCP.
4. Apply the new migration files to prod **in filename order** via
   `apply_migration`. On failure: fix forward; never down-migrate. v1 keeps
   serving throughout because migrations are additive.
5. Deploy updated edge functions to prod; set `SLIPOK_*` secrets if v2 needs
   real slip verification.
6. `git switch main; git merge v2; git push` → Production build (prod env vars
   unchanged).
7. Smoke test prod: `window.__SUPABASE_URL` = prod ref; login, register, admin,
   `/live`.
8. Rollback: bad build → Vercel Instant Rollback (v1 still works against the
   migrated DB). Bad migration → additive objects are harmless to leave; land a
   fix-forward migration. Once v1 rollback is no longer needed, schedule the
   contract/cleanup migration and decide whether to pause or keep
   `tesujireg-dev`.
