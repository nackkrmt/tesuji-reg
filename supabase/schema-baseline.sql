-- ============================================================================
-- BASE SCHEMA REFERENCE — dumped from the live project `tesujireg`
-- (ytgbimtjayecaxfyssta) on 2026-07-11.
--
-- ⚠ REFERENCE ONLY — DO NOT APPLY. The base tables were created in the
-- Supabase dashboard before this repo adopted migrations, so no migration
-- file creates them. This dump exists so the schema and its RLS posture can
-- be reviewed (and a fresh environment reconstructed) from code. Functions,
-- triggers, and later changes live in supabase/migrations/*.
--
-- Security posture captured here (verified against pg_policies / grants):
--   • Every public table has RLS ENABLED.
--   • Tables with NO policy are default-deny via PostgREST — in particular
--     app_config (holds live_token) is unreadable by anon/authenticated;
--     it is only reached through SECURITY DEFINER functions.
--   • Registration tables (registration_*, seat_hold*, promo_*, ...) also
--     have no direct policies: all access goes through RPCs.
--   • go_player_database additionally has its SELECT grant revoked
--     (20260701_0002_go_database_lockdown.sql).
-- ============================================================================

-- ── enums ───────────────────────────────────────────────────────────────────
create type hold_status as enum ('active','consumed','released','expired');
create type promptpay_target_type as enum ('phone','national_id','merchant_qr');
create type registration_kind as enum ('self','group');
create type registration_status as enum
  ('draft','pending_payment','pending_review','confirmed','rejected','expired','cancelled');
create type title_prefix as enum ('นาย','นาง','นางสาว','เด็กชาย','เด็กหญิง','อื่นๆ');
create type tournament_status as enum ('draft','published','closed');

-- ── tables ──────────────────────────────────────────────────────────────────

create table public.tournament (
  id uuid not null default gen_random_uuid(),
  name_th text not null,
  banner_url text,
  competition_date text not null default '',
  location_text text not null default '',
  location_maps_url text not null default '',
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  schedule_text text not null default '',   -- JSON carrier (lib/schedule.ts)
  rules_text text not null default '',      -- JSON carrier (lib/rules.ts)
  promptpay_target_type promptpay_target_type not null default 'phone',
  promptpay_target_value text not null default '',
  status tournament_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_pkey primary key (id)
);

create table public.category (
  id uuid not null default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  code text not null,
  name text not null,
  skill_level text not null default '',
  capacity integer not null check (capacity >= 0),
  seats_taken integer not null default 0 check (seats_taken >= 0),
  fee_thb numeric not null default 0 check (fee_thb >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  min_power_level integer check (min_power_level is null or (min_power_level between 0 and 25)),
  max_power_level integer check (max_power_level is null or (max_power_level between 0 and 25)),
  min_age integer,
  max_age integer,
  combinable_category_ids uuid[] not null default '{}',
  constraint category_pkey primary key (id),
  constraint category_tournament_id_code_key unique (tournament_id, code),
  constraint category_power_bounds_chk check
    (min_power_level is null or max_power_level is null or min_power_level <= max_power_level),
  constraint seats_not_oversold check (seats_taken <= capacity)
);
create index idx_category_tournament on category (tournament_id);

create table public.profile (
  id uuid not null references auth.users(id) on delete cascade,
  title_prefix title_prefix not null,
  title_custom text,
  first_name_th text not null,
  last_name_th text not null,
  first_name_en text not null,
  last_name_en text not null,
  has_middle_name boolean not null default false,
  middle_name_th text,
  middle_name_en text,
  mobile_phone text not null,
  date_of_birth date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  power_level integer check (power_level is null or (power_level between 0 and 25)),
  rank_status text not null default 'pending' check (rank_status in ('verified','pending')),
  matched_go_player_id uuid references go_player_database(id) on delete set null,
  rank_reviewed_by text,
  rank_reviewed_at timestamptz,
  rank_review_note text,
  province text,
  institute_id uuid references go_institute(id),
  institute_name text,
  pdpa_consent boolean not null default false,
  pdpa_consent_at timestamptz,
  constraint profile_pkey primary key (id),
  constraint profile_check check (title_prefix <> 'อื่นๆ' or title_custom is not null),
  constraint profile_check1 check
    ((not has_middle_name) or (middle_name_th is not null or middle_name_en is not null))
);

create table public.managed_player (
  id uuid not null default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- person columns identical to profile (title/name/dob/rank/institute/pdpa)
  title_prefix title_prefix not null,
  title_custom text,
  first_name_th text not null,
  last_name_th text not null,
  first_name_en text not null,
  last_name_en text not null,
  has_middle_name boolean not null default false,
  middle_name_th text,
  middle_name_en text,
  mobile_phone text not null,
  date_of_birth date not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  power_level integer check (power_level is null or (power_level between 0 and 25)),
  rank_status text not null default 'pending' check (rank_status in ('verified','pending')),
  matched_go_player_id uuid references go_player_database(id) on delete set null,
  rank_reviewed_by text,
  rank_reviewed_at timestamptz,
  rank_review_note text,
  province text,
  institute_id uuid references go_institute(id),
  institute_name text,
  pdpa_consent boolean not null default false,
  pdpa_consent_at timestamptz,
  constraint managed_player_pkey primary key (id),
  constraint managed_player_check check (title_prefix <> 'อื่นๆ' or title_custom is not null),
  constraint managed_player_check1 check
    ((not has_middle_name) or (middle_name_th is not null or middle_name_en is not null))
);
create index idx_mp_owner on managed_player (owner_id) where archived_at is null;

create table public.registration_batch (
  id uuid not null default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  kind registration_kind not null,
  submitter_phone text not null,
  submitter_name text,
  status registration_status not null default 'draft',
  hold_id uuid references seat_hold(id),
  total_amount_thb numeric not null default 0,
  payment_slip_url text,               -- bare object path in the PRIVATE slip bucket
  admin_note text,
  reference_code text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid references auth.users(id),
  slip_verify_status text,
  slip_verify_data jsonb,
  slip_verified_at timestamptz,
  promo_code text,
  promo_kind text,
  promo_value numeric,
  discount_thb numeric not null default 0,
  constraint registration_batch_pkey primary key (id)
);
create index idx_batch_account on registration_batch (account_id);
create index idx_batch_tournament on registration_batch (tournament_id, status);

create table public.registration_seat (
  id uuid not null default gen_random_uuid(),
  batch_id uuid not null references registration_batch(id) on delete cascade,
  category_id uuid not null references category(id) on delete cascade,
  fee_thb_snapshot numeric not null,
  title_prefix title_prefix not null,
  title_custom text,
  first_name_th text not null,
  last_name_th text not null,
  first_name_en text not null,
  last_name_en text not null,
  has_middle_name boolean not null default false,
  middle_name_th text,
  middle_name_en text,
  mobile_phone text not null,
  date_of_birth date not null,
  created_at timestamptz not null default now(),
  source_kind text,                    -- 'self' | 'managed_player'
  source_player_id uuid,
  power_level integer check (power_level is null or (power_level between 0 and 25)),
  province text,
  institute_id uuid references go_institute(id),
  institute_name text,
  pdpa_consent boolean not null default false,
  pdpa_consent_at timestamptz,
  withdrawn_at timestamptz,
  constraint registration_seat_pkey primary key (id),
  constraint registration_seat_check check (title_prefix <> 'อื่นๆ' or title_custom is not null),
  constraint registration_seat_check1 check
    ((not has_middle_name) or (middle_name_th is not null or middle_name_en is not null)),
  constraint seat_field_lengths check (
    char_length(coalesce(first_name_th,''))  <= 100 and
    char_length(coalesce(last_name_th,''))   <= 100 and
    char_length(coalesce(first_name_en,''))  <= 100 and
    char_length(coalesce(last_name_en,''))   <= 100 and
    char_length(coalesce(middle_name_th,'')) <= 100 and
    char_length(coalesce(middle_name_en,'')) <= 100 and
    char_length(coalesce(title_custom,''))   <= 50 and
    char_length(coalesce(mobile_phone,''))   <= 20)
);
create index idx_seat_batch on registration_seat (batch_id);
create index idx_seat_cat on registration_seat (category_id);

create table public.seat_hold (
  id uuid not null default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  batch_id uuid references registration_batch(id) on delete cascade,
  status hold_status not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  constraint seat_hold_pkey primary key (id)
);
create index idx_hold_sweep on seat_hold (status, expires_at);

create table public.seat_hold_line (
  id uuid not null default gen_random_uuid(),
  hold_id uuid not null references seat_hold(id) on delete cascade,
  category_id uuid not null references category(id) on delete cascade,
  seats integer not null check (seats > 0),
  constraint seat_hold_line_pkey primary key (id)
);
create index idx_holdline_hold on seat_hold_line (hold_id);
create index idx_holdline_cat on seat_hold_line (category_id);

create table public.seat_withdrawal (
  id uuid not null default gen_random_uuid(),
  seat_id uuid not null references registration_seat(id) on delete cascade,
  batch_id uuid not null references registration_batch(id) on delete cascade,
  tournament_id uuid not null references tournament(id) on delete cascade,
  account_id uuid references auth.users(id),
  person_name text not null,
  category_id uuid references category(id) on delete set null,
  category_label text not null,
  fee_thb numeric not null,
  batch_reference text not null,
  reason text,
  bank_name text not null,
  bank_account_no text not null,
  bank_account_name text not null,
  refund_status text not null default 'pending'
    check (refund_status in ('pending','refunded','denied')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  refund_slip_url text,
  constraint seat_withdrawal_pkey primary key (id)
);
create unique index seat_withdrawal_seat_uniq on seat_withdrawal (seat_id);
create index seat_withdrawal_tid_idx on seat_withdrawal (tournament_id, created_at desc);

create table public.promo_code (
  id uuid not null default gen_random_uuid(),
  tournament_id uuid not null references tournament(id) on delete cascade,
  code text not null,
  kind text not null check (kind in ('free','percent','fixed')),
  value numeric not null default 0,
  max_uses integer check (max_uses is null or max_uses >= 0),
  used_count integer not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_code_pkey primary key (id),
  constraint promo_value_bounds check (
    kind = 'free'
    or (kind = 'percent' and value between 0 and 100)
    or (kind = 'fixed' and value >= 0))
);
create unique index promo_code_tournament_code_uniq on promo_code (tournament_id, upper(code));

create table public.promo_redemption (
  id uuid not null default gen_random_uuid(),
  promo_id uuid not null references promo_code(id) on delete cascade,
  batch_id uuid not null references registration_batch(id) on delete cascade,
  account_id uuid references auth.users(id),
  discount_thb numeric not null default 0,
  redeemed_at timestamptz not null default now(),
  constraint promo_redemption_pkey primary key (id)
);
create unique index promo_redemption_batch_uniq on promo_redemption (batch_id);

create table public.go_player_database (
  id uuid not null default gen_random_uuid(),
  source text not null check (source in ('dan','kyu','award')),
  seq text,
  prefix_th text,
  first_name_th text not null,
  last_name_th text not null,
  first_name_th_normalized text not null,
  last_name_th_normalized text not null,
  rank text,
  power_level integer not null default 0,
  rating numeric,
  year_promoted integer,
  diamond text,
  category text,
  rank_in_category text,
  rank_award integer,
  event_name text,
  event_date text,
  raw_data jsonb,
  uploaded_at timestamptz default now(),
  constraint go_player_database_pkey primary key (id)
);
create index idx_gpd_source on go_player_database (source);
create index idx_gpd_first_norm on go_player_database (first_name_th_normalized);
create index idx_gpd_last_norm on go_player_database (last_name_th_normalized);
create index idx_gpd_first_trgm on go_player_database using gin (first_name_th gin_trgm_ops);
create index idx_gpd_last_trgm on go_player_database using gin (last_name_th gin_trgm_ops);
create index go_player_database_dan_name_idx on go_player_database
  (first_name_th_normalized, last_name_th_normalized) where source = 'dan';
create index go_player_database_award_1kyu_idx on go_player_database
  (first_name_th_normalized, last_name_th_normalized)
  where source = 'award' and power_level = 14;

create table public.go_institute (
  id uuid not null default gen_random_uuid(),
  name_th text not null,
  name_normalized text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  keywords text[] not null default '{}',
  constraint go_institute_pkey primary key (id)
);
create unique index go_institute_name_norm_uniq on go_institute (name_normalized);

create table public.institute_merge (
  id uuid not null default gen_random_uuid(),
  source_id uuid not null,
  source_name text not null,
  source_normalized text not null,
  source_keywords text[] not null default '{}',
  source_active boolean not null default true,
  target_id uuid not null,
  target_name text not null,
  added_keywords text[] not null default '{}',
  moved_profiles uuid[] not null default '{}',
  moved_players uuid[] not null default '{}',
  moved_seats uuid[] not null default '{}',
  merged_at timestamptz not null default now(),
  reversed_at timestamptz,
  constraint institute_merge_pkey primary key (id)
);

create table public.award_limit_exemption (
  id uuid not null default gen_random_uuid(),
  first_name_th text not null,
  last_name_th text not null,
  first_name_th_normalized text not null,
  last_name_th_normalized text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint award_limit_exemption_pkey primary key (id)
);
create index award_limit_exemption_norm_idx on award_limit_exemption
  (first_name_th_normalized, last_name_th_normalized);

create table public.account_roles (
  account_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'judge' check (role in ('judge','admin')),
  default_division_id text references live_division(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint account_roles_pkey primary key (account_id, role)
);

create table public.app_config (
  key text not null,          -- holds e.g. live_token; RLS default-deny, RPC-only
  value text not null,
  constraint app_config_pkey primary key (key)
);

-- live results (MacMahon-compatible)
create table public.live_division (
  id text not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint live_division_pkey primary key (id)
);

create table public.live_match (
  id uuid not null default gen_random_uuid(),
  division_id text not null references live_division(id) on delete cascade,
  round text not null,
  table_no text not null,
  black text not null default '',
  white text not null default '',
  black_force text not null default '',
  white_force text not null default '',
  result text not null default '?-?',
  remark text not null default '',
  check_in text not null default '',
  submitted_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  black_score text,
  white_score text,
  constraint live_match_pkey primary key (id),
  constraint live_match_division_id_round_table_no_key unique (division_id, round, table_no)
);
create index live_match_div_round_idx on live_match (division_id, round);

create table public.live_standing (
  division_id text not null references live_division(id) on delete cascade,
  headers jsonb not null default '[]',
  rows jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  constraint live_standing_pkey primary key (division_id)
);

create table public.live_config (
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  constraint live_config_pkey primary key (key)
);

-- (live_match_bak_20260703 also exists in prod — a one-off manual backup of
--  live_match, RLS-enabled with no policies; not part of the schema proper.)

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Every table: RLS enabled. Tables not listed below have NO policies at all
-- (default-deny; reachable only through SECURITY DEFINER RPCs).
alter table tournament            enable row level security;
alter table category              enable row level security;
alter table profile               enable row level security;
alter table managed_player        enable row level security;
alter table registration_batch    enable row level security;
alter table registration_seat     enable row level security;
alter table seat_hold             enable row level security;
alter table seat_hold_line        enable row level security;
alter table seat_withdrawal       enable row level security;
alter table promo_code            enable row level security;
alter table promo_redemption      enable row level security;
alter table go_player_database    enable row level security;
alter table go_institute          enable row level security;
alter table institute_merge       enable row level security;
alter table award_limit_exemption enable row level security;
alter table account_roles         enable row level security;
alter table app_config            enable row level security;
alter table live_division         enable row level security;
alter table live_match            enable row level security;
alter table live_standing         enable row level security;
alter table live_config           enable row level security;

create policy tournament_public_read on tournament
  for select to anon, authenticated using (true);
create policy category_public_read on category
  for select to anon, authenticated using (true);
create policy gi_read_all on go_institute
  for select to anon, authenticated using (true);

create policy profile_select on profile
  for select to authenticated using ((select auth.uid()) = id);
create policy profile_insert on profile
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profile_update on profile
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy mp_select on managed_player
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy mp_insert on managed_player
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy mp_update on managed_player
  for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy mp_delete on managed_player
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy account_roles_self_read on account_roles
  for select to authenticated using (account_id = auth.uid());

-- live boards are world-readable; writes go through the live_* RPCs
create policy live_division_read on live_division
  for select to anon, authenticated using (true);
create policy live_match_read on live_match
  for select to anon, authenticated using (true);
create policy live_standing_read on live_standing
  for select to anon, authenticated using (true);
create policy live_config_read on live_config
  for select to anon, authenticated using (true);

-- ── grants ──────────────────────────────────────────────────────────────────
-- Tables keep Supabase's default CRUD grants to anon/authenticated; RLS is the
-- effective gate. Exception (hardened in 20260701_0002):
revoke select on go_player_database from anon, authenticated;
