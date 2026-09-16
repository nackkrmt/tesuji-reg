-- ── State machine, money and the audit trail ─────────────────────────────────
-- Audit 2026-09-15. Nine defects that all share one shape: an RPC performs a
-- transition the rest of the system believes is impossible, and the money or
-- the history that transition destroys is never written down anywhere.
--
--   1. WITHDRAWAL vs A PAID UPGRADE. request_division_change takes the
--      player's transfer slip BEFORE it writes the pending row, so a pending
--      'upgrade' means money is already in the organiser's account. Neither
--      withdraw_seat nor admin_delete_seat looked at seat_division_change.
--      After a withdrawal admin_resolve_division_change refuses the request
--      (ALREADY_WITHDRAWN) so it can only be rejected, and the seat_withdrawal
--      row records only fee_thb_snapshot — the OLD fee — so the upgrade
--      difference appears on no refund worklist. admin_delete_seat was worse:
--      seat_division_change.seat_id is ON DELETE CASCADE, so the request and
--      its slip path vanished with the seat. withdraw_seat now folds a pending
--      upgrade into the refund amount and auto-rejects the request;
--      admin_delete_seat refuses outright.
--
--   2. RE-PRICING A PAID BATCH. admin_update_seat rewrote fee_thb_snapshot and
--      admin_delete_seat re-ran _recompute_batch_total with no status check at
--      all, so an admin edit could change what a CONFIRMED registration owes
--      after the money moved — exactly what 20260720_0001 built
--      seat_division_change to prevent. withdraw_seat deliberately does the
--      opposite: it keeps the total and writes a refund row. Both now refuse
--      when a confirmed batch's money would change; equal-fee moves and plain
--      detail edits (typo, phone, dob) stay open.
--
--   3. delete_category CASCADED AWAY HISTORY. The guard was `seats_taken > 0`,
--      but seats_taken counts only live hold lines: a division whose batches
--      were all rejected/expired/cancelled, or whose confirmed seats were all
--      withdrawn (withdraw_seat decrements it), reports 0 while still owning
--      registration_seat rows. registration_seat.category_id is ON DELETE
--      CASCADE and seat_withdrawal.seat_id cascades from the seat, so one
--      admin click could destroy historical registrations, their refund
--      records, and the seat_hold_line rows admin_reopen_batch needs. The
--      guard is now existence of any seat or hold line. delete_category also
--      strips the id out of sibling categories' combinable_category_ids
--      (a plain uuid[] with no FK, so nothing else would).
--
--   4. NO STATUS PRECONDITION ON reject/delete. confirm_registration has
--      guarded `status = 'pending_review'` since day one and the admin UI only
--      offers ปฏิเสธ on that status, but reject_registration itself accepted
--      any batch: a confirmed (paid) one lost its seats with no refund row, a
--      cancelled/expired one was rewritten to 'rejected' and so became
--      eligible for admin_reopen_batch. admin_delete_batch likewise cancelled
--      confirmed batches.
--
--   5. PROMO COUNTERS WERE NEVER RELEASED. submit_registration increments
--      promo_code.used_count and writes a promo_redemption row, but rejecting,
--      cancelling or emptying the batch returned the seats and left the counter
--      spent, so a max_uses code is exhausted by registrations that never paid.
--      The three release paths now hand the use back; admin_reopen_batch takes
--      it again when it revives a rejected batch, so the counter stays honest
--      in both directions.
--
--   6. A WITHDRAWAL COULD NOT BE UNDONE. withdraw_seat sets withdrawn_at and
--      frees the capacity immediately, and the admin's only lever was
--      refund_status — 'denied' left the player withdrawn. A mistaken tap by a
--      parent, or a denied refund where the organiser still wants the player
--      to play, needed hand-edits to three tables. admin_reinstate_seat does
--      it under the hold lock.
--
--   7. 'closed' TOURNAMENTS STILL ACCEPTED ROSTER CHANGES. reserve_seats
--      requires status = 'published', but swap_seat, preview_division_change
--      and request_division_change checked only registration_closes_at. An
--      organiser who freezes registration early by flipping the status still
--      let owners swap occupants and move divisions — possibly after the
--      pairings were drawn.
--
--   8. THE DANGER ZONE ABORTED ON AN FK VIOLATION. admin_selective_reset's
--      'accounts' branch skipped the account_id null-outs whenever
--      'registrations' was also ticked — but with p_tournament_id set the
--      registrations branch only clears THAT tournament's rows, so every other
--      tournament's registration_batch still pointed at users about to be
--      deleted and `delete from auth.users` tripped
--      registration_batch_account_id_fkey (no ON DELETE clause on prod).
--      seat_division_change.account_id was never cleared in either branch, so
--      even a global accounts-only reset failed (prod has one such row). The
--      null-outs are now unconditional and cover all four FKs. The same branch
--      also deleted the OTHER admin — account_roles cascades from auth.users
--      and there is no admin-grant UI — so every admin account is now kept.
--
--   9. THE AUDIT TRAIL WAS A CONSTANT. The admin RPCs take p_admin_id and the
--      browser fills it with the literal string "admin": on prod the only
--      distinct value in registration_batch.reviewed_by and
--      seat_withdrawal.resolved_by is 'admin', so with two admin accounts no
--      confirm, reject or refund is attributable. The RPCs already know the
--      real actor — _is_admin checked auth.uid() — and threw it away. They now
--      record _admin_actor() and IGNORE the parameter. The parameter stays in
--      every signature on purpose: PostgREST resolves overloads by argument
--      list, so dropping it would both break the deployed client mid-deploy
--      and silently leave a second overload behind.
--
-- Also here, because it is the same transaction shape and the same FK layout:
--
--  10. RIGHT TO ERASURE. The privacy notice (lib/i18n th.ts) promises erasure
--      on request via the organiser, and the organiser had no tool — the only
--      account deletion in the product is the reset's 'accounts' group, which
--      deletes everyone. A bare `delete from auth.users where id = $1` fails
--      for anyone who ever registered: registration_batch, seat_withdrawal,
--      seat_division_change and promo_redemption all reference auth.users with
--      ON DELETE NO ACTION.
--
--      admin_delete_account nulls those four account_id columns inside ONE
--      transaction and then deletes the user, rather than changing the FKs to
--      CASCADE. That is deliberate: under CASCADE the erasure would also
--      delete the registrations, the refund records and the promo redemptions,
--      and the organiser must still be able to reconcile the money that moved
--      and prove who played in a finished tournament. So the account, its
--      profile, its managed players and its roles go (those FKs already
--      cascade), and the registration history survives as rows with no owner.
--
--      What this deliberately does NOT do: registration_seat keeps the
--      player's name, phone and date of birth. Those columns are the
--      tournament's participant record, not the account's — the same row is
--      what the live board and the MacMahon export pair on, and a registration
--      can be made for a person who has no account at all. Scrubbing a
--      participant is a separate decision from deleting an account and needs
--      its own RPC.
--
-- SLIP VALIDATION (SECDB-7). submit_registration stored whatever string the
-- owner passed as p_slip_url, unlike admin_set_withdrawal_status and
-- request_division_change, which both require a bare private-bucket object
-- path. That let a payable batch reach 'pending_review' with no slip at all,
-- or carrying another registrant's object name, which the admin would then be
-- shown as this batch's proof. Payable batches now get the same check. Prod is
-- clean today (124 slips, 0 non-standard paths) so nothing existing breaks.
--
-- NOT FIXED HERE, on purpose:
--   • The orphaned slip of a hold that expires mid-payment. The suggested fix
--     — stamp payment_slip_url on the batch and THEN raise HOLD_EXPIRED —
--     cannot work: the raise aborts the transaction the update lives in, so
--     the row is rolled back with it. Recording a late payment needs a writer
--     outside this transaction (the client, or an edge function). What IS
--     fixed is the neighbouring lie: two concurrent submits of the same batch
--     used to report HOLD_EXPIRED to the loser, because the status is read
--     before the FOR UPDATE and the hold reads 'consumed' after it. The loser
--     now gets the batch as it now stands.
--   • Reserving a seat in the target division while an upgrade is pending. The
--     only correct version of that holds a seat the batch does not yet occupy,
--     which breaks the invariant seat_hold_line == seats that
--     release_expired_holds, admin_reopen_batch, reject_registration,
--     admin_delete_batch and admin_selective_reset all rely on (they add and
--     subtract whole hold lines). Doing it safely is its own migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) Helpers
-- ─────────────────────────────────────────────────────────────────────────────

