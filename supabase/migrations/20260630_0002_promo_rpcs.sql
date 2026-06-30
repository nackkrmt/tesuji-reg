-- Promo RPCs: user-facing apply_promo (preview, owner-gated) + admin CRUD.
-- Usage count is NOT incremented here — only at submit_registration (commit),
-- so abandoned/expired batches never consume a code's quota.

-- ── apply_promo (user) ──────────────────────────────────────────────────────
-- Validates a code against the batch's tournament and writes the discount onto
-- the batch (so the QR amount + slip check use the discounted total). Owner-only,
-- only while the batch is still pending_payment. Passing NULL/'' clears the code.
create or replace function public.apply_promo(p_batch_id uuid, p_code text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_batch    registration_batch;
  v_gross    numeric(10, 2);
  v_promo    promo_code;
  v_discount numeric(10, 2) := 0;
  v_total    numeric(10, 2);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED'); end if;

  select * into v_batch from registration_batch where id = p_batch_id;
  if v_batch.id is null then return jsonb_build_object('ok', false, 'error', 'BATCH_NOT_FOUND'); end if;
  if v_batch.account_id is distinct from v_uid then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  if v_batch.status <> 'pending_payment' then return jsonb_build_object('ok', false, 'error', 'NOT_PENDING_PAYMENT'); end if;

  select coalesce(sum(fee_thb_snapshot), 0) into v_gross
    from registration_seat where batch_id = p_batch_id;

  -- clear the code
  if p_code is null or btrim(p_code) = '' then
    update registration_batch
      set promo_code = null, promo_kind = null, promo_value = null,
          discount_thb = 0, total_amount_thb = v_gross, updated_at = now()
    where id = p_batch_id;
    return jsonb_build_object('ok', true, 'totalAmountThb', v_gross, 'discountThb', 0,
                              'isFree', (v_gross <= 0), 'kind', null, 'code', null);
  end if;

  select * into v_promo from promo_code
    where tournament_id = v_batch.tournament_id and upper(code) = upper(btrim(p_code));
  if v_promo.id is null then return jsonb_build_object('ok', false, 'error', 'PROMO_INVALID'); end if;
  if not v_promo.active then return jsonb_build_object('ok', false, 'error', 'PROMO_INACTIVE'); end if;
  if v_promo.valid_from is not null and now() < v_promo.valid_from then return jsonb_build_object('ok', false, 'error', 'PROMO_NOT_STARTED'); end if;
  if v_promo.valid_until is not null and now() > v_promo.valid_until then return jsonb_build_object('ok', false, 'error', 'PROMO_EXPIRED'); end if;
  if v_promo.max_uses is not null and v_promo.used_count >= v_promo.max_uses then return jsonb_build_object('ok', false, 'error', 'PROMO_EXHAUSTED'); end if;

  v_discount := _promo_discount(v_promo.kind, v_promo.value, v_gross);
  v_total := greatest(0, v_gross - v_discount);

  update registration_batch
    set promo_code = v_promo.code, promo_kind = v_promo.kind, promo_value = v_promo.value,
        discount_thb = v_discount, total_amount_thb = v_total, updated_at = now()
  where id = p_batch_id;

  return jsonb_build_object('ok', true, 'totalAmountThb', v_total, 'discountThb', v_discount,
                            'isFree', (v_total <= 0), 'kind', v_promo.kind, 'code', v_promo.code);
end;
$$;

-- ── admin CRUD ──────────────────────────────────────────────────────────────
create or replace function public.admin_list_promos(p_admin_secret text, p_tournament_id uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(pc) order by pc.created_at desc)
    from promo_code pc
    where p_tournament_id is null or pc.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_upsert_promo(p_admin_secret text, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_id   uuid := nullif(p_payload->>'id', '')::uuid;
  v_code text := btrim(coalesce(p_payload->>'code', ''));
  v_kind text := p_payload->>'kind';
  v_tid  uuid := (p_payload->>'tournamentId')::uuid;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if v_code = '' then raise exception 'CODE_REQUIRED'; end if;
  if v_kind not in ('free', 'percent', 'fixed') then raise exception 'KIND_INVALID'; end if;
  if v_tid is null then raise exception 'TOURNAMENT_REQUIRED'; end if;

  if v_id is null then
    insert into promo_code(tournament_id, code, kind, value, max_uses, valid_from, valid_until, active, note)
    values (
      v_tid, v_code, v_kind,
      coalesce((p_payload->>'value')::numeric, 0),
      nullif(p_payload->>'maxUses', '')::int,
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
      value         = coalesce((p_payload->>'value')::numeric, 0),
      max_uses      = nullif(p_payload->>'maxUses', '')::int,
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
end;
$$;

create or replace function public.admin_delete_promo(p_admin_secret text, p_promo_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  delete from promo_code where id = p_promo_id;
end;
$$;

-- ── grants (SECURITY DEFINER fns run as owner; gates protect them) ───────────
grant execute on function public.apply_promo(uuid, text)            to anon, authenticated;
grant execute on function public.admin_list_promos(text, uuid)      to anon, authenticated;
grant execute on function public.admin_upsert_promo(text, jsonb)    to anon, authenticated;
grant execute on function public.admin_delete_promo(text, uuid)     to anon, authenticated;
