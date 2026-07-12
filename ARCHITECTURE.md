# Architecture — TesujiReg

This document explains how TesujiReg is put together: the data-access seam, the
reactivity model, the Go-rank model, the security model, and the live-competition
module. For the Excel rank-database formats see
[docs/rank-databases.md](./docs/rank-databases.md).

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

## 3. Go-rank model (`power_level` 0..22)

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

Ranks are **linked, not snapshotted** (`20260712_0001`): the canonical `go_person`
registry holds one row per normalized Thai-name pair with a **stable id** and a
**pre-resolved** `power_level` (dan-first; disagreeing namesakes → `is_ambiguous`,
skipped). `profile`/`managed_player` carry a durable `person_id` FK; `go_player_database`
stays the raw evidence store (its id is regenerated on every delete-then-insert
import, which is why `matched_go_player_id` alone was unreliable). RankPicker searches
`search_go_person` and links `person_id` on any pick (a not_found registrant gets an
`ensure_go_person` reservation that heals when the name is later imported). Each
import/sync (`admin_import_rank_database` / `admin_sync_player_ranks`) rebuilds the
registry (upsert, never delete — vanished names keep their power, flagged
`missing_since`), auto-links unlinked people by name, and pushes the resolved rank to
every linked person. Seat snapshots stay untouched; `admin_list_rank_conflicts` lists
live seats whose occupant's current rank now breaks the division band (see
`docs/rank-databases.md`).

## 4. Security model

### RLS (Row-Level Security)
- `profile` and `managed_player` hold PII and are **owner-only**:
  `to authenticated using ((select auth.uid()) = id / owner_id)` for
  select/insert/update (+ delete on `managed_player`).
- The anon / publishable key can `SELECT` only `tournament`, `category`,
  `go_institute`, and the live-competition tables (`live_division` / `live_match` /
  `live_standing` / `live_config` — public read for the `/live` page).
  Everything else goes through RPCs.

### SECURITY DEFINER RPCs
Privileged operations are Postgres functions that run with definer rights and
validate the caller themselves:
- **Admin RPCs** (tournament/category/registration management, rank-DB import,
  withdrawals, promo codes, …) call `_is_admin()` — true iff the caller's
  `auth.uid()` has a row `(account_id, 'admin')` in **`account_roles`**
  (migrations `20260705_0001/0002/0005`; composite PK, so one account can hold
  both `admin` and `judge`). The old shared secret was **deleted** from
  `app_config`; legacy `p_admin_secret` parameters are still accepted but
  **ignored** — `getAdminSecret()` (`lib/admin-auth.ts`) now returns `""` and the
  sessionStorage "admin" flag is a UI hint only. The frontend gates the `/admin`
  shell with `is_admin_me()`. Grant access via SQL:
  `insert into account_roles(account_id, role) values ('<uid>','admin');`
  The judge role (`'judge'`) gates the judge console (`judge_get_token`,
  `live_check_token`), and live-competition writes go through
  `_is_live_writer`-checked `live_*` RPCs (admin role OR the live token).
  `reserve_seats` requires `auth.uid()` (granted to `authenticated`, revoked
  from `anon`).
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
Since `20260708_0001`, `reserve_seats` also matches the registrant's identity by
**normalized Thai name across all accounts and managed players**
(`normalize_thai_name`) for the duplicate and combinable-division checks
(`DUPLICATE_REGISTRATION`), and `swap_seat` re-runs this full eligibility suite
when a seat's occupant changes.

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
when a profile is later edited; `withdrawn_at` marks withdrawn seats — the row
is kept so batch totals never change), `seat_hold`, `seat_hold_line`, `profile`,
`managed_player`, `app_config`, `go_player_database`. Added by the in-repo
migrations: `promo_code` / `promo_redemption`, `go_institute` / `institute_merge`,
`award_limit_exemption`, `account_roles` (per-account `admin`/`judge` roles),
`seat_withdrawal` (withdrawal snapshot + refund bank info + `refund_status`
`pending|refunded|denied`), and the live tables `live_division` / `live_match` /
`live_standing` / `live_config`.

**Key RPCs:**

| RPC | Purpose |
|---|---|
| `reserve_seats` | Reserve seats all-or-nothing with a 15-minute hold; enforces rank eligibility (§4) |
| `release_expired_holds` | Return seats from expired holds — run by **pg_cron** every minute, plus lazily on read |
| `search_go_person` | Match a Thai name against DAN/KYU/AWARD (exact → normalized → fuzzy, `pg_trgm` ≥ 0.68) **+ the canonical `go_person` row** each candidate resolves to (the durable link). The client auto-applies **only a single exact match**; normalized/fuzzy always require a manual pick |
| `ensure_go_person` | Reserve/fetch a `go_person` row for a name (used when a registrant is not_found, so the link survives until the name is imported) |
| `admin_import_rank_database` | Admin: replace **all** rows for one source (delete-then-insert) **+ refresh the registry + push resolved ranks to every linked person**, in one transaction (supersedes `replace_go_player_database_source` in the app) |
| `admin_sync_player_ranks` | Admin: re-resolve the registry and re-sync everyone's rank on demand (also auto-runs after each import; §3) |
| `admin_list_rank_conflicts` | Admin: live seats whose occupant's current rank now violates the division band (seat snapshots are never retro-edited) |
| `admin_list_pending_ranks` | Admin: list self-declared ranks awaiting approval (`rank_status='pending'` with a declared `power_level`) |
| `admin_set_rank_status` | Admin: approve / override a registrant's rank (`verified`), records reviewer + note + timestamp |
| `withdraw_seat` / `swap_seat` | Owner: withdraw one seat (capacity returned, batch total unchanged, refund info snapshotted) / replace a seat's occupant, optionally moving to a same-fee division — full eligibility re-check |
| `admin_list_withdrawals` / `admin_set_withdrawal_status` | Admin: refund worklist; set `refund_status` `pending`/`refunded`/`denied` — `refunded` requires a slip-proof path (private bucket), locks the row permanently (`LOCKED` / `SLIP_REQUIRED` guards), and is netted out of the dashboard revenue at display time |
| `is_admin_me` | Does the current session hold the `admin` role? (frontend gate) |
| `admin_set_judge` / `admin_list_judges` | Admin: grant/revoke and list the `judge` role |
| `live_*` family + `live_get_token` / `judge_get_token` / `live_check_token` | Live-competition writes (gated by `_is_live_writer`) and token read/validation for the judge console & pairing tool |

