-- Reverts two intentional product decisions from 0003/0004 (kept the rest):
--   • promo per-person cap  → back to max_uses counting total REGISTRATIONS, so one
--     account (e.g. a coach) may redeem a code multiple times up to max_uses.
--   • public roster         → show pending_review (submitted, unpaid) registrants again.
-- Ownership gate, fresh-discount recompute, valid_from re-check, reserve_seats
-- validation and the promo/seat CHECK constraints all stay in place.

-- ── drop the per-account redemption cap ──────────────────────────────────────
drop index if exists public.promo_redemption_promo_account_uniq;

-- ── submit_registration: same as 0003 minus the per-account guard ────────────
create or replace function public.submit_registration(p_batch_id uuid, p_slip_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_batch    registration_batch;
  v_hold     seat_hold;
  v_promo    promo_code;
  v_rows     int;
  v_gross    numeric(10, 2);
  v_discount numeric(10, 2) := 0;
  v_total    numeric(10, 2);
begin
  select * into v_batch from registration_batch where id = p_batch_id;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;

  -- ownership gate (mirror apply_promo): only the batch owner may submit
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_batch.account_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;

  if v_batch.status in ('pending_review', 'confirmed') then return _batch_json(p_batch_id); end if;
  perform release_expired_holds(v_batch.tournament_id);
  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  if v_hold.id is null or v_hold.status <> 'active' or v_hold.expires_at <= now() then
    raise exception 'HOLD_EXPIRED';
  end if;

  -- authoritative gross from seat fees — never trust the client or a stale column
  select coalesce(sum(fee_thb_snapshot), 0) into v_gross
    from registration_seat where batch_id = p_batch_id;
  v_total := v_gross;

  if v_batch.promo_code is not null then
    select * into v_promo from promo_code
      where tournament_id = v_batch.tournament_id and upper(code) = upper(v_batch.promo_code)
      for update;
    if v_promo.id is null or not v_promo.active then raise exception 'PROMO_INVALID'; end if;
    if v_promo.valid_from  is not null and now() < v_promo.valid_from  then raise exception 'PROMO_NOT_STARTED'; end if;
    if v_promo.valid_until is not null and now() > v_promo.valid_until then raise exception 'PROMO_EXPIRED'; end if;

    -- recompute the discount from the CURRENT promo so an admin edit between
    -- apply_promo and submit cannot grant an unintended free/over-discounted entry
    v_discount := _promo_discount(v_promo.kind, v_promo.value, v_gross);
    v_total := greatest(0, v_gross - v_discount);

    update promo_code set used_count = used_count + 1, updated_at = now()
      where id = v_promo.id and (max_uses is null or used_count < max_uses);
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception 'PROMO_EXHAUSTED'; end if;

    update registration_batch set
      promo_kind = v_promo.kind, promo_value = v_promo.value,
      discount_thb = v_discount, total_amount_thb = v_total, updated_at = now()
    where id = p_batch_id;

    insert into promo_redemption(promo_id, batch_id, account_id, discount_thb)
      values (v_promo.id, p_batch_id, v_batch.account_id, v_discount)
      on conflict (batch_id) do nothing;
  else
    update registration_batch set discount_thb = 0, total_amount_thb = v_total, updated_at = now()
      where id = p_batch_id;
  end if;

  update seat_hold set status = 'consumed' where id = v_hold.id;

  if v_total <= 0 then
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

revoke execute on function public.submit_registration(uuid, text) from anon;

-- ── list_participants: show confirmed + pending_review again ─────────────────
create or replace function public.list_participants(p_tournament_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
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
    and b.status in ('confirmed', 'pending_review');
$function$;
