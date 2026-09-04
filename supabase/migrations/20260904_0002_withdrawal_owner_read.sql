-- ── Let a registrant see the outcome of their own withdrawal ────────────────
-- withdraw_seat records bank details and a refund_status, but seat_withdrawal
-- has RLS enabled with NO policy, and 20260708_0002 added no owner-facing read
-- path — only admin_list_withdrawals. So after withdrawing, the seat simply
-- disappears from the roster and the registrant has no way to learn whether the
-- refund is รอดำเนินการ or คืนเงินแล้ว. Every refund question becomes a manual
-- message to the organizer.
--
-- Mirrors sdc_owner_select on seat_division_change, which already solves exactly
-- this for division changes — including the `(select auth.uid())` form, which
-- lets the planner hoist the call to an InitPlan instead of re-evaluating it per
-- row.
--
-- Owner-read only: no insert/update/delete policy, so the row stays writable
-- solely through the SECURITY DEFINER RPCs. A registrant reading their own bank
-- account number back is the same data they typed in.

grant select on public.seat_withdrawal to authenticated;

drop policy if exists sw_owner_select on public.seat_withdrawal;
create policy sw_owner_select on public.seat_withdrawal
  for select
  to authenticated
  using (account_id = (select auth.uid()));
