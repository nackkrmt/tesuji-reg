-- เปลี่ยนรุ่น (division change) with fee-difference settlement.
--
-- Product model (owner-side "เปลี่ยนรุ่น" button, split out of เปลี่ยนคน/swap):
--   * Same net cost (diff = 0)  → the seat moves IMMEDIATELY (same capability the
--     old same-fee swap dropdown offered). No request row, no admin involved.
--   * More expensive (upgrade)  → the player transfers the difference, attaches a
--     slip, and a PENDING request is created. The seat does NOT move until an
--     admin verifies the slip and approves.
--   * Cheaper (downgrade)       → the player supplies refund bank details and a
--     PENDING request is created. The seat moves when the admin confirms the
--     refund transfer WITH a proof slip; the row then locks permanently
--     (same terminal-lock semantics as seat_withdrawal refunds).
--
-- Money math: batches can carry promos (free/percent/fixed), so the true
-- difference is NOT new_fee - old_fee. Everything here computes
--   diff = would_be_total - current_total
-- where each total = greatest(0, gross - _promo_discount(kind, value, gross)).
-- Corollary: under a 'free' (or 100% percent) promo every move is 'even' and
-- moves instantly — correct by construction, not a bug.
--
-- Settlement timing: fee_thb_snapshot / total_amount_thb change ONLY at admin
-- approval (via _recompute_batch_total), so dashboard revenue stays truthful
-- with zero display-time netting for this feature.
--
-- Validation reuses the swap_seat gate set (20260711_0001) but for the seat's
-- CURRENT occupant (the person does not change here). Approval re-validates
-- against the occupant at approval time — the person may have been swapped
-- while the request was pending (swap preserves the fee, so the settled amount
-- stays correct); a FEE_CHANGED guard rejects requests whose target-category
-- fee was edited while pending.

-- ============================================================================
-- 1. DDL
-- ============================================================================

create table if not exists public.seat_division_change (
  id                  uuid primary key default gen_random_uuid(),
  seat_id             uuid not null references public.registration_seat(id) on delete cascade,
  batch_id            uuid not null references public.registration_batch(id) on delete cascade,
  tournament_id       uuid not null references public.tournament(id) on delete cascade,
  account_id          uuid references auth.users(id),
  -- snapshots so the admin list survives later seat/category edits
  person_name         text not null,
  batch_reference     text not null,
  from_category_id    uuid references public.category(id) on delete set null,
  from_category_label text not null,
  from_fee_thb        numeric(10,2) not null,
  to_category_id      uuid references public.category(id) on delete set null,
  to_category_label   text not null,
  to_fee_thb          numeric(10,2) not null,
  direction           text not null check (direction in ('upgrade','downgrade')),
  amount_thb          numeric(10,2) not null check (amount_thb >= 0),
  payment_slip_url    text,   -- player's transfer slip (upgrade; bare tesuji-slips path)
  bank_name           text,   -- refund destination (downgrade)
  bank_account_no     text,
  bank_account_name   text,
  status              text not null default 'pending'
                      check (status in ('pending','approved','refunded','rejected')),
  admin_note          text,   -- rejection reason (shown to the player)
  refund_slip_url     text,   -- admin's refund-proof slip (downgrade; bare path)
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         text
);

-- one live request per seat; resolved rows keep full history
create unique index if not exists seat_division_change_pending_uniq
  on public.seat_division_change(seat_id) where status = 'pending';
create index if not exists seat_division_change_tid_idx
  on public.seat_division_change(tournament_id, created_at desc);

-- RLS on. Owner may SELECT their own rows (powers the /my-registrations badge
-- without touching the dashboard-owned my_registrations RPC); ALL writes go
-- through the SECURITY DEFINER RPCs below.
alter table public.seat_division_change enable row level security;
drop policy if exists sdc_owner_select on public.seat_division_change;
create policy sdc_owner_select on public.seat_division_change
  for select to authenticated using (account_id = (select auth.uid()));
grant select on public.seat_division_change to authenticated;

-- ============================================================================
-- 2. _division_move_eligibility — shared rank/age/duplicate/combination/award
--    gate block (copied from swap_seat, parameterized on the person). Returns
--    NULL when eligible, else the swap-shaped {ok:false,...} jsonb so clients
--    reuse the existing ReserveSeatsError handling.
-- ============================================================================

