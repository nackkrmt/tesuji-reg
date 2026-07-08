-- Per-seat "Withdraw" (ถอนตัว) and "Swap participant" (เปลี่ยนคนเข้าแข่งขัน).
--
-- Two owner-facing actions on a single registration seat, plus an admin view of
-- withdrawals for off-system refund handling.
--
-- WITHDRAW (withdraw_seat): the seat's occupant pulls out. The seat row is KEPT
-- (marked registration_seat.withdrawn_at) so:
--   • the batch total_amount_thb / discount_thb / status never change — the
--     admin dashboard revenue (sum of confirmed batch totals) must NOT drop;
--     refunds are decided off-system at the organizer's discretion.
--   • _recompute_batch_total (which sums fee_thb_snapshot over ALL seats, incl.
--     withdrawn) keeps returning the same total even if an admin later edits a
--     sibling seat. DO NOT add a withdrawn filter to _recompute_batch_total.
-- The held seat IS returned to capacity by decrementing category.seats_taken and
-- the seat_hold_line (same as admin_delete_seat) — decrementing the hold line is
-- what prevents a later reject_registration / admin_delete_batch (which release
-- via seat_hold_line) from double-freeing the same seat.
-- A seat_withdrawal row snapshots the person/category/fee + the refund bank info
-- and reason, with an admin-settable refund_status.
--
-- SWAP (swap_seat): replace the seat's occupant with self or one of the account's
-- managed players, optionally moving to another division of the SAME tournament
-- whose fee equals the seat's fee_thb_snapshot (no money moves). All eligibility
-- (rank / age / cross-account duplicate / combinable / 1-kyu award ceiling) is
-- re-checked server-side against the DB-read person — the client is never trusted.
-- Mirrors reserve_seats' validation and admin_update_seat's rebooking.
--
-- Ripple patches (same migration): reserve_seats + list_participants +
-- admin_category_stats gain "and withdrawn_at is null"; admin_update_seat /
-- admin_delete_seat refuse withdrawn seats. reject_registration /
-- admin_delete_batch / _batch_json / my_registrations / confirm_registration
-- need no change (verified against the live DB).

-- ============================================================================
-- 1. DDL
-- ============================================================================

alter table public.registration_seat
  add column if not exists withdrawn_at timestamptz;

