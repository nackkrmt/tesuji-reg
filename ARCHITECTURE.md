# Architecture — TesujiReg

This document explains how TesujiReg is put together: the data-access seam, the
reactivity model, the Go-rank model, and the security model. For the Excel
rank-database formats see [docs/rank-databases.md](./docs/rank-databases.md).

## 1. The `DataLayer` seam

Every read and write in the app goes through **one TypeScript interface**,
`DataLayer` (`lib/data/types.ts`). There are two implementations:

| Implementation | Backing store | Use |
|---|---|---|
| `SupabaseDataLayer` (`lib/data/SupabaseDataLayer.ts`) | Supabase: Postgres + Auth + Storage + SECURITY DEFINER RPCs | production / real backend |
| `MockDataLayer` (`lib/data/MockDataLayer.ts`) | browser `localStorage` (+ a fake auth) | offline demo / local dev |

The active implementation is chosen **once** in `lib/data/index.ts` from the
`NEXT_PUBLIC_DATA_BACKEND` env var (default `supabase`; anything else → mock).
The React tree consumes the layer through a provider + hooks in
`lib/data/store.tsx`, so **UI components never branch on which backend is live** —
they just call `dl.listTournaments()`, `dl.reserveSeats(...)`, etc.

```
            ┌─────────────────────── React UI ───────────────────────┐
            │  pages (app/*)   components/*   useLiveQuery / useDataLayer │
            └───────────────────────────┬────────────────────────────┘
                                         │  one interface
                              ┌──────────▼──────────┐
                              │   DataLayer (types) │
                              └──────────┬──────────┘
                  NEXT_PUBLIC_DATA_BACKEND│  (lib/data/index.ts)
                       ┌─────────────────┴─────────────────┐
                       ▼                                     ▼
            SupabaseDataLayer                         MockDataLayer
        Postgres · Auth · Storage · RPC            localStorage · fake auth
```

**Why this matters:** features can be built and demoed entirely on the mock
layer, then "switched on" against Supabase with a single env flag, and both
implementations are held to identical behavior (including the anti-sandbagging
rank checks below).

## 2. Reactivity

`DataLayer` exposes `subscribe(listener)`. Both implementations call an internal
`notify()` after any mutation; the Supabase layer also bridges Supabase Auth
state changes into `notify()`. The React hook **`useLiveQuery`** (`lib/data/store.tsx`)
re-runs its query function whenever the layer notifies (and the mock layer also
fires across browser tabs via `storage` events). Components therefore stay live
without manual refetching.

> Gotcha learned the hard way: during Supabase session restore, a live query for
> the current profile can briefly return a stale `null`. Auth/profile **gates**
> (e.g. the `/register` layout) must use a one-shot `await dl.getMyProfile()`
> inside an effect, **not** `useLiveQuery`, to avoid a misfired redirect.

## 3. Go-rank model (`power_level` 0..25)

Rank is stored as a single integer `power_level`, higher = stronger:

| power_level | rank |
|---|---|
| 0 … 14 | 15 kyu … 1 kyu |
| 15 … 22 | 1 dan … 8 dan |

Rules (`lib/rank.ts`): `kyu n → 15 − n` (kyu **capped at 15**, never crosses into
dan), `dan n → 14 + n` (capped at 8 dan). There are no board-size entries — 15 kyu
is the floor. Helpers: `RANKS`/`RANK_BY_POWER` catalog,
`rankToPowerLevel(str)`, `powerToLabel(n)`, `isRankEligible(power, min, max)`,
`bandLabel(min, max)`. Categories carry optional `minPowerLevel`/`maxPowerLevel`
bounds (null = unbounded).

## 4. Security model

### RLS (Row-Level Security)
- `profile` and `managed_player` hold PII and are **owner-only**:
  `to authenticated using ((select auth.uid()) = id / owner_id)` for
  select/insert/update (+ delete on `managed_player`).
- The anon / publishable key can `SELECT` only `tournament` and `category`.
  Everything else goes through RPCs.