create or replace function public._division_move_eligibility(
  p_tournament_id uuid,
  p_exclude_seat_id uuid,
  p_first_name_th text,
  p_last_name_th text,
  p_power_level int,
  p_dob date,
  p_new_cat category
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_label text := btrim(coalesce(p_first_name_th, '') || ' ' || coalesce(p_last_name_th, ''));
  v_nfn text := public.normalize_thai_name(p_first_name_th);
  v_nln text := public.normalize_thai_name(p_last_name_th);
  v_age int;
  v_existing uuid[]; v_combined uuid[]; v_dup_ref text; v_dup_name text;
  v_a uuid; v_b uuid; v_cat category; v_cat2 category;
  v_ban_status jsonb;
begin
  -- rank eligibility on the DB-read power level (reserve_seats semantics)
  if p_power_level is null then
    if p_new_cat.min_power_level is not null or p_new_cat.max_power_level is not null then
      return jsonb_build_object('ok', false, 'error', 'RANK_REQUIRED',
        'categoryId', p_new_cat.id, 'categoryName', p_new_cat.code || ' ' || p_new_cat.name,
        'personLabel', v_label);
    end if;
  else
    if (p_new_cat.max_power_level is not null and p_power_level > p_new_cat.max_power_level)
       or (p_new_cat.min_power_level is not null and p_power_level < p_new_cat.min_power_level) then
      return jsonb_build_object('ok', false, 'error', 'RANK_NOT_ELIGIBLE',
        'categoryId', p_new_cat.id, 'categoryName', p_new_cat.code || ' ' || p_new_cat.name,
        'personLabel', v_label, 'powerLevel', p_power_level,
        'minPowerLevel', p_new_cat.min_power_level, 'maxPowerLevel', p_new_cat.max_power_level);
    end if;
  end if;

  -- age eligibility on the DB-read dob (null age rejected when a band is set)
  if p_new_cat.min_age is not null or p_new_cat.max_age is not null then
    v_age := case when p_dob is null then null else extract(year from age(p_dob))::int end;
    if v_age is null
       or (p_new_cat.max_age is not null and v_age > p_new_cat.max_age)
       or (p_new_cat.min_age is not null and v_age < p_new_cat.min_age) then
      return jsonb_build_object('ok', false, 'error', 'AGE_NOT_ELIGIBLE',
        'categoryId', p_new_cat.id, 'categoryName', p_new_cat.code || ' ' || p_new_cat.name,
        'personLabel', v_label, 'age', coalesce(v_age, 0),
        'minAge', p_new_cat.min_age, 'maxAge', p_new_cat.max_age);
    end if;
  end if;

  -- duplicate / combinable by normalized name, EXCLUDING the seat being moved
  -- and any withdrawn seats. Models the post-move state: the person will hold
  -- (their other live categories) ∪ {target}.
  select coalesce(array_agg(distinct s.category_id), '{}'::uuid[]) into v_existing
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  where b.tournament_id = p_tournament_id
    and b.status in ('pending_payment','pending_review','confirmed')
    and s.id <> p_exclude_seat_id
    and s.withdrawn_at is null
    and public.normalize_thai_name(s.first_name_th) = v_nfn
    and public.normalize_thai_name(s.last_name_th)  = v_nln;

  select c.code || ' ' || c.name, b.reference_code into v_dup_name, v_dup_ref
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  join category c on c.id = s.category_id
  where b.tournament_id = p_tournament_id
    and b.status in ('pending_payment','pending_review','confirmed')
    and s.id <> p_exclude_seat_id
    and s.withdrawn_at is null
    and s.category_id = p_new_cat.id
    and public.normalize_thai_name(s.first_name_th) = v_nfn
    and public.normalize_thai_name(s.last_name_th)  = v_nln
  limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE_REGISTRATION',
      'personLabel', v_label, 'categoryName', v_dup_name, 'referenceCode', v_dup_ref);
  end if;

  select array(select distinct x from unnest(v_existing || array[p_new_cat.id]) x)
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

  -- 1-kyu award ceiling
  v_ban_status := public.award_limit_status(p_first_name_th, p_last_name_th);
  if (v_ban_status->>'banned')::boolean then
    return jsonb_build_object('ok', false, 'error', 'AWARD_LIMIT_REACHED',
      'personLabel', v_label, 'awardCount', (v_ban_status->>'count')::int,
      'requiresAdminOverride', true);
  end if;

  return null;  -- eligible