create table if not exists public.seat_withdrawal (
  id                uuid primary key default gen_random_uuid(),
  seat_id           uuid not null references public.registration_seat(id) on delete cascade,
  batch_id          uuid not null references public.registration_batch(id) on delete cascade,
  tournament_id     uuid not null references public.tournament(id) on delete cascade,
  account_id        uuid references auth.users(id),
  -- snapshots so the admin refund list survives later seat edits
  person_name       text not null,
  category_id       uuid references public.category(id) on delete set null,
  category_label    text not null,
  fee_thb           numeric(10,2) not null,
  batch_reference   text not null,
  reason            text,
  bank_name         text not null,
  bank_account_no   text not null,
  bank_account_name text not null,
  refund_status     text not null default 'pending'
                    check (refund_status in ('pending','refunded','denied')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       text
);
create unique index if not exists seat_withdrawal_seat_uniq on public.seat_withdrawal(seat_id);
create index if not exists seat_withdrawal_tid_idx on public.seat_withdrawal(tournament_id, created_at desc);
-- RLS on, zero policies = reachable only through the SECURITY DEFINER RPCs below
-- (same lockdown pattern as promo_code).
alter table public.seat_withdrawal enable row level security;

-- ============================================================================
-- 2. withdraw_seat — owner-gated
-- ============================================================================

create or replace function public.withdraw_seat(
  p_seat_id uuid,
  p_reason text,
  p_bank_name text,
  p_bank_account_no text,
  p_bank_account_name text
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_seat registration_seat; v_batch registration_batch;
  v_hold seat_hold; v_occupies boolean;
  v_cat category; v_person_name text; v_wid uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  select * into v_seat from registration_seat where id = p_seat_id for update;
  if v_seat.id is null then
    return jsonb_build_object('ok', false, 'error', 'SEAT_NOT_FOUND');
  end if;

  select * into v_batch from registration_batch where id = v_seat.batch_id;
  if v_batch.account_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if v_batch.status not in ('confirmed', 'pending_review') then
    return jsonb_build_object('ok', false, 'error', 'BATCH_NOT_ACTIVE');
  end if;
  if v_seat.withdrawn_at is not null then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_WITHDRAWN');
  end if;

  -- refund destination is required; reason is optional (no deadline on withdrawal)
  if btrim(coalesce(p_bank_name, '')) = '' or char_length(p_bank_name) > 100
     or btrim(coalesce(p_bank_account_name, '')) = '' or char_length(p_bank_account_name) > 100
     or coalesce(p_bank_account_no, '') !~ '^[0-9][0-9 -]{4,29}$'
     or char_length(coalesce(p_reason, '')) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD');
  end if;

  -- return the held seat to capacity WITHOUT deleting the row (mirror admin_delete_seat)
  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');
  if v_occupies then
    update category set seats_taken = greatest(0, seats_taken - 1), updated_at = now()
      where id = v_seat.category_id;
    delete from seat_hold_line
      where hold_id = v_hold.id and category_id = v_seat.category_id and seats <= 1;
    update seat_hold_line set seats = seats - 1
      where hold_id = v_hold.id and category_id = v_seat.category_id;
  end if;

  update registration_seat set withdrawn_at = now() where id = p_seat_id;

  select * into v_cat from category where id = v_seat.category_id;
  v_person_name :=
    (case when v_seat.title_prefix::text = 'อื่นๆ' then coalesce(v_seat.title_custom, '')
          else v_seat.title_prefix::text end)
    || v_seat.first_name_th
    || (case when v_seat.has_middle_name and v_seat.middle_name_th is not null
             then ' ' || v_seat.middle_name_th else '' end)
    || ' ' || v_seat.last_name_th;

  insert into seat_withdrawal(
    seat_id, batch_id, tournament_id, account_id, person_name,
    category_id, category_label, fee_thb, batch_reference,
    reason, bank_name, bank_account_no, bank_account_name)
  values (
    p_seat_id, v_batch.id, v_batch.tournament_id, v_uid, v_person_name,
    v_seat.category_id, coalesce(v_cat.code || ' · ' || v_cat.name, ''),
    v_seat.fee_thb_snapshot, v_batch.reference_code,
    nullif(btrim(coalesce(p_reason, '')), ''),
    btrim(p_bank_name), btrim(p_bank_account_no), btrim(p_bank_account_name))
  returning id into v_wid;

  -- Intentionally NOT touching registration_batch.total_amount_thb / discount_thb
  -- / status — the dashboard revenue must stay constant across a withdrawal.

  return jsonb_build_object('ok', true, 'withdrawalId', v_wid);
end; $function$;

-- ============================================================================
-- 3. swap_seat — owner-gated
-- ============================================================================

create or replace function public.swap_seat(
  p_seat_id uuid,
  p_source_kind text,
  p_source_player_id uuid,
  p_category_id uuid
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_seat registration_seat; v_batch registration_batch; v_t tournament;
  v_new_cat category; v_hold seat_hold; v_occupies boolean; v_moving boolean;
  v_person record; v_pl int; v_dob date; v_age int; v_label text;
  v_nfn text; v_nln text;
  v_existing uuid[]; v_combined uuid[]; v_dup_ref text; v_dup_name text;
  v_a uuid; v_b uuid; v_cat category; v_cat2 category;
  v_ban_status jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  -- serialize against this account's concurrent reserve_seats/swap (same key)
  perform pg_advisory_xact_lock(hashtext('reserve_seats:' || v_uid::text)::bigint);

  select * into v_seat from registration_seat where id = p_seat_id for update;
  if v_seat.id is null then
    return jsonb_build_object('ok', false, 'error', 'SEAT_NOT_FOUND');
  end if;

  select * into v_batch from registration_batch where id = v_seat.batch_id;
  if v_batch.account_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if v_batch.status not in ('confirmed', 'pending_review') then
    return jsonb_build_object('ok', false, 'error', 'BATCH_NOT_ACTIVE');
  end if;
  if v_seat.withdrawn_at is not null then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_WITHDRAWN');
  end if;

  select * into v_t from tournament where id = v_batch.tournament_id;
  if v_t.id is null or now() >= v_t.registration_closes_at then
    return jsonb_build_object('ok', false, 'error', 'SWAP_CLOSED');
  end if;

  -- resolve the NEW person from the DB (never trust client-sent rank/age/name)
  if p_source_kind = 'self' then
    select * into v_person from profile where id = v_uid;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
    end if;
  elsif p_source_kind = 'managed_player' then
    select * into v_person from managed_player
      where id = p_source_player_id and owner_id = v_uid and archived_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'INVALID_SOURCE');
  end if;

  v_pl := v_person.power_level;
  v_dob := v_person.date_of_birth;
  v_label := btrim(coalesce(v_person.first_name_th, '') || ' ' || coalesce(v_person.last_name_th, ''));
  v_nfn := public.normalize_thai_name(v_person.first_name_th);
  v_nln := public.normalize_thai_name(v_person.last_name_th);

  select * into v_new_cat from category
    where id = p_category_id and tournament_id = v_batch.tournament_id for update;
  if v_new_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;
  v_moving := p_category_id <> v_seat.category_id;

  -- same occupant AND same division = nothing to do
  if not v_moving
     and public.normalize_thai_name(v_seat.first_name_th) = v_nfn
     and public.normalize_thai_name(v_seat.last_name_th) = v_nln then
    return jsonb_build_object('ok', false, 'error', 'SAME_PERSON');
  end if;

  -- a swap must not change the amount owed
  if v_moving and v_new_cat.fee_thb <> v_seat.fee_thb_snapshot then
    return jsonb_build_object('ok', false, 'error', 'FEE_MISMATCH',
      'categoryName', v_new_cat.code || ' ' || v_new_cat.name);
  end if;

  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');

  if v_moving and v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
      'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
      'remaining', 0, 'requested', 1);
  end if;

  -- rank eligibility on the DB-read power level (reserve_seats semantics)
  if v_pl is null then
    if v_new_cat.min_power_level is not null or v_new_cat.max_power_level is not null then
      return jsonb_build_object('ok', false, 'error', 'RANK_REQUIRED',
        'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
        'personLabel', v_label);
    end if;
  else
    if (v_new_cat.max_power_level is not null and v_pl > v_new_cat.max_power_level)
       or (v_new_cat.min_power_level is not null and v_pl < v_new_cat.min_power_level) then
      return jsonb_build_object('ok', false, 'error', 'RANK_NOT_ELIGIBLE',
        'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
        'personLabel', v_label, 'powerLevel', v_pl,
        'minPowerLevel', v_new_cat.min_power_level, 'maxPowerLevel', v_new_cat.max_power_level);
    end if;
  end if;

  -- age eligibility on the DB-read dob
  if v_new_cat.min_age is not null or v_new_cat.max_age is not null then
    v_age := case when v_dob is null then null else extract(year from age(v_dob))::int end;
    if v_age is null
       or (v_new_cat.max_age is not null and v_age > v_new_cat.max_age)
       or (v_new_cat.min_age is not null and v_age < v_new_cat.min_age) then
      return jsonb_build_object('ok', false, 'error', 'AGE_NOT_ELIGIBLE',
        'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
        'personLabel', v_label, 'age', coalesce(v_age, 0),
        'minAge', v_new_cat.min_age, 'maxAge', v_new_cat.max_age);
    end if;
  end if;

  -- cross-account duplicate / combinable by normalized name, EXCLUDING the seat
  -- we're vacating and any withdrawn seats. Models the post-swap state: the new
  -- person will hold (their other live categories) ∪ {target}.
  select coalesce(array_agg(distinct s.category_id), '{}'::uuid[]) into v_existing
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  where b.tournament_id = v_batch.tournament_id
    and b.status in ('pending_payment','pending_review','confirmed')
    and s.id <> p_seat_id
    and s.withdrawn_at is null
    and public.normalize_thai_name(s.first_name_th) = v_nfn
    and public.normalize_thai_name(s.last_name_th)  = v_nln;

  select c.code || ' ' || c.name, b.reference_code into v_dup_name, v_dup_ref
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  join category c on c.id = s.category_id
  where b.tournament_id = v_batch.tournament_id
    and b.status in ('pending_payment','pending_review','confirmed')
    and s.id <> p_seat_id
    and s.withdrawn_at is null
    and s.category_id = p_category_id
    and public.normalize_thai_name(s.first_name_th) = v_nfn
    and public.normalize_thai_name(s.last_name_th)  = v_nln
  limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE_REGISTRATION',
      'personLabel', v_label, 'categoryName', v_dup_name, 'referenceCode', v_dup_ref);
  end if;

  select array(select distinct x from unnest(v_existing || array[p_category_id]) x)
    into v_combined;
  if array_length(v_combined, 1) >= 2 then
    v_a := v_combined[1]; v_b := v_combined[2];
    select * into v_cat  from category where id = v_a;
    select * into v_cat2 from category where id = v_b;
    if array_length(v_combined, 1) > 2
       or not (v_b = any(v_cat.combinable_category_ids) or v_a = any(v_cat2.combinable_category_ids)) then
      return jsonb_build_object('ok', false, 'error', 'COMBINATION_NOT_ALLOWED',
        'personLabel', v_label,
        'categoryName', v_cat.code || ' ' || v_cat.name,
        'otherCategoryName', v_cat2.code || ' ' || v_cat2.name);
    end if;
  end if;

  -- 1-kyu award ceiling on the new person
  v_ban_status := public.award_limit_status(v_person.first_name_th, v_person.last_name_th);
  if (v_ban_status->>'banned')::boolean then
    return jsonb_build_object('ok', false, 'error', 'AWARD_LIMIT_REACHED',
      'personLabel', v_label, 'awardCount', (v_ban_status->>'count')::int,
      'requiresAdminOverride', true);
  end if;

  -- rebook the seat (mirror admin_update_seat) — capacity moves only when the
  -- division changes and the hold still occupies seats
  if v_moving and v_occupies then
    update category set seats_taken = greatest(0, seats_taken - 1), updated_at = now()
      where id = v_seat.category_id;
    update category set seats_taken = seats_taken + 1, updated_at = now()
      where id = v_new_cat.id;
    delete from seat_hold_line
      where hold_id = v_hold.id and category_id = v_seat.category_id and seats <= 1;
    update seat_hold_line set seats = seats - 1
      where hold_id = v_hold.id and category_id = v_seat.category_id;
    if exists (select 1 from seat_hold_line where hold_id = v_hold.id and category_id = v_new_cat.id) then
      update seat_hold_line set seats = seats + 1
        where hold_id = v_hold.id and category_id = v_new_cat.id;
    else
      insert into seat_hold_line(hold_id, category_id, seats) values (v_hold.id, v_new_cat.id, 1);
    end if;
  end if;

  update registration_seat set
    title_prefix     = v_person.title_prefix,
    title_custom     = v_person.title_custom,
    first_name_th    = v_person.first_name_th,
    last_name_th     = v_person.last_name_th,
    first_name_en    = v_person.first_name_en,
    last_name_en     = v_person.last_name_en,
    has_middle_name  = coalesce(v_person.has_middle_name, false),
    middle_name_th   = v_person.middle_name_th,
    middle_name_en   = v_person.middle_name_en,
    mobile_phone     = v_person.mobile_phone,
    date_of_birth    = v_person.date_of_birth,
    power_level      = v_person.power_level,
    province         = v_person.province,
    institute_id     = v_person.institute_id,
    institute_name   = v_person.institute_name,
    pdpa_consent     = coalesce(v_person.pdpa_consent, false),
    pdpa_consent_at  = v_person.pdpa_consent_at,
    source_kind      = p_source_kind,
    source_player_id = case when p_source_kind = 'managed_player' then p_source_player_id else null end,
    category_id      = v_new_cat.id
    -- fee_thb_snapshot intentionally unchanged: no money moves in a swap, so the
    -- batch total stays correct without calling _recompute_batch_total.
  where id = p_seat_id;

  return jsonb_build_object('ok', true);