-- Who is actually doing this. Falls back to the uid, then to 'system' for the
-- service-role callers (the admin-reset edge function) that have no JWT.
-- ─────────────────────────────────────────────────────────────────────────────
-- 0) Shared slip-path validator (moved here from 20260915_0001)
-- ─────────────────────────────────────────────────────────────────────────────
-- Lives in this file, not in 0001 where the `<uid>/` storage policy that makes
-- it necessary is written, purely because of apply order: 0001 ships LAST (it
-- must not tighten storage before the frontend writing the new path is live),
-- while this file ships FIRST. Defined in 0001 it would not exist yet when the
-- functions below start calling it, and plpgsql resolves a called function at
-- RUN time — so every slip submission would fail on a missing function for the
-- whole window between the two migrations, which is the exact outage the split
-- release exists to avoid.
-- One definition instead of five copies. Both shapes stay legal because the 124
-- slips already in the bucket are root-level and still have to validate:
--   legacy   abc123.jpg
--   current  550e8400-e29b-41d4-a716-446655440000/abc123.jpg
-- Still no scheme, no traversal: exactly one optional UUID directory, and the
-- filename may not contain a slash or start with a dot.
create or replace function public._is_slip_path(p_path text)
returns boolean
language sql immutable set search_path to 'public'
as $$
  select p_path ~ ('^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
                || '[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)?'
                || '[A-Za-z0-9][A-Za-z0-9._-]*$');
$$;
revoke all on function public._is_slip_path(text) from public, anon, authenticated;

create or replace function public._admin_actor()
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select coalesce(
    (select u.email from auth.users u where u.id = auth.uid()),
    nullif(auth.uid()::text, ''),
    'system');
$fn$;

revoke all on function public._admin_actor() from public, anon, authenticated;