end; $function$;

revoke execute on function public._division_move_eligibility(uuid, uuid, text, text, int, date, category)
  from public, anon, authenticated;

-- ============================================================================
-- 3. preview_division_change — read-only dry run. Same gates as the request,
--    no locks, no writes. Gives the sheet the authoritative promo-aware amount
--    (for the QR) and early validation before the player transfers money.
-- ============================================================================

create or replace function public.preview_division_change(
  p_seat_id uuid,
  p_category_id uuid
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_seat registration_seat; v_batch registration_batch; v_t tournament;
  v_new_cat category; v_hold seat_hold; v_occupies boolean;
  v_gross_now numeric(10,2); v_gross_new numeric(10,2);
  v_total_now numeric(10,2); v_total_new numeric(10,2); v_diff numeric(10,2);
  v_err jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  select * into v_seat from registration_seat where id = p_seat_id;
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

  if exists (select 1 from seat_division_change
             where seat_id = p_seat_id and status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'PENDING_EXISTS');
  end if;

  select * into v_new_cat from category
    where id = p_category_id and tournament_id = v_batch.tournament_id;
  if v_new_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;
  if v_new_cat.id = v_seat.category_id then
    return jsonb_build_object('ok', false, 'error', 'NO_CHANGE');
  end if;

  -- promo-aware difference (see header)
  select coalesce(sum(fee_thb_snapshot), 0) into v_gross_now
    from registration_seat where batch_id = v_batch.id;
  v_gross_new := v_gross_now - v_seat.fee_thb_snapshot + v_new_cat.fee_thb;
  v_total_now := greatest(0, v_gross_now - _promo_discount(v_batch.promo_kind, v_batch.promo_value, v_gross_now));
  v_total_new := greatest(0, v_gross_new - _promo_discount(v_batch.promo_kind, v_batch.promo_value, v_gross_new));
  v_diff := round(v_total_new - v_total_now, 2);

  -- capacity: never let a player pay toward (or instantly enter) a full division
  select * into v_hold from seat_hold where id = v_batch.hold_id;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');
  if v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
      'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
      'remaining', 0, 'requested', 1);
  end if;

  v_err := public._division_move_eligibility(
    v_batch.tournament_id, p_seat_id,
    v_seat.first_name_th, v_seat.last_name_th,
    v_seat.power_level, v_seat.date_of_birth, v_new_cat);
  if v_err is not null then return v_err; end if;

  return jsonb_build_object('ok', true,
    'direction', case when v_diff > 0 then 'upgrade'
                      when v_diff < 0 then 'downgrade'
                      else 'even' end,
    'amountThb', abs(v_diff),
    'categoryId', v_new_cat.id,
    'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
    'feeThb', v_new_cat.fee_thb,
    'currentTotalThb', v_total_now,
    'newTotalThb', v_total_new);
end; $function$;

-- ============================================================================
-- 4. request_division_change — owner-gated. Re-runs every preview gate under
--    locks, then: even → move now; upgrade/downgrade → insert a pending row
--    (seat untouched until admin approval).
-- ============================================================================

