-- ── Roster ↔ registrations across accounts (read-only) ──────────────────────
-- A coach keeps students as managed_player rows; a parent registers the same
-- child from their own account. Both roster surfaces derive "สมัครแล้ว" from
-- my_registrations(), which is `where b.account_id = auth.uid()` — so a
-- registration made by another account is invisible to the coach by
-- construction, and the roster page shows the child as never entered.
--
-- This RPC answers "who on MY roster is entered?" without regard to which
-- account created the batch. Identity = the normalized Thai name pair,
-- evaluated at read time from the roster row's CURRENT name against the seat's
-- name snapshot — exactly the predicate reserve_seats / swap_seat /
-- _division_move_eligibility already use for DUPLICATE_REGISTRATION
-- (20260711_0001:186-208). person_id is deliberately not used: registration_seat
-- has none, and a stored person_id can be stale on INSERT (RankPicker does not
-- clear it when the name is edited before the first save).
--
-- Disclosure: for seats owned by OTHER accounts this returns only what
-- list_participants (20260708_0002:736-756) already publishes to anon — the
-- division and the batch status of confirmed / pending_review, non-withdrawn
-- seats — plus opaque ids. Deliberately absent: any date-of-birth field or
-- comparison (a "dob matches" bit would be a per-guess DOB oracle over minors),
-- batch financials, and the owning account's name / email / phone.
--
-- This grants no new ability to ACT. Every write RPC (withdraw_seat, swap_seat,
-- preview/request_division_change) keeps its own
-- `v_batch.account_id is distinct from v_uid -> FORBIDDEN` gate, so a coach who
-- did not create a registration can see it but not change it. The owner path is
-- untouched: a coach who registered the student manages it on /my-registrations
-- exactly as before.

create or replace function public.my_roster_registrations(
  p_tournament_ids uuid[] default null   -- null → every non-draft tournament
) returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with me as (
    select auth.uid() as uid
  ),
  -- the caller's own people: their profile + every non-archived managed player
  roster as (
    select 'self'::text as roster_kind, p.id as roster_id,
           public.normalize_thai_name(p.first_name_th) as nfn,
           public.normalize_thai_name(p.last_name_th)  as nln
      from profile p, me
     where me.uid is not null
       and p.id = me.uid
    union all
    select 'managed_player', mp.id,
           public.normalize_thai_name(mp.first_name_th),
           public.normalize_thai_name(mp.last_name_th)
      from managed_player mp, me
     where me.uid is not null
       and mp.owner_id = me.uid
       and mp.archived_at is null
  ),
  -- Drafts are never in scope, even when their id is passed explicitly. Other
  -- statuses stay visible on purpose: `closed` covers an event whose
  -- registration has ended but which has not been played yet, and the roster
  -- page counts exactly those as current (tournamentPhase -> 'upcoming').
  -- Not a wider disclosure than list_participants, which filters no status.
  scope as (
    select t.id
      from tournament t
     where t.status <> 'draft'
       and (p_tournament_ids is null or t.id = any(p_tournament_ids))
  ),
  live as (
    select s.id as seat_id, s.batch_id, b.tournament_id, s.category_id,
           s.fee_thb_snapshot, s.created_at, b.status, b.reference_code,
           (me.uid is not null and b.account_id = me.uid) as by_me,
           public.normalize_thai_name(s.first_name_th) as nfn,
           public.normalize_thai_name(s.last_name_th)  as nln
      from registration_seat s
      join registration_batch b on b.id = s.batch_id
      cross join me
     where b.tournament_id in (select id from scope)
       and s.withdrawn_at is null
       and b.status in ('pending_payment', 'pending_review', 'confirmed')
       -- An unpaid hold counts only while it is still alive: this function is
       -- STABLE and cannot sweep expired holds (my_registrations does that),
       -- so check the hold rather than trust the batch status alone.
       and (b.status <> 'pending_payment' or exists (
             select 1 from seat_hold h
              where h.id = b.hold_id
                and h.status = 'active'
                and h.expires_at > now()))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'rosterKind',     r.roster_kind,
           'rosterId',       r.roster_id,
           'tournamentId',   l.tournament_id,
           'categoryId',     l.category_id,
           'categoryCode',   c.code,
           'categoryName',   c.name,
           'feeThb',         l.fee_thb_snapshot,
           'batchStatus',    l.status,
           'byMe',           l.by_me,
           'seatId',         l.seat_id,
           'batchId',        case when l.by_me then l.batch_id       else null end,
           'batchReference', case when l.by_me then l.reference_code else null end,
           'createdAt',      l.created_at)
         order by l.tournament_id, c.sort_order, c.code, r.roster_kind, l.created_at),
         '[]'::jsonb)
    from roster r
    join live l on l.nfn = r.nfn and l.nln = r.nln
    join category c on c.id = l.category_id
   -- own seats follow ACTIVE_REGISTRATION_STATUSES (incl. a live pending hold);
   -- other accounts' seats follow the public list_participants rule
   where l.by_me or l.status in ('confirmed', 'pending_review');
$function$;

revoke execute on function public.my_roster_registrations(uuid[]) from public, anon;
grant  execute on function public.my_roster_registrations(uuid[]) to authenticated;

notify pgrst, 'reload schema';
