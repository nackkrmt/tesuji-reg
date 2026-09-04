-- ── admin_reopen_batch: undo a confirm or a reject ──────────────────────────
-- components/admin/RegistrationDetail.tsx gates both review actions behind
-- `canReview = status === 'pending_review'`, so the moment an admin clicks
-- ยืนยันการสมัคร or ปฏิเสธ the buttons vanish and there is no way back. The
-- confirm button has no confirmation dialog either, so a single mis-tap on a
-- money decision is fixable only by hand-writing SQL against production, in the
-- middle of registration season. Deleting and re-creating is not an option
-- because the admin cannot create a registration at all.
--
-- The two directions are NOT symmetric, which is the whole difficulty:
--
--   confirmed → the hold was left consumed, so the seats are still held by this
--     batch. Reopening is just a status change.
--
--   rejected  → reject_registration RELEASED the hold and decremented
--     category.seats_taken, returning those seats to the pool where someone
--     else may already have taken them. Reopening therefore has to re-acquire
--     the seats, and must refuse if capacity is gone rather than quietly
--     overselling a รุ่น on tournament day.
--
-- Seats are re-taken under a row lock in category-id order, matching how
-- reserve_seats orders its locks, so two concurrent reopens cannot deadlock.

create or replace function public.admin_reopen_batch(
  p_admin_secret text,
  p_batch_id uuid,
  p_note text default null,
  p_admin_id text default 'admin'
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_batch registration_batch;
  v_hold  seat_hold;
  v_short text;
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

    -- Refuse before touching anything if any รุ่น can no longer fit this batch.
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

    -- Re-take the seats this batch had given back.
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
  end if;

  update registration_batch
    set status = 'pending_review',
        admin_note = case
          when p_note is null or btrim(p_note) = '' then admin_note
          else p_note
        end,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        updated_at = now()
    where id = p_batch_id;

  return _batch_json(p_batch_id);
end;
$function$;

revoke all on function public.admin_reopen_batch(text, uuid, text, text)
  from public, anon;
grant execute on function public.admin_reopen_batch(text, uuid, text, text)
  to authenticated;