create or replace function public.request_division_change(
  p_seat_id uuid,
  p_category_id uuid,
  p_slip_url text default null,
  p_bank_name text default null,
  p_bank_account_no text default null,
  p_bank_account_name text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_seat registration_seat; v_batch registration_batch; v_t tournament;
  v_new_cat category; v_old_cat category; v_hold seat_hold; v_occupies boolean;
  v_gross_now numeric(10,2); v_gross_new numeric(10,2);
  v_total_now numeric(10,2); v_total_new numeric(10,2); v_diff numeric(10,2);
  v_err jsonb; v_person_name text; v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  -- serialize against this account's concurrent reserve_seats/swap/requests
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

  if exists (select 1 from seat_division_change
             where seat_id = p_seat_id and status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'PENDING_EXISTS');
  end if;

  -- serialize per real person within the tournament (mirrors swap_seat) so a
  -- concurrent reserve/swap of the same person cannot race past the dup check
  perform pg_advisory_xact_lock(
    hashtext('person:' || v_batch.tournament_id::text || ':'
      || public.normalize_thai_name(v_seat.first_name_th) || '|'
      || public.normalize_thai_name(v_seat.last_name_th))::bigint);

  select * into v_new_cat from category
    where id = p_category_id and tournament_id = v_batch.tournament_id for update;
  if v_new_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;
  if v_new_cat.id = v_seat.category_id then
    return jsonb_build_object('ok', false, 'error', 'NO_CHANGE');
  end if;

  -- promo-aware difference (see header)
  select coalesce(sum(fee_thb_snapshot), 0) into v_gross_now
    from registration_seat where batch_id = v_batch.id;
  v_gross_new := v_gross_now - v_seat.fee_thb_snapshot + v_new_cat.fee_thb;
  v_total_now := greatest(0, v_gross_now - _promo_discount(v_batch.promo_kind, v_batch.promo_value, v_gross_now));
  v_total_new := greatest(0, v_gross_new - _promo_discount(v_batch.promo_kind, v_batch.promo_value, v_gross_new));
  v_diff := round(v_total_new - v_total_now, 2);

  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');
  if v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
      'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
      'remaining', 0, 'requested', 1);
  end if;

  v_err := public._division_move_eligibility(
    v_batch.tournament_id, p_seat_id,
    v_seat.first_name_th, v_seat.last_name_th,
    v_seat.power_level, v_seat.date_of_birth, v_new_cat);
  if v_err is not null then return v_err; end if;

  -- ── even: no money moves → rebook immediately (swap_seat's moving branch) ──
  if v_diff = 0 then
    if v_occupies then
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

    -- snapshot follows the new division even when the promo makes the totals
    -- equal despite different fees; recompute keeps discount_thb coherent.
    update registration_seat
      set category_id = v_new_cat.id, fee_thb_snapshot = v_new_cat.fee_thb
      where id = p_seat_id;
    perform _recompute_batch_total(v_batch.id);

    return jsonb_build_object('ok', true, 'moved', true);
  end if;

  -- ── money moves → pending request; the seat stays put until admin approval ──
  if v_diff > 0 then
    -- player's transfer slip is required up-front (bare private-bucket path,
    -- same shape check as verify-slip's isPrivatePath)
    if p_slip_url is null or p_slip_url !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
      return jsonb_build_object('ok', false, 'error', 'SLIP_REQUIRED');
    end if;
  else
    -- refund destination required (same rules as withdraw_seat)
    if btrim(coalesce(p_bank_name, '')) = '' or char_length(p_bank_name) > 100
       or btrim(coalesce(p_bank_account_name, '')) = '' or char_length(p_bank_account_name) > 100
       or coalesce(p_bank_account_no, '') !~ '^[0-9][0-9 -]{4,29}$' then
      return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD');
    end if;
  end if;

  select * into v_old_cat from category where id = v_seat.category_id;
  v_person_name :=
    (case when v_seat.title_prefix::text = 'อื่นๆ' then coalesce(v_seat.title_custom, '')
          else v_seat.title_prefix::text end)
    || v_seat.first_name_th
    || (case when v_seat.has_middle_name and v_seat.middle_name_th is not null
             then ' ' || v_seat.middle_name_th else '' end)
    || ' ' || v_seat.last_name_th;

  begin
    insert into seat_division_change(
      seat_id, batch_id, tournament_id, account_id, person_name, batch_reference,
      from_category_id, from_category_label, from_fee_thb,
      to_category_id, to_category_label, to_fee_thb,
      direction, amount_thb, payment_slip_url,
      bank_name, bank_account_no, bank_account_name)
    values (
      p_seat_id, v_batch.id, v_batch.tournament_id, v_uid, v_person_name,
      v_batch.reference_code,
      v_seat.category_id, coalesce(v_old_cat.code || ' · ' || v_old_cat.name, ''),
      v_seat.fee_thb_snapshot,
      v_new_cat.id, v_new_cat.code || ' · ' || v_new_cat.name, v_new_cat.fee_thb,
      case when v_diff > 0 then 'upgrade' else 'downgrade' end,
      abs(v_diff),
      case when v_diff > 0 then p_slip_url else null end,
      case when v_diff < 0 then btrim(p_bank_name) else null end,
      case when v_diff < 0 then btrim(p_bank_account_no) else null end,
      case when v_diff < 0 then btrim(p_bank_account_name) else null end)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'PENDING_EXISTS');
  end;

  return jsonb_build_object('ok', true, 'pending', true,
    'direction', case when v_diff > 0 then 'upgrade' else 'downgrade' end,
    'amountThb', abs(v_diff), 'changeId', v_id);