-- Hand a promo use back to the pool. Called wherever a batch stops being a
-- registration: reject, delete, and the last seat leaving. The batch keeps its
-- promo_code / promo_kind / discount_thb so total_amount_thb stays coherent
-- and a reopen shows the same numbers the applicant agreed to.
create or replace function public._release_batch_promo(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_promo_id uuid;
begin
  delete from promo_redemption where batch_id = p_batch_id
    returning promo_id into v_promo_id;
  if v_promo_id is not null then
    update promo_code set used_count = greatest(0, used_count - 1), updated_at = now()
      where id = v_promo_id;
  end if;
end; $fn$;

revoke all on function public._release_batch_promo(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Categories: deleting one must not cascade history away
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.delete_category(p_admin_secret text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_tid uuid;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select tournament_id into v_tid from category where id = p_id;
  if v_tid is null then raise exception 'CATEGORY_NOT_FOUND'; end if;

  -- seats_taken alone is not enough: it counts live hold lines, so a division
  -- whose batches were all rejected/expired or whose seats were all withdrawn
  -- reads 0 while registration_seat rows (and the seat_withdrawal refund rows
  -- that cascade from them) still hang off it.
  if exists (select 1 from registration_seat where category_id = p_id)
     or exists (select 1 from seat_hold_line where category_id = p_id)
     or exists (select 1 from category where id = p_id and seats_taken > 0) then
    raise exception 'CATEGORY_IN_USE';
  end if;

  -- combinable_category_ids is a plain uuid[] with no FK, so nothing else
  -- would notice this id going away and reserve_seats would keep testing a
  -- dangling member.
  update category
     set combinable_category_ids = array_remove(combinable_category_ids, p_id),
         updated_at = now()
   where tournament_id = v_tid
     and combinable_category_ids @> array[p_id];

  delete from category where id = p_id;
end; $fn$;

revoke all on function public.delete_category(text, uuid) from public, anon, authenticated;
grant execute on function public.delete_category(text, uuid) to anon, authenticated, service_role;

create or replace function public.upsert_category(p_admin_secret text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_id uuid; v_tid uuid; v_existing category; v_row category; v_cap int; v_code text;
  v_min int; v_max int; v_min_age int; v_max_age int; v_comb uuid[]; v_bad uuid;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  v_id := nullif(p_payload->>'id', '')::uuid;
  v_tid := (p_payload->>'tournamentId')::uuid;
  v_cap := (p_payload->>'capacity')::int;
  v_code := p_payload->>'code';
  v_min := nullif(p_payload->>'minPowerLevel', '')::int;
  v_max := nullif(p_payload->>'maxPowerLevel', '')::int;
  v_min_age := nullif(p_payload->>'minAge', '')::int;
  v_max_age := nullif(p_payload->>'maxAge', '')::int;
  v_comb := coalesce(
    (select array_agg(val::uuid)
       from jsonb_array_elements_text(coalesce(p_payload->'combinableCategoryIds', '[]'::jsonb)) as t(val)),
    '{}'::uuid[]);

  -- On the update path the row decides which tournament this is, not the
  -- payload. An unknown id used to leave v_existing null, so `v_cap < null`
  -- raised nothing, the UPDATE hit 0 rows and the function returned
  -- to_jsonb(null) for the client to crash on; and a payload naming a
  -- DIFFERENT tournament made the duplicate-code check below look in the wrong
  -- place, leaving only the exact UNIQUE(tournament_id, code).
  if v_id is not null then
    select * into v_existing from category where id = v_id for update;
    if v_existing.id is null then raise exception 'CATEGORY_NOT_FOUND'; end if;
    v_tid := v_existing.tournament_id;
    if v_cap < v_existing.seats_taken then raise exception 'CAPACITY_BELOW_TAKEN:%', v_existing.seats_taken; end if;
  end if;
  if v_tid is null then raise exception 'TOURNAMENT_REQUIRED'; end if;

  if exists(select 1 from category where tournament_id = v_tid
            and lower(trim(code)) = lower(trim(v_code)) and (v_id is null or id <> v_id)) then
    raise exception 'DUPLICATE_CODE';
  end if;

  -- combinable_category_ids has no FK. reserve_seats and admin_update_seat
  -- decide COMBINATION_NOT_ALLOWED with `= any(...)`, so an id from another
  -- tournament would quietly make a foreign division 'combinable'.
  select x into v_bad
    from unnest(v_comb) x
    where x = v_id
       or not exists (select 1 from category c where c.id = x and c.tournament_id = v_tid)
    limit 1;
  if v_bad is not null then raise exception 'INVALID_COMBINABLE'; end if;

  if v_id is null then
    insert into category(tournament_id, code, name, skill_level, capacity, fee_thb, sort_order,
      min_power_level, max_power_level, min_age, max_age, combinable_category_ids)
    values (v_tid, v_code, p_payload->>'name', coalesce(p_payload->>'skillLevel', ''), v_cap,
      (p_payload->>'feeThb')::numeric, coalesce((p_payload->>'sortOrder')::int, 0), v_min, v_max,
      v_min_age, v_max_age, v_comb)
    returning * into v_row;
  else
    update category set code = v_code, name = p_payload->>'name',
      skill_level = coalesce(p_payload->>'skillLevel', ''), capacity = v_cap,
      fee_thb = (p_payload->>'feeThb')::numeric,
      sort_order = coalesce((p_payload->>'sortOrder')::int, sort_order),
      min_power_level = v_min, max_power_level = v_max,
      min_age = v_min_age, max_age = v_max_age,
      combinable_category_ids = v_comb, updated_at = now()
    where id = v_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end; $fn$;

revoke all on function public.upsert_category(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_category(text, jsonb) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Promo codes: a code may not change tournament under its users' feet
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_upsert_promo(p_admin_secret text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id    uuid    := nullif(p_payload->>'id', '')::uuid;
  v_code  text    := btrim(coalesce(p_payload->>'code', ''));
  v_kind  text    := p_payload->>'kind';
  v_tid   uuid    := (p_payload->>'tournamentId')::uuid;
  v_value numeric := coalesce((p_payload->>'value')::numeric, 0);
  v_max   int     := nullif(p_payload->>'maxUses', '')::int;
  v_cur   uuid;
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
    -- The edit form on /admin/codes keeps its state across a tournament-picker
    -- switch and always sends the CURRENTLY selected tournament, so saving an
    -- edit after switching used to re-parent the code: it vanished from the
    -- tournament whose applicants were typing it, and its promo_redemption
    -- rows ended up pointing at a code of another event. A promo's tournament
    -- is fixed at creation; move it by making a new code.
    select tournament_id into v_cur from promo_code where id = v_id;
    if v_cur is null then raise exception 'PROMO_NOT_FOUND'; end if;
    if v_cur <> v_tid then raise exception 'TOURNAMENT_MISMATCH'; end if;

    update promo_code set
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
end; $fn$;

revoke all on function public.admin_upsert_promo(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_upsert_promo(text, jsonb) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Batch review: state machine + real actor + promo accounting
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.confirm_registration(p_batch_id uuid, p_admin_secret text, p_admin_id text default 'admin'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_batch registration_batch;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  -- p_admin_id is accepted and ignored; see the header.
  update registration_batch set status = 'confirmed', reviewed_by = _admin_actor(), reviewed_at = now(), updated_at = now()
    where id = p_batch_id and status = 'pending_review' returning * into v_batch;
  if v_batch.id is null then raise exception 'NOT_PENDING_REVIEW'; end if;
  return _batch_json(p_batch_id);
end; $fn$;

revoke all on function public.confirm_registration(uuid, text, text) from public, anon, authenticated;
grant execute on function public.confirm_registration(uuid, text, text) to anon, authenticated, service_role;

create or replace function public.reject_registration(p_batch_id uuid, p_admin_secret text, p_note text, p_admin_id text default 'admin'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_hold seat_hold; v_batch registration_batch;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select * into v_batch from registration_batch where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;

  -- The state machine confirm_registration enforces and the admin UI relies on
  -- (ปฏิเสธ only shows on 'pending_review'), finally enforced here too:
  -- rejecting a CONFIRMED batch released its seats with no refund record, and
  -- rejecting a cancelled/expired one rewrote a terminal status into one that
  -- admin_reopen_batch accepts. Un-confirming is still possible — reopen
  -- first, which is the path that re-takes the seats.
  if v_batch.status <> 'pending_review' then raise exception 'NOT_PENDING_REVIEW'; end if;

  select h.* into v_hold from seat_hold h
    join registration_batch b on b.hold_id = h.id where b.id = p_batch_id for update;
  if v_hold.id is not null and v_hold.status in ('active', 'consumed') then
    update category c set seats_taken = greatest(0, c.seats_taken - l.seats), updated_at = now()
      from seat_hold_line l where l.hold_id = v_hold.id and c.id = l.category_id;
    update seat_hold set status = 'released', released_at = now() where id = v_hold.id;
  end if;

  -- the seats go back to the pool, so the promo use does too
  perform _release_batch_promo(p_batch_id);

  update registration_batch set status = 'rejected', admin_note = p_note,
    reviewed_by = _admin_actor(), reviewed_at = now(), updated_at = now() where id = p_batch_id;
  return _batch_json(p_batch_id);
end; $fn$;

revoke all on function public.reject_registration(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reject_registration(uuid, text, text, text) to anon, authenticated, service_role;

create or replace function public.admin_delete_batch(p_admin_secret text, p_batch_id uuid, p_admin_id text default 'admin'::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_batch registration_batch; v_hold seat_hold;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select * into v_batch from registration_batch where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;

  -- already cancelled: nothing to do, and the admin clicked twice
  if v_batch.status = 'cancelled' then return; end if;

  -- 'expired' is terminal — release_expired_holds already returned the seats.
  -- Rewriting it to 'cancelled' only loses why the batch died.
  if v_batch.status = 'expired' then raise exception 'BATCH_NOT_DELETABLE'; end if;

  -- Cancelling a batch whose money arrived releases the seats and leaves
  -- nothing on the refund worklist. Withdraw the seats instead (that writes
  -- seat_withdrawal rows with the payer's bank details), or reopen and reject.
  if v_batch.status = 'confirmed' and coalesce(v_batch.total_amount_thb, 0) > 0 then
    raise exception 'BATCH_IS_CONFIRMED';
  end if;

  select h.* into v_hold from seat_hold h
    join registration_batch b on b.hold_id = h.id where b.id = p_batch_id for update;
  if v_hold.id is not null and v_hold.status in ('active', 'consumed') then
    update category c set seats_taken = greatest(0, c.seats_taken - l.seats), updated_at = now()
      from seat_hold_line l where l.hold_id = v_hold.id and c.id = l.category_id;
    update seat_hold set status = 'released', released_at = now() where id = v_hold.id;
  end if;

  perform _release_batch_promo(p_batch_id);

  update registration_batch set status = 'cancelled', updated_at = now() where id = p_batch_id;
end; $fn$;

revoke all on function public.admin_delete_batch(text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_batch(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.admin_reopen_batch(p_admin_secret text, p_batch_id uuid, p_note text default null::text, p_admin_id text default 'admin'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_batch registration_batch;
  v_hold  seat_hold;
  v_short text;
  v_promo promo_code;
  v_rows  int;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select * into v_batch from registration_batch where id = p_batch_id for update;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;
  if v_batch.status not in ('confirmed', 'rejected') then
    raise exception 'NOT_REOPENABLE';
  end if;

  select * into v_hold from seat_hold where id = v_batch.hold_id for update;

  if v_batch.status = 'rejected' then
    if v_hold.id is null then raise exception 'HOLD_NOT_FOUND'; end if;

    select c.name into v_short
    from seat_hold_line l
    join category c on c.id = l.category_id
    where l.hold_id = v_hold.id
      and c.seats_taken + l.seats > c.capacity
    order by c.name
    limit 1;
    if v_short is not null then
      raise exception 'INSUFFICIENT_SEATS:%', v_short;
    end if;

    perform 1 from category c
      join seat_hold_line l on l.category_id = c.id
      where l.hold_id = v_hold.id
      order by c.id
      for update of c;

    update category c
      set seats_taken = c.seats_taken + l.seats, updated_at = now()
      from seat_hold_line l
      where l.hold_id = v_hold.id and c.id = l.category_id;

    update seat_hold
      set status = 'consumed', released_at = null
      where id = v_hold.id;

    -- The rejection handed this batch's promo use back to the pool along with
    -- its seats; take it back with them, or the counter under-counts while the
    -- batch keeps its discount. A code that filled up meanwhile blocks the
    -- reopen for the same reason a full division does.
    if v_batch.promo_code is not null
       and not exists (select 1 from promo_redemption where batch_id = p_batch_id) then
      select * into v_promo from promo_code
        where tournament_id = v_batch.tournament_id
          and upper(code) = upper(v_batch.promo_code)
        for update;
      if v_promo.id is not null then
        update promo_code set used_count = used_count + 1, updated_at = now()
          where id = v_promo.id and (max_uses is null or used_count < max_uses);
        get diagnostics v_rows = row_count;
        if v_rows = 0 then raise exception 'PROMO_EXHAUSTED'; end if;
        insert into promo_redemption(promo_id, batch_id, account_id, discount_thb)
          values (v_promo.id, p_batch_id, v_batch.account_id, coalesce(v_batch.discount_thb, 0))
          on conflict (batch_id) do nothing;
      end if;
    end if;
  end if;

  update registration_batch
    set status = 'pending_review',
        admin_note = case
          when p_note is null or btrim(p_note) = '' then admin_note
          else p_note
        end,
        reviewed_by = _admin_actor(),
        reviewed_at = now(),
        updated_at = now()
    where id = p_batch_id;

  return _batch_json(p_batch_id);
end;
$fn$;

revoke all on function public.admin_reopen_batch(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_reopen_batch(text, uuid, text, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Submit: the slip has to be a slip, and a lost race is not an expiry
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.submit_registration(p_batch_id uuid, p_slip_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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

  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_batch.account_id is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;

  if v_batch.status in ('pending_review', 'confirmed') then return _batch_json(p_batch_id); end if;
  perform release_expired_holds(v_batch.tournament_id);
  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  if v_hold.id is null then raise exception 'HOLD_EXPIRED'; end if;

  -- The status read above predates this lock, so the loser of two concurrent
  -- submits of the same batch used to be told HOLD_EXPIRED for a hold the
  -- winner had just consumed. Report what the batch now is instead.
  if v_hold.status = 'consumed' then return _batch_json(p_batch_id); end if;

  if v_hold.status <> 'active' or v_hold.expires_at <= now() then
    raise exception 'HOLD_EXPIRED';
  end if;

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
    -- Every other slip writer (admin_set_withdrawal_status,
    -- request_division_change) requires a bare private-bucket object path —
    -- the same shape verify-slip's isPrivatePath accepts. This one stored any
    -- string, so a payable batch could sit in 'pending_review' with no proof
    -- at all, or carrying an object name belonging to somebody else's slip,
    -- which the admin would then be shown as this batch's payment.
    if p_slip_url is null or not public._is_slip_path(p_slip_url) then
      raise exception 'SLIP_REQUIRED';
    end if;
    update registration_batch set status = 'pending_review', payment_slip_url = p_slip_url, updated_at = now()
      where id = p_batch_id;
  end if;

  return _batch_json(p_batch_id);
end; $fn$;

revoke all on function public.submit_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_registration(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Withdrawal: carry the pending upgrade's money, and allow an undo
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.withdraw_seat(p_seat_id uuid, p_reason text, p_bank_name text, p_bank_account_no text, p_bank_account_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_seat registration_seat; v_batch registration_batch;
  v_hold seat_hold; v_occupies boolean;
  v_cat category; v_person_name text; v_wid uuid;
  v_pending seat_division_change; v_fee numeric(10,2);
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

  if btrim(coalesce(p_bank_name, '')) = '' or char_length(p_bank_name) > 100
     or btrim(coalesce(p_bank_account_name, '')) = '' or char_length(p_bank_account_name) > 100
     or coalesce(p_bank_account_no, '') !~ '^[0-9][0-9 -]{4,29}$'
     or char_length(coalesce(p_reason, '')) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD');
  end if;

  -- A pending division change dies with this seat: admin_resolve_division_change
  -- refuses a withdrawn seat, so the request could only ever be rejected after
  -- this point. For an UPGRADE the player already transferred amount_thb (the
  -- slip is taken before the request row is written), and the withdrawal below
  -- records only fee_thb_snapshot — the old fee — so that difference used to
  -- land on no refund worklist at all. Fold it in and close the request.
  -- A downgrade needs no adjustment: nothing has been refunded yet and
  -- fee_thb_snapshot is still the amount the player actually paid.
  select * into v_pending from seat_division_change
    where seat_id = p_seat_id and status = 'pending' for update;

  v_fee := v_seat.fee_thb_snapshot
    + case when v_pending.id is not null and v_pending.direction = 'upgrade'
           then v_pending.amount_thb else 0 end;

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

  if v_pending.id is not null then
    update seat_division_change set
      status = 'rejected',
      admin_note = btrim(coalesce(admin_note || ' · ', '')
        || 'ปิดอัตโนมัติเพราะผู้สมัครถอนตัว — ยอดรวมอยู่ในรายการคืนเงิน'),
      resolved_at = now(),
      resolved_by = 'system:withdraw_seat'
    where id = v_pending.id;
  end if;

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
    v_fee, v_batch.reference_code,
    nullif(btrim(coalesce(p_reason, '')), ''),
    btrim(p_bank_name), btrim(p_bank_account_no), btrim(p_bank_account_name))
  returning id into v_wid;

  return jsonb_build_object('ok', true, 'withdrawalId', v_wid);
end; $fn$;

revoke all on function public.withdraw_seat(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.withdraw_seat(uuid, text, text, text, text) to authenticated, service_role;

create or replace function public.admin_set_withdrawal_status(p_admin_secret text, p_withdrawal_id uuid, p_status text, p_admin_id text default 'admin'::text, p_refund_slip_url text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_w seat_withdrawal;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_status not in ('pending','refunded','denied') then raise exception 'INVALID_STATUS'; end if;

  select * into v_w from seat_withdrawal where id = p_withdrawal_id for update;
  if v_w.id is null then raise exception 'NOT_FOUND'; end if;

  -- refunded is terminal: money already left the account. No transition away
  -- from it (not even refunded→refunded).
  if v_w.refund_status = 'refunded' then raise exception 'LOCKED'; end if;

  -- refunded requires proof: a private-bucket object path, validated by the
  -- shared _is_slip_path (defined at the top of this file) so this agrees with
  -- isPrivatePath and with the per-uploader `<uid>/` prefix — no scheme, no
  -- traversal, at most one folder.
  if p_status = 'refunded'
     and (p_refund_slip_url is null
          or not public._is_slip_path(p_refund_slip_url)) then
    raise exception 'SLIP_REQUIRED';
  end if;

  -- p_admin_id is accepted and ignored; see the header.
  update seat_withdrawal set
    refund_status = p_status,
    refund_slip_url = case when p_status = 'refunded' then p_refund_slip_url
                           else refund_slip_url end,
    resolved_at = case when p_status = 'pending' then null else now() end,
    resolved_by = case when p_status = 'pending' then null else _admin_actor() end
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
end; $fn$;

revoke all on function public.admin_set_withdrawal_status(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_withdrawal_status(text, uuid, text, text, text) to anon, authenticated, service_role;

-- Put a withdrawn player back. withdraw_seat has no confirmation window: one
-- tap frees the capacity and sets withdrawn_at, and refund_status was the
-- admin's only lever afterwards — 'denied' left the seat withdrawn, and
-- admin_update_seat, swap_seat and the division-change RPCs all refuse a
-- withdrawn seat. Reinstating meant hand-editing registration_seat, category
-- and seat_hold_line in the SQL editor.
--
-- New function, so there is no deployed caller to keep compatible and no
-- p_admin_id to ignore. It takes no note either: seat_withdrawal has nowhere
-- to put one, and a parameter that silently does nothing is the defect this
-- migration spent item 9 removing.
create or replace function public.admin_reinstate_seat(p_admin_secret text, p_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_w seat_withdrawal; v_seat registration_seat; v_batch registration_batch;
  v_cat category; v_hold seat_hold; v_occupies boolean;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select * into v_w from seat_withdrawal where id = p_withdrawal_id for update;
  if v_w.id is null then raise exception 'NOT_FOUND'; end if;

  -- the money is already back in the player's account; reinstating would mean
  -- they play without having paid
  if v_w.refund_status = 'refunded' then raise exception 'LOCKED'; end if;

  select * into v_seat from registration_seat where id = v_w.seat_id for update;
  if v_seat.id is null then raise exception 'SEAT_NOT_FOUND'; end if;
  if v_seat.withdrawn_at is null then raise exception 'NOT_WITHDRAWN'; end if;

  select * into v_batch from registration_batch where id = v_seat.batch_id for update;
  if v_batch.status not in ('confirmed', 'pending_review') then
    raise exception 'BATCH_NOT_ACTIVE';
  end if;

  select * into v_cat from category where id = v_seat.category_id for update;
  if v_cat.id is null then raise exception 'CATEGORY_NOT_FOUND'; end if;

  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');

  -- the capacity this withdrawal freed may have been taken by somebody else
  if v_occupies then
    if (v_cat.capacity - v_cat.seats_taken) < 1 then
      raise exception 'INSUFFICIENT_SEATS:%', v_cat.name;
    end if;
    update category set seats_taken = seats_taken + 1, updated_at = now()
      where id = v_cat.id;
    if exists (select 1 from seat_hold_line where hold_id = v_hold.id and category_id = v_cat.id) then
      update seat_hold_line set seats = seats + 1
        where hold_id = v_hold.id and category_id = v_cat.id;
    else
      insert into seat_hold_line(hold_id, category_id, seats) values (v_hold.id, v_cat.id, 1);
    end if;
  end if;

  update registration_seat set withdrawn_at = null where id = v_seat.id;

  -- the withdrawal row stays as the record that this happened; 'denied' is the
  -- existing terminal status for "no money is going back"
  update seat_withdrawal set
    refund_status = 'denied',
    resolved_at = now(),
    resolved_by = _admin_actor()
  where id = p_withdrawal_id
  returning * into v_w;

  return jsonb_build_object('ok', true, 'withdrawalId', v_w.id, 'seatId', v_seat.id);
end; $fn$;

revoke all on function public.admin_reinstate_seat(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_reinstate_seat(text, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Admin seat edits: never re-price a batch whose money already arrived
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_delete_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_admin_id text default 'admin'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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

  -- Deleting a paid seat re-runs _recompute_batch_total below, rewriting what
  -- a CONFIRMED registration owes after the money arrived, and leaves no
  -- refund row — the opposite of withdraw_seat, which keeps the total and
  -- writes one. Free seats have no money to settle, so they stay deletable.
  if v_batch.status = 'confirmed' and coalesce(v_seat.fee_thb_snapshot, 0) > 0 then
    raise exception 'USE_WITHDRAWAL';
  end if;

  -- seat_division_change.seat_id is ON DELETE CASCADE, so deleting this seat
  -- would take a pending request — including the payment slip path proving the
  -- player transferred the upgrade difference — with it.
  if exists (select 1 from seat_division_change
             where seat_id = p_seat_id and status = 'pending') then
    raise exception 'PENDING_DIVISION_CHANGE';
  end if;

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
    -- nothing is registered any more, so the promo use goes back too
    perform _release_batch_promo(p_batch_id);
    update registration_batch set status = 'cancelled', total_amount_thb = 0, discount_thb = 0, updated_at = now()
      where id = p_batch_id;
  else
    perform _recompute_batch_total(p_batch_id);
  end if;

  return _batch_json(p_batch_id);
end; $fn$;

revoke all on function public.admin_delete_seat(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_seat(text, uuid, uuid, text) to anon, authenticated, service_role;

create or replace function public.admin_update_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_payload jsonb, p_admin_id text default 'admin'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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

  -- 20260720_0001 put every fee change on a CONFIRMED batch through the
  -- division-change worklist so what the dashboard reports and what arrived in
  -- the bank stay the same number. This path had no status check at all: it
  -- rewrote fee_thb_snapshot and total_amount_thb with no settlement record
  -- and nothing for anyone to reconcile against. Same-fee moves and plain
  -- detail edits (typo, phone, dob, rank) are untouched.
  if v_batch.status = 'confirmed' and v_moving
     and v_new_cat.fee_thb <> v_seat.fee_thb_snapshot then
    raise exception 'USE_DIVISION_CHANGE';
  end if;

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
    if v_dob is null then raise exception 'AGE_NOT_ELIGIBLE'; end if;
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
end; $fn$;

revoke all on function public.admin_update_seat(text, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_update_seat(text, uuid, uuid, jsonb, text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) A 'closed' tournament is closed to roster changes too
--
-- reserve_seats has required `status = 'published'` since the beginning
-- (REGISTRATION_CLOSED). These three checked only registration_closes_at, so
-- flipping the status to 'closed' — the organiser's way of freezing
-- registration early, e.g. once the pairings are drawn — stopped new
-- registrations but still let owners swap occupants and move divisions until
-- the original deadline passed. withdraw_seat keeps having no deadline: that
-- is deliberate, a player must always be able to drop out.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.swap_seat(p_seat_id uuid, p_source_kind text, p_source_player_id uuid, p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
  if v_t.id is null or v_t.status <> 'published' or now() >= v_t.registration_closes_at then
    return jsonb_build_object('ok', false, 'error', 'SWAP_CLOSED');
  end if;

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

  perform pg_advisory_xact_lock(
    hashtext('person:' || v_batch.tournament_id::text || ':' || v_nfn || '|' || v_nln)::bigint);

  select * into v_new_cat from category
    where id = p_category_id and tournament_id = v_batch.tournament_id for update;
  if v_new_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;
  v_moving := p_category_id <> v_seat.category_id;

  if not v_moving
     and public.normalize_thai_name(v_seat.first_name_th) = v_nfn
     and public.normalize_thai_name(v_seat.last_name_th) = v_nln then
    return jsonb_build_object('ok', false, 'error', 'SAME_PERSON');
  end if;

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

  v_ban_status := public.award_limit_status(v_person.first_name_th, v_person.last_name_th);
  if (v_ban_status->>'banned')::boolean then
    return jsonb_build_object('ok', false, 'error', 'AWARD_LIMIT_REACHED',
      'personLabel', v_label, 'awardCount', (v_ban_status->>'count')::int,
      'requiresAdminOverride', true);
  end if;

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
  where id = p_seat_id;

  return jsonb_build_object('ok', true);
end; $fn$;

revoke all on function public.swap_seat(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.swap_seat(uuid, text, uuid, uuid) to authenticated, service_role;

create or replace function public.preview_division_change(p_seat_id uuid, p_category_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
  if v_t.id is null or v_t.status <> 'published' or now() >= v_t.registration_closes_at then
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
end; $fn$;

revoke all on function public.preview_division_change(uuid, uuid) from public, anon, authenticated;
grant execute on function public.preview_division_change(uuid, uuid) to authenticated, service_role;

create or replace function public.request_division_change(p_seat_id uuid, p_category_id uuid, p_slip_url text default null::text, p_bank_name text default null::text, p_bank_account_no text default null::text, p_bank_account_name text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
  if v_t.id is null or v_t.status <> 'published' or now() >= v_t.registration_closes_at then
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
    if p_slip_url is null or not public._is_slip_path(p_slip_url) then
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
end; $fn$;

revoke all on function public.request_division_change(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_division_change(uuid, uuid, text, text, text, text) to authenticated, service_role;

create or replace function public.admin_resolve_division_change(p_admin_secret text, p_id uuid, p_action text, p_admin_id text default 'admin'::text, p_refund_slip_url text default null::text, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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

  -- p_admin_id is accepted and ignored; see the header.
  if p_action = 'reject' then
    update seat_division_change set
      status = 'rejected',
      admin_note = nullif(btrim(coalesce(p_note, '')), ''),
      resolved_at = now(), resolved_by = _admin_actor()
    where id = p_id
    returning * into v_ch;
    return _division_change_json(v_ch);
  end if;

  -- ── approve ──
  -- downgrade needs the refund proof before anything else happens
  if v_ch.direction = 'downgrade'
     and (p_refund_slip_url is null
          or not public._is_slip_path(p_refund_slip_url)) then
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
    resolved_at = now(), resolved_by = _admin_actor()
  where id = p_id
  returning * into v_ch;

  return _division_change_json(v_ch);
end; $fn$;

revoke all on function public.admin_resolve_division_change(text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_division_change(text, uuid, text, text, text, text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Danger Zone: clear the FKs it is about to violate, and keep the admins
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_selective_reset(p_keep_uid uuid, p_confirm text, p_targets text[], p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_known constant text[] := array[
    'registrations','promo_codes','accounts','institutes',
    'player_db','live','categories','tournament'];
  v_counts jsonb := '{}'::jsonb;
  v_keep uuid[];
  n bigint;
begin
  if btrim(coalesce(p_confirm, '')) <> 'ล้างข้อมูล' then
    raise exception 'CONFIRM_MISMATCH';
  end if;
  if p_targets is null or array_length(p_targets, 1) is null then
    raise exception 'NO_TARGETS';
  end if;
  if exists (select 1 from unnest(p_targets) t where t <> all (v_known)) then
    raise exception 'INVALID_TARGETS';
  end if;
  if p_keep_uid is null
     or not exists (select 1 from account_roles
                    where account_id = p_keep_uid and role = 'admin') then
    raise exception 'KEEP_UID_NOT_ADMIN';
  end if;
  if p_tournament_id is not null
     and not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  if 'categories' = any(p_targets) and not ('registrations' = any(p_targets)) then
    raise exception 'MISSING_DEPS';
  end if;
  if 'tournament' = any(p_targets) and not (
       'registrations' = any(p_targets)
       and 'categories'  = any(p_targets)
       and 'promo_codes' = any(p_targets)) then
    raise exception 'MISSING_DEPS';
  end if;

  -- 1) registrations
  if 'registrations' = any(p_targets) then
    if p_tournament_id is null then
      update registration_batch set hold_id = null where hold_id is not null;
      delete from seat_withdrawal   where true;
      delete from promo_redemption  where true;
      delete from seat_hold_line    where true;
      delete from registration_seat where true;
      get diagnostics n = row_count;
      delete from seat_hold          where true;
      delete from registration_batch where true;
      update category set seats_taken = 0, updated_at = now() where seats_taken <> 0;
      if not ('promo_codes' = any(p_targets)) then
        update promo_code set used_count = 0, updated_at = now() where used_count <> 0;
      end if;
    else
      update registration_batch set hold_id = null
       where tournament_id = p_tournament_id and hold_id is not null;
      delete from seat_withdrawal  where tournament_id = p_tournament_id;
      delete from promo_redemption where batch_id in
        (select id from registration_batch where tournament_id = p_tournament_id);
      delete from seat_hold_line   where hold_id in
        (select id from seat_hold where tournament_id = p_tournament_id);
      delete from registration_seat where batch_id in
        (select id from registration_batch where tournament_id = p_tournament_id);
      get diagnostics n = row_count;
      delete from seat_hold          where tournament_id = p_tournament_id;
      delete from registration_batch where tournament_id = p_tournament_id;
      update category set seats_taken = 0, updated_at = now()
       where tournament_id = p_tournament_id and seats_taken <> 0;
      if not ('promo_codes' = any(p_targets)) then
        update promo_code set used_count = 0, updated_at = now()
         where tournament_id = p_tournament_id and used_count <> 0;
      end if;
    end if;
    v_counts := v_counts || jsonb_build_object('registrations', n);
  end if;

  -- 2) promo_codes
  if 'promo_codes' = any(p_targets) then
    if p_tournament_id is null then
      delete from promo_code where true;
    else
      delete from promo_code where tournament_id = p_tournament_id;
    end if;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('promo_codes', n);
  end if;

  -- 3) live — scoped to the tournament's own boards. Judge assignments and the
  --    tournament's token survive (the event may be re-uploaded from MacMahon).
  if 'live' = any(p_targets) then
    if p_tournament_id is null then
      delete from live_match where true;
      get diagnostics n = row_count;
      delete from live_standing where true;
      delete from live_config   where true;
      delete from live_division where true;
      if to_regclass('public.live_match_bak_20260703') is not null then
        execute 'delete from live_match_bak_20260703 where true';
      end if;
    else
      delete from live_match where division_id in
        (select id from live_division where tournament_id = p_tournament_id);
      get diagnostics n = row_count;
      delete from live_standing where division_id in
        (select id from live_division where tournament_id = p_tournament_id);
      delete from live_config   where tournament_id = p_tournament_id;
      delete from live_division where tournament_id = p_tournament_id;
    end if;
    v_counts := v_counts || jsonb_build_object('live', n);
  end if;

  -- 4) player_db (global)
  if 'player_db' = any(p_targets) then
    delete from award_limit_exemption where true;
    delete from go_player_database where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('player_db', n);
  end if;

  -- 5) institutes (global)
  if 'institutes' = any(p_targets) then
    update profile set institute_id = null, updated_at = now() where institute_id is not null;
    update managed_player set institute_id = null, updated_at = now() where institute_id is not null;
    update registration_seat set institute_id = null where institute_id is not null;
    delete from institute_merge where true;
    delete from go_institute where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('institutes', n);
  end if;

  -- 6) accounts (global)
  if 'accounts' = any(p_targets) then
    -- Every admin survives, not just the caller. account_roles cascades from
    -- auth.users and there is no admin-grant UI, so deleting the other admin
    -- locked them out of /admin with only the Supabase dashboard to get back
    -- in — and the confirm sheet never said a fellow admin was in the blast
    -- radius. p_keep_uid is guaranteed to be one of these by the check above.
    select coalesce(array_agg(distinct account_id), '{}'::uuid[]) into v_keep
      from account_roles where role = 'admin';

    -- Unconditionally, and this is the fix: the old guard skipped these
    -- null-outs whenever 'registrations' was also ticked, but a tournament-
    -- scoped registrations run only clears THAT tournament's rows, so every
    -- other tournament's registration_batch still referenced users about to
    -- be deleted and the delete below aborted the whole reset on
    -- registration_batch_account_id_fkey (no ON DELETE clause on prod).
    -- seat_division_change was missed by BOTH branches, so even a global
    -- accounts-only reset failed as soon as one such row existed.
    update registration_batch set account_id = null
     where account_id is not null and not (account_id = any(v_keep));
    update seat_withdrawal set account_id = null
     where account_id is not null and not (account_id = any(v_keep));
    update seat_division_change set account_id = null
     where account_id is not null and not (account_id = any(v_keep));
    update promo_redemption set account_id = null
     where account_id is not null and not (account_id = any(v_keep));

    delete from auth.users where not (id = any(v_keep));
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('accounts', n);
  end if;

  -- 7) categories
  if 'categories' = any(p_targets) then
    if p_tournament_id is null then
      delete from category where true;
    else
      delete from category where tournament_id = p_tournament_id;
    end if;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('categories', n);
  end if;

  -- 8) tournament
  if 'tournament' = any(p_targets) then
    if p_tournament_id is null then
      delete from tournament where true;
    else
      delete from tournament where id = p_tournament_id;
    end if;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('tournament', n);
  end if;

  return v_counts;
end;
$fn$;

revoke all on function public.admin_selective_reset(uuid, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_selective_reset(uuid, text, text[], uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Erasure of a single account (see item 10 in the header)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.admin_delete_account(p_admin_secret text, p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_batches  bigint := 0;
  v_withdraw bigint := 0;
  v_changes  bigint := 0;
  v_redeem   bigint := 0;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_uid is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if not exists (select 1 from auth.users where id = p_uid) then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;
  if p_uid = auth.uid() then raise exception 'CANNOT_DELETE_SELF'; end if;

  -- Same reasoning as the Danger Zone: account_roles cascades and there is no
  -- admin-grant UI, so an admin account has to lose the role first — which is
  -- also the moment somebody notices they are erasing an organiser.
  if exists (select 1 from account_roles where account_id = p_uid and role = 'admin') then
    raise exception 'ACCOUNT_IS_ADMIN';
  end if;

  -- The four FKs to auth.users that are ON DELETE NO ACTION. Nulling them
  -- rather than cascading is the whole design: the registrations, the refund
  -- records and the promo redemptions stay, as rows with no owner, so the
  -- organiser can still reconcile the money and prove who played.
  update registration_batch set account_id = null, updated_at = now() where account_id = p_uid;
  get diagnostics v_batches = row_count;
  update seat_withdrawal set account_id = null where account_id = p_uid;
  get diagnostics v_withdraw = row_count;
  update seat_division_change set account_id = null where account_id = p_uid;
  get diagnostics v_changes = row_count;
  update promo_redemption set account_id = null where account_id = p_uid;
  get diagnostics v_redeem = row_count;

  -- profile, managed_player, account_roles and tournament_judge cascade;
  -- award_limit_exemption.created_by is ON DELETE SET NULL.
  delete from auth.users where id = p_uid;

  return jsonb_build_object(
    'ok', true,
    'anonymisedBatches', v_batches,
    'anonymisedWithdrawals', v_withdraw,
    'anonymisedDivisionChanges', v_changes,
    'anonymisedRedemptions', v_redeem);
end; $fn$;

revoke all on function public.admin_delete_account(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_account(text, uuid) to authenticated, service_role;