end; $function$;

-- ============================================================================
-- 4. admin_list_withdrawals — _is_admin gated
-- ============================================================================

create or replace function public.admin_list_withdrawals(
  p_admin_secret text,
  p_tournament_id uuid
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'seatId', w.seat_id, 'batchId', w.batch_id,
      'tournamentId', w.tournament_id, 'personName', w.person_name,
      'categoryId', w.category_id, 'categoryLabel', w.category_label,
      'feeThb', w.fee_thb, 'batchReference', w.batch_reference,
      'reason', w.reason, 'bankName', w.bank_name,
      'bankAccountNo', w.bank_account_no, 'bankAccountName', w.bank_account_name,
      'refundStatus', w.refund_status, 'createdAt', w.created_at,
      'resolvedAt', w.resolved_at, 'resolvedBy', w.resolved_by)
      order by w.created_at desc)
    from seat_withdrawal w
    where w.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end; $function$;

-- ============================================================================
-- 5. admin_set_withdrawal_status — _is_admin gated
-- ============================================================================

create or replace function public.admin_set_withdrawal_status(
  p_admin_secret text,
  p_withdrawal_id uuid,
  p_status text,
  p_admin_id text default 'admin'
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_w seat_withdrawal;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_status not in ('pending','refunded','denied') then raise exception 'INVALID_STATUS'; end if;

  update seat_withdrawal set
    refund_status = p_status,
    resolved_at = case when p_status = 'pending' then null else now() end,
    resolved_by = case when p_status = 'pending' then null else p_admin_id end
  where id = p_withdrawal_id
  returning * into v_w;
  if v_w.id is null then raise exception 'NOT_FOUND'; end if;

  return jsonb_build_object(
    'id', v_w.id, 'seatId', v_w.seat_id, 'batchId', v_w.batch_id,
    'tournamentId', v_w.tournament_id, 'personName', v_w.person_name,
    'categoryId', v_w.category_id, 'categoryLabel', v_w.category_label,
    'feeThb', v_w.fee_thb, 'batchReference', v_w.batch_reference,
    'reason', v_w.reason, 'bankName', v_w.bank_name,
    'bankAccountNo', v_w.bank_account_no, 'bankAccountName', v_w.bank_account_name,
    'refundStatus', v_w.refund_status, 'createdAt', v_w.created_at,
    'resolvedAt', v_w.resolved_at, 'resolvedBy', v_w.resolved_by);
end; $function$;

-- ============================================================================
-- 6. Patch reserve_seats — skip withdrawn seats in both identity lookups
--    (recreated verbatim from 20260708_0001 + "and s.withdrawn_at is null" x2)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_seats(p_tournament_id uuid, p_kind text, p_submitter_phone text, p_seats jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_t tournament; v_item record; v_cat category; v_remaining int;
  v_count int; v_batch_id uuid; v_hold_id uuid;
  v_expires timestamptz := now() + interval '15 minutes';
  v_total numeric(10,2) := 0; v_ref text; s jsonb; v_uid uuid;
  v_pl int; v_src text; v_label text; v_dob date; v_age int;
  v_prov text; v_inst_id uuid; v_inst_name text; v_pdpa boolean; v_pdpa_at timestamptz;
  v_combchk record; v_cat2 category; v_a uuid; v_b uuid;
  v_existing uuid[]; v_combined uuid[]; v_dup_name text; v_dup_ref text;
  v_person record; v_ban_status jsonb;
  v_nfn text; v_nln text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('reserve_seats:' || v_uid::text)::bigint);

  perform release_expired_holds(p_tournament_id);

  select * into v_t from tournament where id = p_tournament_id;
  if v_t.id is null or v_t.status <> 'published'
     or now() < v_t.registration_opens_at or now() >= v_t.registration_closes_at then
    return jsonb_build_object('ok', false, 'error', 'REGISTRATION_CLOSED');
  end if;

  v_count := jsonb_array_length(p_seats);
  if v_count = 0  then return jsonb_build_object('ok', false, 'error', 'EMPTY_BATCH'); end if;
  if v_count > 10 then return jsonb_build_object('ok', false, 'error', 'TOO_MANY', 'max', 10); end if;

  for s in select * from jsonb_array_elements(p_seats) loop
    v_label := btrim(coalesce(s->>'firstNameTh','') || ' ' || coalesce(s->>'lastNameTh',''));
    if char_length(coalesce(s->>'firstNameTh','')) not between 1 and 100
       or char_length(coalesce(s->>'lastNameTh',''))  not between 1 and 100
       or char_length(coalesce(s->>'firstNameEn','')) > 100
       or char_length(coalesce(s->>'lastNameEn',''))  > 100
       or char_length(coalesce(s->>'middleNameTh','')) > 100
       or char_length(coalesce(s->>'middleNameEn','')) > 100
       or char_length(coalesce(s->>'titleCustom',''))  > 50
       or coalesce(s->>'phone','') !~ '^0[689][0-9]{8}$'
    then
      return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD', 'personLabel', v_label);
    end if;
    if nullif(s->>'dob','') is not null then
      begin
        v_dob := (s->>'dob')::date;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD', 'personLabel', v_label);
      end;
      if v_dob > current_date or v_dob < date '1900-01-01' then
        return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD', 'personLabel', v_label);
      end if;
    end if;
  end loop;

  for v_item in
    select (e->>'categoryId')::uuid as category_id, count(*)::int as seats
    from jsonb_array_elements(p_seats) e
    group by (e->>'categoryId')::uuid
    order by (e->>'categoryId')::uuid
  loop
    select * into v_cat from category
      where id = v_item.category_id and tournament_id = p_tournament_id for update;
    if v_cat.id is null then
      return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND', 'categoryId', v_item.category_id);
    end if;
    v_remaining := v_cat.capacity - v_cat.seats_taken;
    if v_item.seats > v_remaining then
      return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
        'categoryId', v_item.category_id, 'categoryName', v_cat.code || ' ' || v_cat.name,
        'remaining', greatest(0, v_remaining), 'requested', v_item.seats);
    end if;
  end loop;

  for s in select * from jsonb_array_elements(p_seats) loop
    select * into v_cat from category
      where id = (s->>'categoryId')::uuid and tournament_id = p_tournament_id;
    v_label := btrim(coalesce(s->>'firstNameTh','') || ' ' || coalesce(s->>'lastNameTh',''));
    v_src := nullif(s->>'sourceKind','');
    if v_src = 'self' then
      select power_level, date_of_birth into v_pl, v_dob from profile where id = v_uid;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'RANK_REQUIRED',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name, 'personLabel', v_label);
      end if;
    elsif v_src = 'managed_player' then
      select power_level, date_of_birth into v_pl, v_dob from managed_player
        where id = nullif(s->>'sourcePlayerId','')::uuid and owner_id = v_uid and archived_at is null;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'INVALID_SOURCE');
    end if;

    if v_pl is null then
      if v_cat.min_power_level is not null or v_cat.max_power_level is not null then
        return jsonb_build_object('ok', false, 'error', 'RANK_REQUIRED',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name, 'personLabel', v_label);
      end if;
    else
      if (v_cat.max_power_level is not null and v_pl > v_cat.max_power_level)
         or (v_cat.min_power_level is not null and v_pl < v_cat.min_power_level) then
        return jsonb_build_object('ok', false, 'error', 'RANK_NOT_ELIGIBLE',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name,
          'personLabel', v_label, 'powerLevel', v_pl,
          'minPowerLevel', v_cat.min_power_level, 'maxPowerLevel', v_cat.max_power_level);
      end if;
    end if;

    if v_cat.min_age is not null or v_cat.max_age is not null then
      v_age := case when v_dob is null then null else extract(year from age(v_dob))::int end;
      if v_age is null
         or (v_cat.max_age is not null and v_age > v_cat.max_age)
         or (v_cat.min_age is not null and v_age < v_cat.min_age) then
        return jsonb_build_object('ok', false, 'error', 'AGE_NOT_ELIGIBLE',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name,
          'personLabel', v_label, 'age', coalesce(v_age, 0),
          'minAge', v_cat.min_age, 'maxAge', v_cat.max_age);
      end if;
    end if;
  end loop;

  for v_combchk in
    select
      nullif(e->>'sourceKind','') as src_kind,
      nullif(e->>'sourcePlayerId','') as player_id,
      array_agg((e->>'categoryId')::uuid) as req_cats,
      (array_agg(e))[1] as sample
    from jsonb_array_elements(p_seats) e
    group by 1, 2
  loop
    v_label := btrim(coalesce(v_combchk.sample->>'firstNameTh','') || ' ' ||
                     coalesce(v_combchk.sample->>'lastNameTh',''));

    v_nfn := public.normalize_thai_name(v_combchk.sample->>'firstNameTh');
    v_nln := public.normalize_thai_name(v_combchk.sample->>'lastNameTh');

    select coalesce(array_agg(distinct s.category_id), '{}'::uuid[]) into v_existing
    from registration_seat s
    join registration_batch b on b.id = s.batch_id
    where b.tournament_id = p_tournament_id
      and b.status in ('pending_payment','pending_review','confirmed')
      and s.withdrawn_at is null
      and public.normalize_thai_name(s.first_name_th) = v_nfn
      and public.normalize_thai_name(s.last_name_th)  = v_nln;

    select c.code || ' ' || c.name, b.reference_code into v_dup_name, v_dup_ref
    from registration_seat s
    join registration_batch b on b.id = s.batch_id
    join category c on c.id = s.category_id
    where b.tournament_id = p_tournament_id
      and b.status in ('pending_payment','pending_review','confirmed')
      and s.withdrawn_at is null
      and s.category_id = any(v_combchk.req_cats)
      and public.normalize_thai_name(s.first_name_th) = v_nfn
      and public.normalize_thai_name(s.last_name_th)  = v_nln
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'error', 'DUPLICATE_REGISTRATION',
        'personLabel', v_label, 'categoryName', v_dup_name, 'referenceCode', v_dup_ref);
    end if;

    if array_length(v_combchk.req_cats, 1) <>
       (select count(distinct x) from unnest(v_combchk.req_cats) x) then
      select c.code || ' ' || c.name into v_dup_name
      from category c
      where c.id = (select x from unnest(v_combchk.req_cats) x
                    group by x having count(*) > 1 limit 1);
      return jsonb_build_object('ok', false, 'error', 'DUPLICATE_REGISTRATION',
        'personLabel', v_label, 'categoryName', coalesce(v_dup_name, ''), 'referenceCode', null);
    end if;

    select array(select distinct x from unnest(v_existing || v_combchk.req_cats) x)
      into v_combined;

    if array_length(v_combined, 1) >= 2 then
      v_a := v_combined[1]; v_b := v_combined[2];
      select * into v_cat  from category where id = v_a;
      select * into v_cat2 from category where id = v_b;
      if array_length(v_combined, 1) > 2
         or not (v_b = any(v_cat.combinable_category_ids) or v_a = any(v_cat2.combinable_category_ids)) then
        return jsonb_build_object('ok', false, 'error', 'COMBINATION_NOT_ALLOWED',
          'personLabel', v_label,
          'categoryName', v_cat.code || ' ' || v_cat.name,
          'otherCategoryName', v_cat2.code || ' ' || v_cat2.name);
      end if;
    end if;
  end loop;

  for v_person in
    select distinct coalesce(e->>'firstNameTh','') as fn, coalesce(e->>'lastNameTh','') as ln
    from jsonb_array_elements(p_seats) e
  loop
    v_ban_status := public.award_limit_status(v_person.fn, v_person.ln);
    if (v_ban_status->>'banned')::boolean then
      return jsonb_build_object('ok', false, 'error', 'AWARD_LIMIT_REACHED',
        'personLabel', btrim(v_person.fn || ' ' || v_person.ln),
        'awardCount', (v_ban_status->>'count')::int,
        'requiresAdminOverride', true);
    end if;
  end loop;

  v_ref := 'TSJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  insert into registration_batch(tournament_id, kind, submitter_phone, status, total_amount_thb, reference_code, account_id)
    values (p_tournament_id, p_kind::registration_kind, p_submitter_phone, 'pending_payment', 0, v_ref, v_uid)
    returning id into v_batch_id;
  insert into seat_hold(tournament_id, batch_id, status, expires_at)
    values (p_tournament_id, v_batch_id, 'active', v_expires) returning id into v_hold_id;

  for s in select * from jsonb_array_elements(p_seats) loop
    select * into v_cat from category where id = (s->>'categoryId')::uuid and tournament_id = p_tournament_id;
    v_total := v_total + coalesce(v_cat.fee_thb, 0);
    v_src := nullif(s->>'sourceKind','');
    if v_src = 'self' then
      select power_level, province, institute_id, institute_name, pdpa_consent, pdpa_consent_at
        into v_pl, v_prov, v_inst_id, v_inst_name, v_pdpa, v_pdpa_at
        from profile where id = v_uid;
    else
      select power_level, province, institute_id, institute_name, pdpa_consent, pdpa_consent_at
        into v_pl, v_prov, v_inst_id, v_inst_name, v_pdpa, v_pdpa_at
        from managed_player
        where id = nullif(s->>'sourcePlayerId','')::uuid and owner_id = v_uid;
    end if;
    insert into registration_seat(
      batch_id, category_id, fee_thb_snapshot, title_prefix, title_custom,
      first_name_th, last_name_th, first_name_en, last_name_en,
      has_middle_name, middle_name_th, middle_name_en, mobile_phone, date_of_birth,
      source_kind, source_player_id, power_level,
      province, institute_id, institute_name, pdpa_consent, pdpa_consent_at)
    values (
      v_batch_id, (s->>'categoryId')::uuid, coalesce(v_cat.fee_thb, 0),
      (s->>'titlePrefix')::title_prefix, nullif(s->>'titleCustom', ''),
      s->>'firstNameTh', s->>'lastNameTh', s->>'firstNameEn', s->>'lastNameEn',
      coalesce((s->>'hasMiddleName')::boolean, false),
      nullif(s->>'middleNameTh', ''), nullif(s->>'middleNameEn', ''),
      s->>'phone', (s->>'dob')::date,
      v_src, case when v_src = 'managed_player' then nullif(s->>'sourcePlayerId','')::uuid else null end,
      v_pl,
      v_prov, v_inst_id, v_inst_name, coalesce(v_pdpa, false), v_pdpa_at);
  end loop;

  for v_item in
    select (e->>'categoryId')::uuid as category_id, count(*)::int as seats
    from jsonb_array_elements(p_seats) e group by (e->>'categoryId')::uuid
  loop
    update category set seats_taken = seats_taken + v_item.seats, updated_at = now()
      where id = v_item.category_id;
    insert into seat_hold_line(hold_id, category_id, seats)
      values (v_hold_id, v_item.category_id, v_item.seats);
  end loop;

  update registration_batch set hold_id = v_hold_id, total_amount_thb = v_total, updated_at = now()
    where id = v_batch_id;

  return jsonb_build_object('ok', true, 'batchId', v_batch_id, 'holdId', v_hold_id,
    'expiresAt', v_expires, 'totalAmountThb', v_total, 'referenceCode', v_ref);