end; $function$;

-- ============================================================================
-- 5. admin_list_division_changes
-- ============================================================================

create or replace function public.admin_list_division_changes(
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
      'id', c.id, 'seatId', c.seat_id, 'batchId', c.batch_id,
      'tournamentId', c.tournament_id, 'personName', c.person_name,
      'batchReference', c.batch_reference,
      'fromCategoryId', c.from_category_id, 'fromCategoryLabel', c.from_category_label,
      'fromFeeThb', c.from_fee_thb,
      'toCategoryId', c.to_category_id, 'toCategoryLabel', c.to_category_label,
      'toFeeThb', c.to_fee_thb,
      'direction', c.direction, 'amountThb', c.amount_thb,
      'paymentSlipUrl', c.payment_slip_url,
      'bankName', c.bank_name, 'bankAccountNo', c.bank_account_no,
      'bankAccountName', c.bank_account_name,
      'status', c.status, 'adminNote', c.admin_note,
      'refundSlipUrl', c.refund_slip_url,
      'createdAt', c.created_at,
      'resolvedAt', c.resolved_at, 'resolvedBy', c.resolved_by)
      order by c.created_at desc)
    from seat_division_change c
    where c.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end; $function$;

-- row → camelCase jsonb with ok:true (shared by the resolve paths below; the
-- list RPC builds its own aggregate without the ok flag)
create or replace function public._division_change_json(c seat_division_change)
returns jsonb
language sql stable
set search_path to 'public'
as $$
  select jsonb_build_object('ok', true,
    'id', c.id, 'seatId', c.seat_id, 'batchId', c.batch_id,
    'tournamentId', c.tournament_id, 'personName', c.person_name,
    'batchReference', c.batch_reference,
    'fromCategoryId', c.from_category_id, 'fromCategoryLabel', c.from_category_label,
    'fromFeeThb', c.from_fee_thb,
    'toCategoryId', c.to_category_id, 'toCategoryLabel', c.to_category_label,
    'toFeeThb', c.to_fee_thb,
    'direction', c.direction, 'amountThb', c.amount_thb,
    'paymentSlipUrl', c.payment_slip_url,
    'bankName', c.bank_name, 'bankAccountNo', c.bank_account_no,
    'bankAccountName', c.bank_account_name,
    'status', c.status, 'adminNote', c.admin_note,
    'refundSlipUrl', c.refund_slip_url,
    'createdAt', c.created_at,
    'resolvedAt', c.resolved_at, 'resolvedBy', c.resolved_by);
$$;

revoke execute on function public._division_change_json(seat_division_change)
  from public, anon, authenticated;

-- ============================================================================
-- 6. admin_resolve_division_change — approve (move + settle) or reject.
--    Approval re-validates everything against the CURRENT occupant, then moves
--    the seat and finally settles the batch money (fee_thb_snapshot +
--    _recompute_batch_total). Downgrade approval requires the refund-proof
--    slip and locks the row permanently (LOCKED thereafter).
-- ============================================================================

