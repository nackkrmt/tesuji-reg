-- Pre-deploy hardening #3 — promo integrity + submit_registration ownership.
-- Fixes: (a) submit_registration had no ownership check; (b) it trusted the stale
-- discount written at apply_promo time (an admin edit in between desynced money) and
-- skipped the valid_from re-check; (c) max_uses was per-batch, so one account could
-- drain a whole limited code via many managed-player batches; (d) admin_upsert_promo
-- did no server-side bounds validation.

-- ── per-person cap backstop: one redemption of a code per account ────────────
create unique index if not exists promo_redemption_promo_account_uniq
  on public.promo_redemption (promo_id, account_id);

-- ── submit_registration: ownership + fresh money recompute + per-person cap ───
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

    -- per-person cap: one redemption of a given code per account
    if exists (select 1 from promo_redemption
                 where promo_id = v_promo.id and account_id = v_batch.account_id) then
      raise exception 'PROMO_ALREADY_USED';
    end if;

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
    -- no promo → total is the plain seat sum; clear any stale discount
    update registration_batch set discount_thb = 0, total_amount_thb = v_total, updated_at = now()
      where id = p_batch_id;
  end if;

  update seat_hold set status = 'consumed' where id = v_hold.id;

  -- free ($0) → confirmed directly (no slip, no admin step); payable keeps the slip path
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

-- ── admin_upsert_promo: server-side bounds validation ────────────────────────
create or replace function public.admin_upsert_promo(p_admin_secret text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id    uuid    := nullif(p_payload->>'id', '')::uuid;
  v_code  text    := btrim(coalesce(p_payload->>'code', ''));
  v_kind  text    := p_payload->>'kind';
  v_tid   uuid    := (p_payload->>'tournamentId')::uuid;
  v_value numeric := coalesce((p_payload->>'value')::numeric, 0);
  v_max   int     := nullif(p_payload->>'maxUses', '')::int;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if v_code = '' then raise exception 'CODE_REQUIRED'; end if;
  if v_kind not in ('free', 'percent', 'fixed') then raise exception 'KIND_INVALID'; end if;
  if v_tid is null then raise exception 'TOURNAMENT_REQUIRED'; end if;
  if v_kind = 'percent' and (v_value < 0 or v_value > 100) then raise exception 'VALUE_OUT_OF_RANGE'; end if;
  if v_kind = 'fixed'   and v_value < 0                    then raise exception 'VALUE_OUT_OF_RANGE'; end if;
  if v_max is not null and v_max < 0                       then raise exception 'MAX_USES_INVALID'; end if;

  if v_id is null then
    insert into promo_code(tournament_id, code, kind, value, max_uses, valid_from, valid_until, active, note)
    values (
      v_tid, v_code, v_kind, v_value, v_max,
      nullif(p_payload->>'validFrom', '')::timestamptz,
      nullif(p_payload->>'validUntil', '')::timestamptz,
      coalesce((p_payload->>'active')::boolean, true),
      nullif(p_payload->>'note', '')
    )
    returning id into v_id;
  else
    update promo_code set
      tournament_id = v_tid,
      code          = v_code,
      kind          = v_kind,
      value         = v_value,
      max_uses      = v_max,
      valid_from    = nullif(p_payload->>'validFrom', '')::timestamptz,
      valid_until   = nullif(p_payload->>'validUntil', '')::timestamptz,
      active        = coalesce((p_payload->>'active')::boolean, true),
      note          = nullif(p_payload->>'note', ''),
      updated_at    = now()
    where id = v_id;
  end if;

  return (select to_jsonb(pc) from promo_code pc where pc.id = v_id);
exception
  when unique_violation then raise exception 'CODE_DUPLICATE';
end; $function$;

-- ── table-level backstops so bad promo data can't exist via any path ─────────
alter table public.promo_code
  add constraint promo_value_bounds check (
    kind = 'free'
    or (kind = 'percent' and value >= 0 and value <= 100)
    or (kind = 'fixed'   and value >= 0)
  ),
  add constraint promo_max_uses_nonneg check (max_uses is null or max_uses >= 0);