end; $function$;

-- ============================================================================
-- 7. Patch list_participants — hide withdrawn seats from the public roster
--    (recreated verbatim from the live def + "and s.withdrawn_at is null")
-- ============================================================================

CREATE OR REPLACE FUNCTION public.list_participants(p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'fullNameTh',
      (case when s.title_prefix = 'อื่นๆ' then coalesce(s.title_custom, '') else s.title_prefix::text end)
      || s.first_name_th
      || (case when s.has_middle_name and s.middle_name_th is not null then ' ' || s.middle_name_th else '' end)
      || ' ' || s.last_name_th,
    'categoryCode', c.code, 'categoryName', c.name, 'skillLevel', c.skill_level,
    'status', b.status)
    order by c.code, (b.status = 'confirmed') desc, s.first_name_th), '[]'::jsonb)
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  join category c on c.id = s.category_id
  where b.tournament_id = p_tournament_id
    and b.status in ('confirmed', 'pending_review')
    and s.withdrawn_at is null;
$function$;

-- ============================================================================
-- 8. Patch admin_update_seat / admin_delete_seat — refuse withdrawn seats
--    (recreated verbatim from the live def + an early guard after the lock)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_payload jsonb, p_admin_id text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch registration_batch; v_seat registration_seat; v_new_cat category;
  v_hold seat_hold; v_occupies boolean; v_moving boolean;
  v_old_cat uuid; v_pl int; v_dob date; v_age int; v_fee numeric;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select * into v_batch from registration_batch where id = p_batch_id;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;

  select * into v_seat from registration_seat
    where id = p_seat_id and batch_id = p_batch_id for update;
  if v_seat.id is null then raise exception 'SEAT_NOT_FOUND'; end if;
  if v_seat.withdrawn_at is not null then raise exception 'ALREADY_WITHDRAWN'; end if;

  select * into v_new_cat from category
    where id = (p_payload->>'categoryId')::uuid and tournament_id = v_batch.tournament_id for update;
  if v_new_cat.id is null then raise exception 'CATEGORY_NOT_FOUND'; end if;

  v_old_cat := v_seat.category_id;
  v_moving := v_old_cat <> v_new_cat.id;
  v_pl := nullif(p_payload->>'powerLevel', '')::int;
  v_dob := (p_payload->>'dob')::date;

  select h.* into v_hold from seat_hold h
    join registration_batch b on b.hold_id = h.id where b.id = p_batch_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');

  if v_moving and v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
    raise exception 'CATEGORY_FULL';
  end if;

  if v_new_cat.min_power_level is not null or v_new_cat.max_power_level is not null then
    if v_pl is null then raise exception 'RANK_REQUIRED'; end if;
    if (v_new_cat.max_power_level is not null and v_pl > v_new_cat.max_power_level)
       or (v_new_cat.min_power_level is not null and v_pl < v_new_cat.min_power_level) then
      raise exception 'RANK_NOT_ELIGIBLE';
    end if;
  end if;

  if v_new_cat.min_age is not null or v_new_cat.max_age is not null then
    v_age := extract(year from age(v_dob))::int;
    if (v_new_cat.max_age is not null and v_age > v_new_cat.max_age)
       or (v_new_cat.min_age is not null and v_age < v_new_cat.min_age) then
      raise exception 'AGE_NOT_ELIGIBLE';
    end if;
  end if;

  if v_moving and v_occupies then
    update category set seats_taken = greatest(0, seats_taken - 1), updated_at = now()
      where id = v_old_cat;
    update category set seats_taken = seats_taken + 1, updated_at = now()
      where id = v_new_cat.id;
    delete from seat_hold_line
      where hold_id = v_hold.id and category_id = v_old_cat and seats <= 1;
    update seat_hold_line set seats = seats - 1
      where hold_id = v_hold.id and category_id = v_old_cat;
    if exists (select 1 from seat_hold_line where hold_id = v_hold.id and category_id = v_new_cat.id) then
      update seat_hold_line set seats = seats + 1
        where hold_id = v_hold.id and category_id = v_new_cat.id;
    else
      insert into seat_hold_line(hold_id, category_id, seats) values (v_hold.id, v_new_cat.id, 1);
    end if;
  end if;

  v_fee := case when v_moving then v_new_cat.fee_thb else v_seat.fee_thb_snapshot end;

  update registration_seat set
    title_prefix    = (p_payload->>'titlePrefix')::title_prefix,
    title_custom    = nullif(p_payload->>'titleCustom', ''),
    first_name_th   = p_payload->>'firstNameTh',
    last_name_th    = p_payload->>'lastNameTh',
    first_name_en   = p_payload->>'firstNameEn',
    last_name_en    = p_payload->>'lastNameEn',
    has_middle_name = coalesce((p_payload->>'hasMiddleName')::boolean, false),
    middle_name_th  = nullif(p_payload->>'middleNameTh', ''),
    middle_name_en  = nullif(p_payload->>'middleNameEn', ''),
    mobile_phone    = p_payload->>'phone',
    date_of_birth   = v_dob,
    power_level     = v_pl,
    category_id     = v_new_cat.id,
    fee_thb_snapshot = v_fee
  where id = p_seat_id;

  perform _recompute_batch_total(p_batch_id);

  return _batch_json(p_batch_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_admin_id text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch registration_batch; v_seat registration_seat;
  v_hold seat_hold; v_occupies boolean; v_remaining int;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select * into v_batch from registration_batch where id = p_batch_id;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;

  select * into v_seat from registration_seat
    where id = p_seat_id and batch_id = p_batch_id for update;
  if v_seat.id is null then raise exception 'SEAT_NOT_FOUND'; end if;
  if v_seat.withdrawn_at is not null then raise exception 'ALREADY_WITHDRAWN'; end if;

  select h.* into v_hold from seat_hold h
    join registration_batch b on b.hold_id = h.id where b.id = p_batch_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');

  if v_occupies then
    update category set seats_taken = greatest(0, seats_taken - 1), updated_at = now()
      where id = v_seat.category_id;
    delete from seat_hold_line
      where hold_id = v_hold.id and category_id = v_seat.category_id and seats <= 1;
    update seat_hold_line set seats = seats - 1
      where hold_id = v_hold.id and category_id = v_seat.category_id;
  end if;

  delete from registration_seat where id = p_seat_id;

  select count(*) into v_remaining from registration_seat where batch_id = p_batch_id;
  if v_remaining = 0 then
    if v_occupies then
      update seat_hold set status = 'released', released_at = now() where id = v_hold.id;
    end if;
    update registration_batch set status = 'cancelled', total_amount_thb = 0, discount_thb = 0, updated_at = now()
      where id = p_batch_id;
  else
    perform _recompute_batch_total(p_batch_id);
  end if;

  return _batch_json(p_batch_id);
end; $function$;

-- ============================================================================
-- 9. Patch admin_category_stats — don't count withdrawn seats as confirmed
--    (recreated verbatim from the live def + "and s.withdrawn_at is null")
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_category_stats(p_admin_secret text, p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  perform release_expired_holds(p_tournament_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'categoryId', c.id, 'capacity', c.capacity,
      'remaining', greatest(0, c.capacity - c.seats_taken),
      'confirmed', coalesce(cf.cnt, 0),
      'held', greatest(0, c.seats_taken - coalesce(cf.cnt, 0))))
    from category c
    left join (
      select s.category_id, count(*)::int cnt from registration_seat s
      join registration_batch b on b.id = s.batch_id
      where b.status = 'confirmed' and s.withdrawn_at is null group by s.category_id
    ) cf on cf.category_id = c.id
    where c.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end; $function$;

-- ============================================================================
-- 10. Grants (owner RPCs → authenticated only; admin RPCs gated internally)
-- ============================================================================

grant execute on function public.withdraw_seat(uuid,text,text,text,text) to authenticated;
revoke execute on function public.withdraw_seat(uuid,text,text,text,text) from anon;

grant execute on function public.swap_seat(uuid,text,uuid,uuid) to authenticated;
revoke execute on function public.swap_seat(uuid,text,uuid,uuid) from anon;

grant execute on function public.admin_list_withdrawals(text,uuid) to anon, authenticated;
grant execute on function public.admin_set_withdrawal_status(text,uuid,text,text) to anon, authenticated;
