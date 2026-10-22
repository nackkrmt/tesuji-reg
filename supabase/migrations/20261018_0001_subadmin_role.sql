-- ── SubAdmin: a per-tournament back-office role ──────────────────────────────
-- Back-office access has been all-or-nothing: one `admin` row in account_roles
-- opens every page, from confirming slips to wiping the rank database. The
-- organiser wants helpers who run ONE event — review its applications, settle
-- its refunds, edit its divisions and rules, hand out its judge console — but
-- who cannot touch other events, the global rank/institute data or the reset
-- page. Judges already work that way (tournament_judge, 20260908_0001), so the
-- new role copies that shape instead of inventing a permission system.
--
--   1. tournament_subadmin(tournament_id, account_id): an account is a SubAdmin
--      of exactly the tournaments it has rows for. No account_roles change: a
--      SubAdmin with no rows left is nobody again. The table has no client
--      policy; the browser learns its own access through my_admin_access().
--   2. _is_staff(p_secret, p_tournament_id) is the RPC-side twin of _is_admin:
--      admin, or a SubAdmin of THAT tournament (null tournament = admin only).
--      is_staff_me() / is_tournament_staff_me(uuid) are the policy-side twins
--      of is_admin_me(), granted to anon like it, because a policy runs as the
--      querying role. my_admin_access() feeds the admin shell: role + ids.
--   3. admin_set_subadmin / admin_list_subadmins — admin-only roster RPCs,
--      modelled on admin_set_judge / admin_list_judges.
--   4. _can_write_tournament / _can_write_division accept a SubAdmin of the
--      tournament, so every live write (announcement, delete round, the judge
--      console itself) follows without touching the callers. The token path
--      is unchanged: the API routes call with auth.uid() = null.
--   5. Draft visibility (tournament_public_read, live_*_visible,
--      list_participants) opens to the tournament's SubAdmins — the admin
--      picker and the live pages read drafts through these.
--   6. Storage: banner/venue-map writes and refund-slip reads use is_staff_me().
--      Object paths carry an uploader uid, not a tournament id, so this is the
--      finest cut the bucket allows: any SubAdmin can open any refund slip.
--      Slip DELETE stays admin-only.
--   7. judge_get_token / judge_my_assignments include SubAdmin assignments, so
--      the "ระบบกรรมการ" button appears for them without a judge row. One row
--      per tournament: the client does rows.find(tournamentId).
--   8. The RPCs behind the pages a SubAdmin may use are re-created with the
--      guard swapped to _is_staff(secret, <the tournament this call touches>).
--      Three shapes: a direct tournament id; a child id resolved first
--      (batch → registration_batch.tournament_id, and the own tournament_id
--      column of category / seat_withdrawal / seat_division_change /
--      promo_code — a missing row leaves null, so a non-admin is refused
--      before the existing NOT_FOUND path runs); and a payload, where the
--      EXISTING row decides the tournament before the payload is believed.
--      Creating a tournament stays admin-only (nothing to be assigned to yet),
--      and admin_list_promos with no tournament (every event's codes) too.
--      Everything not listed here keeps _is_admin: forgetting an RPC leaves a
--      SubAdmin with UNAUTHORIZED, never with access.
--
-- Bodies below are the live prod definitions (pg_get_functiondef, 2026-10-18)
-- with only the guard lines changed; parameter names and defaults are byte-
-- identical so the deployed build and lib/rpc-coverage.test.ts keep resolving.
-- Each function keeps the grant set it had (anon+authenticated+service_role for
-- the dashboard-era RPCs, authenticated(+service_role) for the newer ones).
--
-- Deploy: SQL first, then verify-slip (it reads the new table), then the
-- frontend. Applying this under the current build is safe: every signature is
-- unchanged, admins pass every new guard, and no SubAdmin rows exist until the
-- roster page ships.

-- ============================================================================
-- 1. tournament_subadmin
-- ============================================================================
create table if not exists public.tournament_subadmin (
  tournament_id uuid not null references public.tournament(id) on delete cascade,
  account_id    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (tournament_id, account_id)
);
create index if not exists tournament_subadmin_account_idx
  on public.tournament_subadmin (account_id);
alter table public.tournament_subadmin enable row level security;
-- No client policy on purpose (compare tournament_live_token): nothing in the
-- browser reads this table — my_admin_access() answers for the signed-in user
-- and verify-slip reads it with the service role.
revoke all on table public.tournament_subadmin from public, anon, authenticated;

-- ============================================================================
-- 2. Helpers — _is_staff, is_staff_me, is_tournament_staff_me, my_admin_access
-- ============================================================================
-- RPC-side gate. p_secret is the vestigial p_admin_secret every RPC carries;
-- _is_admin ignores it and so does this. A null tournament means "admin only".
create or replace function public._is_staff(p_secret text, p_tournament_id uuid)
returns boolean
language sql security definer set search_path to 'public'
as $$
  select public._is_admin(p_secret)
      or (p_tournament_id is not null and exists (
            select 1 from tournament_subadmin s
             where s.tournament_id = p_tournament_id
               and s.account_id = auth.uid()));
$$;
revoke all on function public._is_staff(text, uuid) from public, anon, authenticated;

-- Policy-side twins of is_admin_me(): STABLE, SECURITY DEFINER, granted to anon
-- because a policy expression is evaluated as the querying role. They reveal
-- nothing about other accounts.
create or replace function public.is_tournament_staff_me(p_tournament_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select is_admin_me()
      or exists (select 1 from tournament_subadmin s
                  where s.tournament_id = p_tournament_id
                    and s.account_id = auth.uid());
$$;
revoke all on function public.is_tournament_staff_me(uuid) from public;
grant execute on function public.is_tournament_staff_me(uuid) to anon, authenticated;

create or replace function public.is_staff_me()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select is_admin_me()
      or exists (select 1 from tournament_subadmin where account_id = auth.uid());
$$;
revoke all on function public.is_staff_me() from public;
grant execute on function public.is_staff_me() to anon, authenticated;

-- The admin shell's gate. Granted to anon as well: a signed-out visitor on
-- /admin must get a definite {role: null} (→ login page), not a permission
-- error the gate would read as "could not check" and answer with a retry.
create or replace function public.my_admin_access()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select case
    when is_admin_me() then
      jsonb_build_object('role', 'admin', 'tournamentIds', '[]'::jsonb)
    when auth.uid() is not null
         and exists (select 1 from tournament_subadmin where account_id = auth.uid()) then
      jsonb_build_object('role', 'subadmin', 'tournamentIds',
        (select jsonb_agg(tournament_id order by tournament_id)
           from tournament_subadmin where account_id = auth.uid()))
    else
      jsonb_build_object('role', null, 'tournamentIds', '[]'::jsonb)
  end;
$$;
revoke all on function public.my_admin_access() from public;
grant execute on function public.my_admin_access() to anon, authenticated;

-- ============================================================================
-- 3. Roster RPCs — admin_set_subadmin, admin_list_subadmins (admin only)
-- ============================================================================
create or replace function public.admin_set_subadmin(
  p_admin_secret text,
  p_tournament_id uuid,
  p_email text,
  p_is_subadmin boolean
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_tournament_id is null
     or not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if p_is_subadmin then
    -- An admin already reaches everything; a row here would only suggest it
    -- does something.
    if exists (select 1 from account_roles where account_id = v_uid and role = 'admin') then
      raise exception 'ACCOUNT_IS_ADMIN';
    end if;
    insert into tournament_subadmin (tournament_id, account_id)
    values (p_tournament_id, v_uid)
    on conflict (tournament_id, account_id) do nothing;
  else
    delete from tournament_subadmin
     where tournament_id = p_tournament_id and account_id = v_uid;
  end if;
end; $$;
revoke all on function public.admin_set_subadmin(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_subadmin(text, uuid, text, boolean) to authenticated, service_role;

create or replace function public.admin_list_subadmins(p_admin_secret text, p_tournament_id uuid)
returns table(account_id uuid, email text, first_name_th text)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return query
    select s.account_id, u.email::text, p.first_name_th
      from tournament_subadmin s
      join auth.users u on u.id = s.account_id
      left join profile p on p.id = s.account_id
     where s.tournament_id = p_tournament_id
     order by u.email;
end; $$;
revoke all on function public.admin_list_subadmins(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_subadmins(text, uuid) to authenticated, service_role;

-- ============================================================================
-- 4. Live write gates — _can_write_tournament, _can_write_division
-- ============================================================================
-- Admin, SubAdmin of the tournament, or the tournament's own live token. The
-- token branch is untouched; the judge console and the .jar reach these with
-- auth.uid() = null, so the staff branch is false for them.
create or replace function public._can_write_tournament(p_secret text, p_tournament_id uuid)
returns boolean
language sql security definer set search_path to 'public'
as $$
  select public._is_staff(p_secret, p_tournament_id)
      or (p_tournament_id is not null
          and public._live_token_tournament(p_secret) = p_tournament_id);
$$;
revoke all on function public._can_write_tournament(text, uuid) from public, anon, authenticated;

create or replace function public._can_write_division(p_secret text, p_division_id text)
returns boolean
language sql security definer set search_path to 'public'
as $$
  select public._is_admin(p_secret)
      or exists (select 1 from live_division d
                  where d.id = p_division_id
                    and (d.tournament_id = public._live_token_tournament(p_secret)
                         or public._is_staff(p_secret, d.tournament_id)));
$$;
revoke all on function public._can_write_division(text, text) from public, anon, authenticated;

-- ============================================================================
-- 5. Draft visibility — tournament_public_read, live_*_visible, list_participants
-- ============================================================================
drop policy if exists tournament_public_read on public.tournament;
create policy tournament_public_read on public.tournament
  for select to anon, authenticated
  using (status <> 'draft' or public.is_tournament_staff_me(id));
-- category_public_read is an EXISTS on tournament under the caller's RLS, so it
-- follows this policy without a change of its own.

create or replace function public.live_tournament_visible(p_tournament_id uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from tournament t
     where t.id = p_tournament_id
       and (t.status <> 'draft' or is_tournament_staff_me(t.id)));
$$;
revoke all on function public.live_tournament_visible(uuid) from public;
grant execute on function public.live_tournament_visible(uuid) to anon, authenticated;

create or replace function public.live_division_visible(p_division_id text)
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from live_division d
      join tournament t on t.id = d.tournament_id
     where d.id = p_division_id
       and (t.status <> 'draft' or is_tournament_staff_me(t.id)));
$$;
revoke all on function public.live_division_visible(text) from public;
grant execute on function public.live_division_visible(text) to anon, authenticated;

create or replace function public.list_participants(p_tournament_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
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
    and b.status in ('confirmed', 'pending_review')
    and s.withdrawn_at is null
    and exists (select 1 from tournament t
                 where t.id = p_tournament_id
                   and (t.status <> 'draft' or is_tournament_staff_me(t.id)));
$$;
revoke all on function public.list_participants(uuid) from public;
grant execute on function public.list_participants(uuid) to anon, authenticated;

-- ============================================================================
-- 6. Storage — banner/venue-map writes and refund-slip reads for staff
-- ============================================================================
drop policy if exists tesuji_admin_insert on storage.objects;
create policy tesuji_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tesuji' and public.is_staff_me());

drop policy if exists tesuji_admin_delete on storage.objects;
create policy tesuji_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tesuji' and public.is_staff_me());

drop policy if exists tesuji_slips_admin_select on storage.objects;
create policy tesuji_slips_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tesuji-slips' and public.is_staff_me());
-- tesuji_slips_admin_delete (purging a tournament's slips) stays is_admin_me().

-- ============================================================================
-- 7. Judge console — judge_get_token, judge_my_assignments
-- ============================================================================
create or replace function public.judge_get_token(p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if not (_is_staff('', p_tournament_id) or exists (
        select 1 from tournament_judge
         where tournament_id = p_tournament_id and account_id = auth.uid())) then
    raise exception 'UNAUTHORIZED';
  end if;
  return _ensure_live_token(p_tournament_id);
end; $$;
revoke all on function public.judge_get_token(uuid) from public, anon, authenticated;
grant execute on function public.judge_get_token(uuid) to authenticated, service_role;

-- One row per tournament even for an account that is both judge and SubAdmin
-- of it: TournamentDetailClient does rows.find(r => r.tournamentId === id).
-- `via` says which hat produced the row; a SubAdmin-only row has no default
-- division, so the console asks for one (as for a judge without a default).
create or replace function public.judge_my_assignments()
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tournamentId', t.id,
             'tournamentName', t.name_th,
             'competitionDate', t.competition_date,
             'status', t.status,
             'token', _ensure_live_token(t.id),
             'defaultDivisionId', j.default_division_id,
             'via', case when j.account_id is not null then 'judge' else 'subadmin' end)
           order by t.competition_date desc, t.updated_at desc)
      from tournament t
      left join tournament_judge j
        on j.tournament_id = t.id and j.account_id = auth.uid()
      left join tournament_subadmin s
        on s.tournament_id = t.id and s.account_id = auth.uid()
     where j.account_id is not null or s.account_id is not null), '[]'::jsonb);
end; $$;
revoke all on function public.judge_my_assignments() from public, anon, authenticated;
grant execute on function public.judge_my_assignments() to authenticated, service_role;

-- ============================================================================
-- 8a. Allow-listed RPCs with a direct tournament id
-- ============================================================================
create or replace function public.set_tournament_status(p_admin_secret text, p_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_row tournament;
begin
  if not _is_staff(p_admin_secret, p_id) then raise exception 'UNAUTHORIZED'; end if;
  update tournament set status = p_status::tournament_status, updated_at = now()
    where id = p_id returning * into v_row;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.set_tournament_status(text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_tournament_status(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.update_tournament_rules(p_admin_secret text, p_id uuid, p_rules_text text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_row tournament;
begin
  if not _is_staff(p_admin_secret, p_id) then raise exception 'UNAUTHORIZED'; end if;
  update tournament
     set rules_text = coalesce(p_rules_text, ''),
         updated_at = now()
   where id = p_id
   returning * into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  return to_jsonb(v_row);
end;
$$;
revoke all on function public.update_tournament_rules(text, uuid, text) from public, anon, authenticated;
grant execute on function public.update_tournament_rules(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.admin_category_stats(p_admin_secret text, p_tournament_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_staff(p_admin_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
  -- `remaining` can lag a just-expired hold by up to the cron's minute; the
  -- seat itself is already unavailable to nobody, since reserve_seats releases
  -- the tournament's expired holds before it counts.
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'categoryId', c.id, 'capacity', c.capacity,
      'remaining', greatest(0, c.capacity - c.seats_taken),
      'confirmed', coalesce(cf.cnt, 0),
      'held', greatest(0, c.seats_taken - coalesce(cf.cnt, 0))))
    from category c
    left join (
      select s.category_id, count(*)::int cnt from registration_seat s
      join registration_batch b on b.id = s.batch_id
      where b.status = 'confirmed' and s.withdrawn_at is null group by s.category_id
    ) cf on cf.category_id = c.id
    where c.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end; $$;
revoke all on function public.admin_category_stats(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_category_stats(text, uuid) to anon, authenticated, service_role;

create or replace function public.admin_list_registrations(p_admin_secret text, p_tournament_id uuid, p_status text default 'all')
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_staff(p_admin_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(_batch_json(b.id) order by b.created_at desc)
    from registration_batch b
    where b.tournament_id = p_tournament_id and b.status <> 'cancelled'
      and (p_status = 'all' or b.status = p_status::registration_status)
  ), '[]'::jsonb);
end; $$;
revoke all on function public.admin_list_registrations(text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_registrations(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.admin_list_withdrawals(p_admin_secret text, p_tournament_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_staff(p_admin_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
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
end; $$;
revoke all on function public.admin_list_withdrawals(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_withdrawals(text, uuid) to anon, authenticated, service_role;

create or replace function public.admin_list_division_changes(p_admin_secret text, p_tournament_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_staff(p_admin_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'seatId', c.seat_id, 'batchId', c.batch_id,
      'tournamentId', c.tournament_id, 'personName', c.person_name,
      'batchReference', c.batch_reference,
      'fromCategoryId', c.from_category_id, 'fromCategoryLabel', c.from_category_label,
      'fromFeeThb', c.from_fee_thb,
      'toCategoryId', c.to_category_id, 'toCategoryLabel', c.to_category_label,
      'toFeeThb', c.to_fee_thb,
      'direction', c.direction, 'amountThb', c.amount_thb,
      'paymentSlipUrl', c.payment_slip_url,
      'bankName', c.bank_name, 'bankAccountNo', c.bank_account_no,
      'bankAccountName', c.bank_account_name,
      'status', c.status, 'adminNote', c.admin_note,
      'refundSlipUrl', c.refund_slip_url,
      'createdAt', c.created_at,
      'resolvedAt', c.resolved_at, 'resolvedBy', c.resolved_by)
      order by c.created_at desc)
    from seat_division_change c
    where c.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end; $$;
revoke all on function public.admin_list_division_changes(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_division_changes(text, uuid) to anon, authenticated, service_role;

-- NULL lists every tournament's codes — that stays admin-only.
create or replace function public.admin_list_promos(p_admin_secret text, p_tournament_id uuid default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
begin
  if p_tournament_id is null then
    if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  elsif not _is_staff(p_admin_secret, p_tournament_id) then
    raise exception 'UNAUTHORIZED';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(pc) order by pc.created_at desc)
    from promo_code pc
    where p_tournament_id is null or pc.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_promos(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_promos(text, uuid) to anon, authenticated, service_role;

create or replace function public.live_get_token(p_admin_secret text, p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_staff(p_admin_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
  if p_tournament_id is null
     or not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  return _ensure_live_token(p_tournament_id);
end; $$;
revoke all on function public.live_get_token(text, uuid) from public, anon, authenticated;
grant execute on function public.live_get_token(text, uuid) to authenticated, service_role;

create or replace function public.live_rotate_token(p_admin_secret text, p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_staff(p_admin_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
  if p_tournament_id is null
     or not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  insert into tournament_live_token (tournament_id, token, rotated_at)
  values (p_tournament_id, encode(extensions.gen_random_bytes(16), 'hex'), now())
  on conflict (tournament_id) do update
    set token = excluded.token, rotated_at = now();
  return (select token from tournament_live_token where tournament_id = p_tournament_id);
end; $$;
revoke all on function public.live_rotate_token(text, uuid) from public, anon, authenticated;
grant execute on function public.live_rotate_token(text, uuid) to authenticated, service_role;

create or replace function public.admin_list_judges(p_admin_secret text, p_tournament_id uuid)
returns table(account_id uuid, email text, first_name_th text, default_division_id text)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_staff(p_admin_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
  return query
    select j.account_id, u.email::text, p.first_name_th, j.default_division_id
      from tournament_judge j
      join auth.users u on u.id = j.account_id
      left join profile p on p.id = j.account_id
     where j.tournament_id = p_tournament_id
     order by u.email;
end; $$;
revoke all on function public.admin_list_judges(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_list_judges(text, uuid) to authenticated, service_role;

create or replace function public.admin_set_judge(
  p_admin_secret text,
  p_tournament_id uuid,
  p_email text,
  p_is_judge boolean,
  p_default_division_id text default null
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid;
begin
  if not _is_staff(p_admin_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
  if p_tournament_id is null
     or not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if p_default_division_id is not null and not exists (
       select 1 from live_division
        where id = p_default_division_id and tournament_id = p_tournament_id) then
    raise exception 'DIVISION_NOT_IN_TOURNAMENT';
  end if;
  if p_is_judge then
    insert into tournament_judge (tournament_id, account_id, default_division_id)
    values (p_tournament_id, v_uid, p_default_division_id)
    on conflict (tournament_id, account_id) do update
      set default_division_id = excluded.default_division_id;
  else
    delete from tournament_judge
     where tournament_id = p_tournament_id and account_id = v_uid;
  end if;
end; $$;
revoke all on function public.admin_set_judge(text, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_judge(text, uuid, text, boolean, text) to authenticated, service_role;

-- ============================================================================
-- 8b. Allow-listed RPCs that resolve the tournament from a child id first
-- ============================================================================
create or replace function public.admin_get_batch(p_admin_secret text, p_batch_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_tid uuid;
begin
  select tournament_id into v_tid from registration_batch where id = p_batch_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;
  return _batch_json(p_batch_id);
end; $$;
revoke all on function public.admin_get_batch(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_get_batch(text, uuid) to anon, authenticated, service_role;

create or replace function public.confirm_registration(p_batch_id uuid, p_admin_secret text, p_admin_id text default 'admin')
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_batch registration_batch; v_tid uuid;
begin
  select tournament_id into v_tid from registration_batch where id = p_batch_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;
  -- p_admin_id is accepted and ignored; see the header.
  update registration_batch set status = 'confirmed', reviewed_by = _admin_actor(), reviewed_at = now(), updated_at = now()
    where id = p_batch_id and status = 'pending_review' returning * into v_batch;
  if v_batch.id is null then raise exception 'NOT_PENDING_REVIEW'; end if;
  return _batch_json(p_batch_id);
end; $$;
revoke all on function public.confirm_registration(uuid, text, text) from public, anon, authenticated;
grant execute on function public.confirm_registration(uuid, text, text) to anon, authenticated, service_role;

create or replace function public.reject_registration(p_batch_id uuid, p_admin_secret text, p_note text, p_admin_id text default 'admin')
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_hold seat_hold; v_batch registration_batch; v_tid uuid;
begin
  select tournament_id into v_tid from registration_batch where id = p_batch_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;

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
end; $$;
revoke all on function public.reject_registration(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reject_registration(uuid, text, text, text) to anon, authenticated, service_role;

create or replace function public.admin_reopen_batch(p_admin_secret text, p_batch_id uuid, p_note text default null, p_admin_id text default 'admin')
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_batch registration_batch;
  v_hold  seat_hold;
  v_short text;
  v_promo promo_code;
  v_rows  int;
  v_tid   uuid;
begin
  select tournament_id into v_tid from registration_batch where id = p_batch_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;

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
$$;
revoke all on function public.admin_reopen_batch(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_reopen_batch(text, uuid, text, text) to authenticated, service_role;

create or replace function public.admin_delete_batch(p_admin_secret text, p_batch_id uuid, p_admin_id text default 'admin')
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_batch registration_batch; v_hold seat_hold; v_tid uuid;
begin
  select tournament_id into v_tid from registration_batch where id = p_batch_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;

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
end; $$;
revoke all on function public.admin_delete_batch(text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_batch(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.admin_update_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_payload jsonb, p_admin_id text default 'admin')
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_batch registration_batch; v_seat registration_seat; v_new_cat category;
  v_hold seat_hold; v_occupies boolean; v_moving boolean;
  v_old_cat uuid; v_pl int; v_dob date; v_age int; v_fee numeric;
  v_tid uuid;
begin
  select tournament_id into v_tid from registration_batch where id = p_batch_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;

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
end; $$;
revoke all on function public.admin_update_seat(text, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_update_seat(text, uuid, uuid, jsonb, text) to anon, authenticated, service_role;

create or replace function public.admin_delete_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_admin_id text default 'admin')
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_batch registration_batch; v_seat registration_seat;
  v_hold seat_hold; v_occupies boolean; v_remaining int;
  v_tid uuid;
begin
  select tournament_id into v_tid from registration_batch where id = p_batch_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;

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
end; $$;
revoke all on function public.admin_delete_seat(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_seat(text, uuid, uuid, text) to anon, authenticated, service_role;

create or replace function public.delete_category(p_admin_secret text, p_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_tid uuid;
begin
  select tournament_id into v_tid from category where id = p_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;
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
end; $$;
revoke all on function public.delete_category(text, uuid) from public, anon, authenticated;
grant execute on function public.delete_category(text, uuid) to anon, authenticated, service_role;

create or replace function public.admin_set_withdrawal_status(p_admin_secret text, p_withdrawal_id uuid, p_status text, p_admin_id text default 'admin', p_refund_slip_url text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_w seat_withdrawal; v_tid uuid;
begin
  select tournament_id into v_tid from seat_withdrawal where id = p_withdrawal_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;
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
end; $$;
revoke all on function public.admin_set_withdrawal_status(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_withdrawal_status(text, uuid, text, text, text) to anon, authenticated, service_role;

create or replace function public.admin_resolve_division_change(p_admin_secret text, p_id uuid, p_action text, p_admin_id text default 'admin', p_refund_slip_url text default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_ch seat_division_change;
  v_seat registration_seat; v_batch registration_batch;
  v_new_cat category; v_hold seat_hold; v_occupies boolean;
  v_err jsonb; v_moving boolean; v_pl int; v_dob date;
  v_tid uuid;
begin
  select tournament_id into v_tid from seat_division_change where id = p_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;
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
    -- AND their current rank: a request can sit here across a rank import
    -- (DATA-12, carried over from 20260915_0002).
    select * into v_pl, v_dob from public._seat_occupant_rank(v_seat, v_batch.account_id);

    v_err := public._division_move_eligibility(
      v_ch.tournament_id, v_seat.id,
      v_seat.first_name_th, v_seat.last_name_th,
      v_pl, v_dob, v_new_cat);
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
end; $$;
revoke all on function public.admin_resolve_division_change(text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_resolve_division_change(text, uuid, text, text, text, text) to anon, authenticated, service_role;

create or replace function public.admin_delete_promo(p_admin_secret text, p_promo_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_tid uuid;
begin
  select tournament_id into v_tid from promo_code where id = p_promo_id;
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;
  delete from promo_code where id = p_promo_id;
end;
$$;
revoke all on function public.admin_delete_promo(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_promo(text, uuid) to anon, authenticated, service_role;

-- ============================================================================
-- 8c. Allow-listed RPCs with a payload — the existing row decides first
-- ============================================================================
create or replace function public.upsert_tournament(p_admin_secret text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_row tournament;
begin
  v_id := nullif(p_payload->>'id', '')::uuid;
  -- Creating a tournament stays admin-only: a SubAdmin is assigned to events
  -- that exist, so a new row has nothing to be checked against.
  if v_id is null then
    if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  elsif not _is_staff(p_admin_secret, v_id) then
    raise exception 'UNAUTHORIZED';
  end if;
  if v_id is null then
    insert into tournament(name_th, banner_url, venue_map_url, competition_date, location_text, location_maps_url,
      registration_opens_at, registration_closes_at, schedule_text, rules_text,
      promptpay_target_type, promptpay_target_value, status)
    values (p_payload->>'nameTh', nullif(p_payload->>'bannerUrl', ''), nullif(p_payload->>'venueMapUrl', ''),
      coalesce(p_payload->>'competitionDate', ''),
      coalesce(p_payload->>'locationText', ''), coalesce(p_payload->>'locationMapsUrl', ''),
      (p_payload->>'registrationOpensAt')::timestamptz, (p_payload->>'registrationClosesAt')::timestamptz,
      coalesce(p_payload->>'scheduleText', ''), coalesce(p_payload->>'rulesText', ''),
      (coalesce(p_payload->>'promptpayTargetType', 'phone'))::promptpay_target_type,
      coalesce(p_payload->>'promptpayTargetValue', ''),
      (coalesce(p_payload->>'status', 'draft'))::tournament_status)
    returning * into v_row;
  else
    update tournament set name_th = p_payload->>'nameTh', banner_url = nullif(p_payload->>'bannerUrl', ''),
      venue_map_url = nullif(p_payload->>'venueMapUrl', ''),
      competition_date = coalesce(p_payload->>'competitionDate', ''),
      location_text = coalesce(p_payload->>'locationText', ''),
      location_maps_url = coalesce(p_payload->>'locationMapsUrl', ''),
      registration_opens_at = (p_payload->>'registrationOpensAt')::timestamptz,
      registration_closes_at = (p_payload->>'registrationClosesAt')::timestamptz,
      schedule_text = coalesce(p_payload->>'scheduleText', ''), rules_text = coalesce(p_payload->>'rulesText', ''),
      promptpay_target_type = (coalesce(p_payload->>'promptpayTargetType', 'phone'))::promptpay_target_type,
      promptpay_target_value = coalesce(p_payload->>'promptpayTargetValue', ''),
      status = coalesce((nullif(p_payload->>'status', ''))::tournament_status, status), updated_at = now()
    where id = v_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.upsert_tournament(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_tournament(text, jsonb) to anon, authenticated, service_role;

create or replace function public.upsert_category(p_admin_secret text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_tid uuid; v_existing category; v_row category; v_cap int; v_code text;
  v_min int; v_max int; v_min_age int; v_max_age int; v_comb uuid[]; v_bad uuid;
begin
  v_id := nullif(p_payload->>'id', '')::uuid;
  -- On the update path the ROW decides the tournament (enforced again below);
  -- the guard has to be decided on that tournament, not on the payload's.
  v_tid := coalesce((select c.tournament_id from category c where c.id = v_id),
                    (p_payload->>'tournamentId')::uuid);
  if not _is_staff(p_admin_secret, v_tid) then raise exception 'UNAUTHORIZED'; end if;
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
end; $$;
revoke all on function public.upsert_category(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_category(text, jsonb) to anon, authenticated, service_role;

create or replace function public.admin_upsert_promo(p_admin_secret text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_id    uuid    := nullif(p_payload->>'id', '')::uuid;
  v_code  text    := btrim(coalesce(p_payload->>'code', ''));
  v_kind  text    := p_payload->>'kind';
  v_tid   uuid    := (p_payload->>'tournamentId')::uuid;
  v_value numeric := coalesce((p_payload->>'value')::numeric, 0);
  v_max   int     := nullif(p_payload->>'maxUses', '')::int;
  v_cur   uuid;
begin
  -- Row first, payload second: the update branch refuses a payload naming a
  -- different tournament, but the guard has to be decided on the row's.
  if v_id is not null then
    select tournament_id into v_cur from promo_code where id = v_id;
  end if;
  if not _is_staff(p_admin_secret, coalesce(v_cur, v_tid)) then raise exception 'UNAUTHORIZED'; end if;
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
end; $$;
revoke all on function public.admin_upsert_promo(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_upsert_promo(text, jsonb) to anon, authenticated, service_role;
