-- Wire promo handling into the 3 existing money RPCs. Originals preserved verbatim
-- except the marked promo additions. For batches WITHOUT a promo these behave exactly
-- as before (promo_code is null → promo block skipped; _recompute_batch_total with no
-- promo == the old sum(fee_thb_snapshot)).

-- ── submit_registration: count usage atomically at commit; free → confirmed ──
create or replace function public.submit_registration(p_batch_id uuid, p_slip_url text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_batch registration_batch;
  v_hold  seat_hold;
  v_promo promo_code;   -- promo
  v_rows  int;          -- promo
begin
  select * into v_batch from registration_batch where id = p_batch_id;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_batch.status in ('pending_review', 'confirmed') then return _batch_json(p_batch_id); end if;
  perform release_expired_holds(v_batch.tournament_id);
  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  if v_hold.id is null or v_hold.status <> 'active' or v_hold.expires_at <= now() then
    raise exception 'HOLD_EXPIRED';
  end if;

  -- promo: consume one use atomically, ONLY now (commit). Whole txn rolls back on failure.
  if v_batch.promo_code is not null then
    select * into v_promo from promo_code
      where tournament_id = v_batch.tournament_id and upper(code) = upper(v_batch.promo_code)
      for update;
    if v_promo.id is null or not v_promo.active then raise exception 'PROMO_INVALID'; end if;
    if v_promo.valid_until is not null and now() > v_promo.valid_until then raise exception 'PROMO_EXPIRED'; end if;
    update promo_code set used_count = used_count + 1, updated_at = now()
      where id = v_promo.id and (max_uses is null or used_count < max_uses);
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'PROMO_EXHAUSTED'; end if;
    insert into promo_redemption(promo_id, batch_id, account_id, discount_thb)
      values (v_promo.id, p_batch_id, v_batch.account_id, v_batch.discount_thb)
      on conflict (batch_id) do nothing;
  end if;

  update seat_hold set status = 'consumed' where id = v_hold.id;

  -- free ($0, promo or zero-fee) → confirmed directly (no slip, no admin step);
  -- anything payable keeps the original pending_review + slip path.
  if v_batch.total_amount_thb <= 0 then
    update registration_batch set
      status = 'confirmed',
      payment_slip_url = nullif(p_slip_url, ''),
      reviewed_by = 'promo:' || coalesce(v_batch.promo_code, ''),
      reviewed_at = now(),
      updated_at = now()
    where id = p_batch_id;
  else
    update registration_batch set status = 'pending_review', payment_slip_url = p_slip_url, updated_at = now()
      where id = p_batch_id;
  end if;

  return _batch_json(p_batch_id);
end; $function$;

-- ── admin_update_seat: recompute total promo-aware ──────────────────────────
create or replace function public.admin_update_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_payload jsonb, p_admin_id text default 'admin'::text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
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

  perform _recompute_batch_total(p_batch_id);   -- promo-aware (was: total = sum(fee_thb_snapshot))

  return _batch_json(p_batch_id);
end; $function$;

-- ── admin_delete_seat: recompute total promo-aware ──────────────────────────
create or replace function public.admin_delete_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_admin_id text default 'admin'::text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
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
    perform _recompute_batch_total(p_batch_id);   -- promo-aware (was: total = sum(fee_thb_snapshot))
  end if;

  return _batch_json(p_batch_id);
end; $function$;
