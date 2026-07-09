-- Refund slip proof + terminal lock on refunded withdrawals.
--
-- Product change vs 20260708_0002: refunded withdrawals are now NETTED OUT of
-- the dashboard-displayed confirmed revenue (display-time subtraction on the
-- admin dashboard). registration_batch.total_amount_thb and
-- _recompute_batch_total remain untouched — the batch total is still the full
-- amount the batch paid; only the dashboard card subtracts refunded fees.
--
-- New rules enforced here:
--   * Setting refund_status = 'refunded' requires a refund-proof slip path
--     (bare object path in the private tesuji-slips bucket) → else SLIP_REQUIRED.
--   * Once 'refunded', the row is permanently locked — any further status
--     change (including refunded→refunded) raises LOCKED.
--   * pending ⇄ denied transitions stay free.
--   * Admins can read the private slip bucket directly (storage select policy)
--     so the client can mint signed URLs for refund slips without an edge call.

-- ============================================================================
-- 1. Column: refund-proof slip (bare path within the private tesuji-slips bucket)
-- ============================================================================

alter table public.seat_withdrawal
  add column if not exists refund_slip_url text;

-- ============================================================================
-- 2. admin_list_withdrawals — same signature, payload gains refundSlipUrl
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
      'refundStatus', w.refund_status, 'refundSlipUrl', w.refund_slip_url,
      'createdAt', w.created_at,
      'resolvedAt', w.resolved_at, 'resolvedBy', w.resolved_by)
      order by w.created_at desc)
    from seat_withdrawal w
    where w.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end; $function$;

-- ============================================================================
-- 3. admin_set_withdrawal_status — new p_refund_slip_url param + guards.
--    Signature changes, so drop the old 4-arg overload first (leaving both
--    would make PostgREST rpc() fail with an ambiguity error).
-- ============================================================================

drop function if exists public.admin_set_withdrawal_status(text, uuid, text, text);

create function public.admin_set_withdrawal_status(
  p_admin_secret text,
  p_withdrawal_id uuid,
  p_status text,
  p_admin_id text default 'admin',
  p_refund_slip_url text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_w seat_withdrawal;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_status not in ('pending','refunded','denied') then raise exception 'INVALID_STATUS'; end if;

  select * into v_w from seat_withdrawal where id = p_withdrawal_id for update;
  if v_w.id is null then raise exception 'NOT_FOUND'; end if;

  -- refunded is terminal: money already left the account. No transition away
  -- from it (not even refunded→refunded).
  if v_w.refund_status = 'refunded' then raise exception 'LOCKED'; end if;

  -- refunded requires proof: a bare private-bucket object path (same shape
  -- check as verify-slip's isPrivatePath — no slashes, schemes, or dot-dot).
  if p_status = 'refunded'
     and (p_refund_slip_url is null
          or p_refund_slip_url !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$') then
    raise exception 'SLIP_REQUIRED';
  end if;

  update seat_withdrawal set
    refund_status = p_status,
    refund_slip_url = case when p_status = 'refunded' then p_refund_slip_url
                           else refund_slip_url end,
    resolved_at = case when p_status = 'pending' then null else now() end,
    resolved_by = case when p_status = 'pending' then null else p_admin_id end
  where id = p_withdrawal_id
  returning * into v_w;

  return jsonb_build_object(
    'id', v_w.id, 'seatId', v_w.seat_id, 'batchId', v_w.batch_id,
    'tournamentId', v_w.tournament_id, 'personName', v_w.person_name,
    'categoryId', v_w.category_id, 'categoryLabel', v_w.category_label,
    'feeThb', v_w.fee_thb, 'batchReference', v_w.batch_reference,
    'reason', v_w.reason, 'bankName', v_w.bank_name,
    'bankAccountNo', v_w.bank_account_no, 'bankAccountName', v_w.bank_account_name,
    'refundStatus', v_w.refund_status, 'refundSlipUrl', v_w.refund_slip_url,
    'createdAt', v_w.created_at,
    'resolvedAt', v_w.resolved_at, 'resolvedBy', v_w.resolved_by);
end; $function$;

grant execute on function public.admin_set_withdrawal_status(text, uuid, text, text, text)
  to anon, authenticated;

-- ============================================================================
-- 4. Admin read access to the private slip bucket. Lets the admin client call
--    storage.createSignedUrl() directly for refund slips. _is_admin (post
--    20260705_0002) checks only account_roles via auth.uid(), so passing null
--    is fine. Admins already view every payment slip via verify-slip's "view"
--    action, so this expands convenience, not privilege.
-- ============================================================================

drop policy if exists tesuji_slips_admin_select on storage.objects;
create policy tesuji_slips_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tesuji-slips' and public._is_admin(null));

-- PostgREST picks up the new function signature immediately.
notify pgrst, 'reload schema';