**Storage:** the public `tesuji` bucket holds tournament banners (listing
disabled, mime/size limited); rules (กฎ กติกา) are stored as JSON sections in
the `tournament.rules_text` column, not as files. Each section holds an ordered
list of typed content blocks (`heading` / `paragraph` / `list` / `table` /
`divider` / `callout` — `RulesBlock` in `lib/data/types.ts`), authored with the
block editor at `/admin/rules` (`components/admin/rules/RulesBlockEditor.tsx` +
`RulesTableEditor.tsx`) and rendered verbatim on `/rules`
(`components/rules/RulesBlocks.tsx`) — no text-convention parsing at render
time. Sections carrying only the pre-block-editor line-based `items` (legacy
payloads) still render read-only via a fallback path in `InfoPageClient.tsx`.
Payment slips live in the **private
`tesuji-slips` bucket** (migration `20260701_0005`): insert-only for
authenticated users, no select policy — admins view slips via short-lived signed
URLs minted by the `verify-slip` edge function (`action: "view"`), which reads
with the service role.

**Migrations:** the repo carries `supabase/migrations/` — **29 files,
`20260630_0001` → `20260712_0001`** — but only as an **additive changelog**
(promo codes → security hardening → live competition → judge/admin roles →
1-kyu award ceiling → cross-account duplicate check → withdraw/swap → person
lock → go_person rank registry) on top of a
base schema that lives only in the live Supabase project. A fresh
`supabase db push` against an empty project fails (FKs/enums reference objects
the migrations never create); dump the base schema from the live project first.

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
8. **After confirmation** — from `/my-registrations` the owner can **withdraw**
   a single seat (anytime; capacity returned, batch total unchanged; the admin
   resolves the refund on `/admin/withdrawals` — marking it `refunded` requires
   an attached transfer-slip proof, locks the row permanently, and nets the fee
   out of the dashboard revenue at display time) or **swap** the seat's occupant
   (until registration closes; full server-side re-validation, optionally moving
   to a same-fee division).

## 7. Live-competition module

A deliberately separate subsystem for live results and judging, kept **outside**
the `DataLayer` seam so its API stays compatible with the MacMahon-TESUJI
pairing `.jar` and the legacy v1 clients:

- `/live` (public results, raw HTML served by a route handler; assets in
  `public/live-assets/`) + `/live/snapshot` (JSON state snapshot).
- `/judge/[key]` — judge console; `key` is the `live_token` validated by
  `live_check_token`, and the user must also be signed in with the `judge` role.
- `/api/divisions/*` — REST endpoints (rounds / matches / result / standings /
  checkin / force) used by the pairing program.
- Data: `live_division` / `live_match` / `live_standing` / `live_config` —
  public `SELECT` (plus Supabase Realtime); **all writes** go through the
  `live_*` RPCs gated by `_is_live_writer` (admin role OR live token).
- Admin control lives at `/admin/live` (shared shell with the registration app).

## 8. UI overlays (Sheet / DropdownPanel) — portal past the glass

The liquid-glass surfaces (`.glass`, `.glass-card`, `.glass-strong` in
`app/globals.css`) all use `backdrop-filter`. Per the CSS spec, an element with
a backdrop-filter becomes the **containing block for `position: fixed`
descendants** — and it breaks any *nested* backdrop blur. An overlay rendered
inside a glass `Card` therefore pins itself to the card instead of the viewport
and loses its frosting (this bit us: the withdraw/swap sheets opened off-center
and see-through).

Rule: every floating overlay is **portaled to `<body>`** so no glass ancestor
can affect it:

- **`Sheet`** (`components/ui/Sheet.tsx`) — `createPortal` to `document.body`.
  Bottom sheet with a grab handle on mobile, centered dialog ≥ `sm`. Its
  `.glass-strong` surface is intentionally **near-opaque**
  (`rgba(16,21,33,0.94)`) so text stays legible even where `backdrop-filter` is
  unsupported or throttled — the blur is only a depth enhancement.
- **`DropdownPanel`** (`components/ui/DropdownPanel.tsx`) — already portaled
  (`.dropdown-panel`). Both layers sit at `z-60`; a dropdown opened from inside
  a sheet mounts **after** the sheet under `<body>`, so it paints above it
  (later sibling wins at equal z-index).

Because of the portal, components may render `<Sheet>` anywhere in their tree —
including inside a glass `Card` — without positioning or legibility surprises.