create or replace function public.admin_resolve_division_change(
  p_admin_secret text,
  p_id uuid,
  p_action text,
  p_admin_id text default 'admin',
  p_refund_slip_url text default null,
  p_note text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch seat_division_change;
  v_seat registration_seat; v_batch registration_batch;
  v_new_cat category; v_hold seat_hold; v_occupies boolean;
  v_err jsonb; v_moving boolean;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'INVALID_ACTION'; end if;

  select * into v_ch from seat_division_change where id = p_id for update;
  if v_ch.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if v_ch.status = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'LOCKED');
  end if;
  if v_ch.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
  end if;

  if p_action = 'reject' then
    update seat_division_change set
      status = 'rejected',
      admin_note = nullif(btrim(coalesce(p_note, '')), ''),
      resolved_at = now(), resolved_by = p_admin_id
    where id = p_id
    returning * into v_ch;
    return _division_change_json(v_ch);
  end if;

  -- ── approve ──
  -- downgrade needs the refund proof before anything else happens
  if v_ch.direction = 'downgrade'
     and (p_refund_slip_url is null
          or p_refund_slip_url !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$') then
    return jsonb_build_object('ok', false, 'error', 'SLIP_REQUIRED');
  end if;

  select * into v_seat from registration_seat where id = v_ch.seat_id for update;
  if v_seat.id is null then
    return jsonb_build_object('ok', false, 'error', 'SEAT_NOT_FOUND');
  end if;
  if v_seat.withdrawn_at is not null then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_WITHDRAWN');
  end if;

  select * into v_batch from registration_batch where id = v_seat.batch_id;
  if v_batch.status not in ('confirmed', 'pending_review') then
    return jsonb_build_object('ok', false, 'error', 'BATCH_NOT_ACTIVE');
  end if;

  -- an admin may have moved the seat into the target manually while pending —
  -- nothing left to move (admin_update_seat already settled the snapshot);
  -- just finalize the request status.
  v_moving := v_seat.category_id is distinct from v_ch.to_category_id;

  if v_moving then
    select * into v_new_cat from category
      where id = v_ch.to_category_id and tournament_id = v_ch.tournament_id for update;
    if v_new_cat.id is null then
      return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
    end if;

    -- the settled amount was computed against the request-time fee; if the
    -- category's fee changed while pending, force reject + re-request instead
    -- of silently settling a different amount
    if v_new_cat.fee_thb <> v_ch.to_fee_thb then
      return jsonb_build_object('ok', false, 'error', 'FEE_CHANGED',
        'currentFeeThb', v_new_cat.fee_thb, 'requestedFeeThb', v_ch.to_fee_thb);
    end if;

    -- serialize per person (current occupant) as swap/reserve do
    perform pg_advisory_xact_lock(
      hashtext('person:' || v_ch.tournament_id::text || ':'
        || public.normalize_thai_name(v_seat.first_name_th) || '|'
        || public.normalize_thai_name(v_seat.last_name_th))::bigint);

    select * into v_hold from seat_hold where id = v_batch.hold_id for update;
    v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');
    if v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
      return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
        'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
        'remaining', 0, 'requested', 1);
    end if;

    -- re-validate against the CURRENT occupant (may differ from request time)
    v_err := public._division_move_eligibility(
      v_ch.tournament_id, v_seat.id,
      v_seat.first_name_th, v_seat.last_name_th,
      v_seat.power_level, v_seat.date_of_birth, v_new_cat);
    if v_err is not null then return v_err; end if;

    -- rebook (swap_seat's moving branch)
    if v_occupies then
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

    -- settle: snapshot follows the target division, batch total recomputed
    -- with the batch's promo — this is the moment revenue actually changes
    update registration_seat
      set category_id = v_new_cat.id, fee_thb_snapshot = v_ch.to_fee_thb
      where id = v_seat.id;
    perform _recompute_batch_total(v_batch.id);
  end if;

  update seat_division_change set
    status = case when v_ch.direction = 'downgrade' then 'refunded' else 'approved' end,
    refund_slip_url = case when v_ch.direction = 'downgrade' then p_refund_slip_url
                           else refund_slip_url end,
    admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note),
    resolved_at = now(), resolved_by = p_admin_id
  where id = p_id
  returning * into v_ch;

  return _division_change_json(v_ch);
end; $function$;

-- ============================================================================
-- 7. Grants
-- ============================================================================

grant execute on function public.preview_division_change(uuid, uuid) to authenticated;
revoke execute on function public.preview_division_change(uuid, uuid) from public, anon;
grant execute on function public.request_division_change(uuid, uuid, text, text, text, text) to authenticated;
revoke execute on function public.request_division_change(uuid, uuid, text, text, text, text) from public, anon;
-- admin fns follow the house convention: callable by anon+authenticated,
-- _is_admin inside is the real gate
grant execute on function public.admin_list_division_changes(text, uuid) to anon, authenticated;
grant execute on function public.admin_resolve_division_change(text, uuid, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