### SECURITY DEFINER RPCs
Privileged operations are Postgres functions that run with definer rights and
validate the caller themselves:
- **Admin RPCs** (tournament/category/registration management, rank-DB import,
  rank approvals) are guarded by a **passphrase** stored in
  `app_config.admin_secret`. The client sends it via `getAdminSecret()`
  (`lib/admin-auth.ts`). `reserve_seats` requires `auth.uid()` (granted to
  `authenticated`, revoked from `anon`).
- `auth.uid()` works **inside** SECURITY DEFINER (it reads the caller's JWT, not
  the function owner) — this is what makes owner-scoped checks possible there.

### Anti-sandbagging (the load-bearing bit)
A cheating client could POST a fake low rank to enter an easier division. To
prevent this, **`reserve_seats` ignores any client-sent rank**. It resolves the
*authoritative* `power_level` server-side from the caller's `profile`
(by `auth.uid()`) or `managed_player` (by `id` **and** `owner_id`), checks it
against the division's `min/max_power_level`, and only then deducts seats —
all-or-nothing. It snapshots the resolved value onto the seat row. Errors are
returned as `RANK_NOT_ELIGIBLE` / `RANK_REQUIRED` / `PLAYER_NOT_FOUND` /
`INVALID_SOURCE`. The `MockDataLayer` enforces the same rule for parity.

```
register (client)                 reserve_seats (SECURITY DEFINER)
  selects participants   ──────▶   auth.uid() required
  + division                       ├─ resolve AUTHORITATIVE power_level
  (client rank ignored)            │     profile by auth.uid()  / managed_player by id+owner_id
                                   ├─ isRankEligible(power, cat.min, cat.max)?   → RANK_NOT_ELIGIBLE
                                   ├─ FOR UPDATE seats; check not oversold       → all-or-nothing
                                   ├─ create batch (account_id = auth.uid())
                                   └─ snapshot power_level onto each seat
```

## 5. Backend (Supabase) reference

**Tables:** `tournament`, `category` (with a `seats_taken` counter + a
"not oversold" check constraint), `registration_batch`, `registration_seat`
(carries an embedded snapshot of each registrant so historical rows don't change
when a profile is later edited), `seat_hold`, `seat_hold_line`, `profile`,
`managed_player`, `app_config`, `go_player_database`.

**Key RPCs:**

| RPC | Purpose |
|---|---|
| `reserve_seats` | Reserve seats all-or-nothing with a 15-minute hold; enforces rank eligibility (§4) |
| `release_expired_holds` | Return seats from expired holds — run by **pg_cron** every minute, plus lazily on read |
| `search_go_player_database` | Match a Thai name against DAN/KYU/AWARD: exact → normalized → fuzzy (`pg_trgm` similarity > 0.4) |
| `replace_go_player_database_source` | Admin: replace **all** rows for one source (delete-then-insert) when importing an Excel file |
| `admin_list_pending_ranks` | Admin: list self-declared ranks awaiting approval (`rank_status='pending'` with a declared `power_level`) |
| `admin_set_rank_status` | Admin: approve / override a registrant's rank (`verified`), records reviewer + note + timestamp |

**Storage:** a public bucket holds tournament banners and PromptPay payment slips
(listing disabled).

**Migrations** were applied to the project via the Supabase MCP tooling, so this
repo does not necessarily carry local migration files — the schema/RPCs above are
the source of truth for what the backend must provide.

## 6. Registration flow (end to end)

1. **Gate** — `/register` requires login (→ `/login`) and a saved profile
   (→ `/profile`).
2. **Select participants** — "ตัวฉัน" (self) + saved managed players; add new
   players inline (persisted via `upsertMyPlayer`).
3. **Assign divisions** — pick a category per participant; ineligible divisions
   are greyed out client-side, and enforced server-side.
4. **Reserve** — `reserveSeats` deducts quota all-or-nothing and opens a 15-min
   hold (`registration_batch.account_id = auth.uid()`).
5. **Pay** — PromptPay QR for the exact amount + slip upload to Storage.
6. **Submit** — batch moves to `pending_review`.
7. **Admin** — confirms/rejects from `/admin/registrations`; confirmed
   registrants appear on `/participants`.
