-- Pre-deploy hardening #1 — ownership gates on the user-facing money/batch RPCs.
-- These SECURITY DEFINER functions take a batch UUID straight from the caller and
-- were reachable by anon with no auth.uid()/account_id check. A leaked batchId let
-- anyone read a stranger's PII (get_batch_public), force-submit their batch, or
-- cancel it (release_batch). Gate all three by ownership, mirroring apply_promo,
-- and revoke anon execute. Internal helpers are revoked from client roles too.

-- ── get_batch_public: owner-only read ────────────────────────────────────────
create or replace function public.get_batch_public(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_acct uuid; v_tid uuid;
begin
  select account_id, tournament_id into v_acct, v_tid
    from registration_batch where id = p_batch_id;
  if v_tid is null then return null; end if;                 -- not found
  if auth.uid() is null or v_acct is distinct from auth.uid() then
    return null;                                             -- not the owner → no PII
  end if;
  perform release_expired_holds(v_tid);
  return _batch_json(p_batch_id);
end; $function$;

-- ── release_batch: owner-only cancel ─────────────────────────────────────────
create or replace function public.release_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_hold seat_hold; v_acct uuid;
begin
  select account_id into v_acct from registration_batch where id = p_batch_id;
  if v_acct is null then return; end if;                     -- not found → no-op
  if auth.uid() is null or v_acct is distinct from auth.uid() then
    return;                                                  -- not the owner → no-op
  end if;

  select h.* into v_hold from seat_hold h
    join registration_batch b on b.hold_id = h.id where b.id = p_batch_id;
  update registration_batch set status = 'cancelled', updated_at = now()
    where id = p_batch_id and status = 'pending_payment';
  if not found then return; end if;
  if v_hold.id is not null and v_hold.status = 'active' then
    update category c set seats_taken = greatest(0, c.seats_taken - l.seats), updated_at = now()
      from seat_hold_line l where l.hold_id = v_hold.id and c.id = l.category_id;
    update seat_hold set status = 'released', released_at = now() where id = v_hold.id;
  end if;
end; $function$;

-- ── lock down grants ─────────────────────────────────────────────────────────
-- Owner sessions are always authenticated (reserve_seats requires auth.uid()),
-- so anon never needs these. submit_registration is re-created in migration 0003
-- with the same ownership gate; revoke its anon grant here as well.
revoke execute on function public.get_batch_public(uuid)      from anon;
revoke execute on function public.release_batch(uuid)         from anon;
revoke execute on function public.submit_registration(uuid, text) from anon;

-- Internal helpers must never be client-callable (they were granted to anon by a
-- blanket grant). They run fine from the admin/user RPCs that call them (those are
-- SECURITY DEFINER and execute as owner).
revoke execute on function public._recompute_batch_total(uuid)              from anon, authenticated;
revoke execute on function public._promo_discount(text, numeric, numeric)   from anon, authenticated;
