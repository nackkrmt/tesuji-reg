-- ── A way back from a rejected registration, and a trustworthy clock ────────
-- Audit 2026-09-15, the two items the earlier migrations in this set handed off
-- because each needs a new function rather than an edit to an existing one.
--
--   • PRODUCT-4. A rejected registration is a dead end for the registrant.
--     reject_registration releases the hold and gives the seats back, and
--     submit_registration refuses any hold that is not 'active', so the batch
--     can never be paid again. The payment page has no resubmit path either.
--     Today the only recovery is admin_reopen_batch — the organiser doing it by
--     hand, for a rejection whose usual cause is a blurry or wrong-amount slip
--     that the registrant is the one able to fix. So: an owner-side resubmit,
--     modelled on admin_reopen_batch's rejected branch (20260904_0003), which
--     already solved the hard half — re-taking seats that were handed back,
--     refusing rather than overselling when the รุ่น has filled up since.
--
--   • FUNNEL-6. The 15-minute hold countdown is pure device-clock arithmetic:
--     expiresAt comes from the server, `Date.now()` does not. A phone running a
--     few minutes slow shows time remaining after the hold is already dead, so
--     the registrant scans the QR, transfers real money, and only then learns
--     the seats are gone. The client can mitigate (re-read the batch when the
--     timer hits zero, and check the batch is still payable before spending an
--     upload — both landed in the same audit) but it cannot fix the display
--     without knowing what time the server thinks it is. Both reads the payment
--     page makes now return `serverNow`, which is all the client needs to carry
--     a real offset.
--
-- Deploy: safe in either order relative to the frontend. serverNow is additive
-- (an older client ignores it), and nothing calls resubmit_registration until
-- the new payment page ships.

-- ============================================================================
-- 1. get_batch_public — same body, plus the server's clock
-- ============================================================================
-- Note on the `perform release_expired_holds(v_tid)` that PERF-7 stripped out
-- of the other read RPCs: it stays here deliberately. This is the payment
-- page's read, and it is the one place where a hold that expired since the
-- pg_cron sweep last ran must not be reported as live — the whole point of
-- returning serverNow is that this response can be trusted about time.
create or replace function public.get_batch_public(p_batch_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_acct uuid; v_tid uuid;
begin
  select account_id, tournament_id into v_acct, v_tid
    from registration_batch where id = p_batch_id;
  if v_tid is null then return null; end if;
  if auth.uid() is null or v_acct is distinct from auth.uid() then
    return null;
  end if;
  perform release_expired_holds(v_tid);
  return _batch_json(p_batch_id) || jsonb_build_object('serverNow', now());
end; $$;

revoke execute on function public.get_batch_public(uuid) from public, anon;
grant  execute on function public.get_batch_public(uuid) to authenticated;

-- ============================================================================
-- 2. resubmit_registration — the owner's way back from 'rejected'
-- ============================================================================
-- Differences from admin_reopen_batch, all of them because the caller is the
-- registrant rather than the organiser:
--   • ownership is checked against auth.uid();
--   • only 'rejected' is reopenable (a confirmed batch is the organiser's to
--     undo, and letting an owner reopen one would be a way to un-confirm a
--     paid registration);
--   • registration must still be open for the tournament — a rejection is not
--     a licence to re-enter an event that has closed. Same condition
--     reserve_seats uses, including the status check 20260915_0003 added to the
--     roster-change RPCs, so 'closed' really means closed;
--   • a fresh slip is required and must pass the shared path check, because the
--     rejected slip is the thing being replaced;
--   • the admin's rejection note is preserved on the row (the organiser wrote
--     it and may want it in the history) but the review stamps are cleared, so
--     the batch re-enters the worklist as unreviewed.
create or replace function public.resubmit_registration(
  p_batch_id uuid,
  p_slip_url text
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_batch registration_batch;
  v_hold  seat_hold;
  v_t     tournament;
  v_short text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED'); end if;

  select * into v_batch from registration_batch where id = p_batch_id for update;
  if v_batch.id is null then return jsonb_build_object('ok', false, 'error', 'BATCH_NOT_FOUND'); end if;
  if v_batch.account_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if v_batch.status <> 'rejected' then
    return jsonb_build_object('ok', false, 'error', 'NOT_RESUBMITTABLE');
  end if;

  select * into v_t from tournament where id = v_batch.tournament_id;
  if v_t.id is null then return jsonb_build_object('ok', false, 'error', 'TOURNAMENT_NOT_FOUND'); end if;
  if v_t.status <> 'published'
     or (v_t.registration_closes_at is not null and now() > v_t.registration_closes_at) then
    return jsonb_build_object('ok', false, 'error', 'REGISTRATION_CLOSED');
  end if;

  -- A payable batch needs proof. Same shared shape check as every other slip
  -- writer (20260915_0001 _is_slip_path), so the per-uploader `<uid>/` prefix
  -- and the legacy flat names are both accepted.
  if v_batch.total_amount_thb > 0
     and (p_slip_url is null or not public._is_slip_path(p_slip_url)) then
    return jsonb_build_object('ok', false, 'error', 'SLIP_REQUIRED');
  end if;

  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  if v_hold.id is null then return jsonb_build_object('ok', false, 'error', 'HOLD_NOT_FOUND'); end if;

  -- Refuse before touching anything if any รุ่น has filled up since the
  -- rejection gave these seats back. Oversold capacity is worse than a
  -- registrant having to pick a different division.
  select c.name into v_short
  from seat_hold_line l
  join category c on c.id = l.category_id
  where l.hold_id = v_hold.id
    and c.seats_taken + l.seats > c.capacity
  order by c.name
  limit 1;
  if v_short is not null then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS', 'category', v_short);
  end if;

  -- Lock the categories in a stable order before incrementing, so two
  -- resubmits (or a resubmit racing reserve_seats) cannot interleave past the
  -- capacity check above.
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

  update registration_batch
    set status = 'pending_review',
        payment_slip_url = coalesce(nullif(p_slip_url, ''), payment_slip_url),
        -- Re-enters the worklist unreviewed; the rejection note is kept as
        -- history, and slip_verify_* is cleared because it described the slip
        -- that was just replaced.
        reviewed_by = null,
        reviewed_at = null,
        slip_verify_status = null,
        slip_verified_at = null,
        updated_at = now()
    where id = p_batch_id;

  return jsonb_build_object('ok', true) || _batch_json(p_batch_id);
end; $$;

revoke execute on function public.resubmit_registration(uuid, text) from public, anon;
grant  execute on function public.resubmit_registration(uuid, text) to authenticated;
