-- ── Live / judge subsystem: per-tournament isolation ─────────────────────────
-- Requirement (2026-09-08): every tournament is fully independent. Until now
-- the live subsystem had ONE dimension shared by every event:
--   • live_division.id is a global text PK and the MacMahon .jar derives it
--     from the export filename ('01 - 1-2 Kyu.xml' → '01'), so a second
--     tournament's first upload took over the first tournament's division row
--     and dragged its matches and standings along (verified on prod, rolled
--     back): live_upsert_division's ON CONFLICT (id) DO UPDATE re-homed it.
--   • one app_config.live_token authorised writes to every division of every
--     tournament, so one judge link / one launcher.properties = all events;
--   • judges were a global account role (account_roles.judge) with a global
--     default_division_id;
--   • live_config.announcement was one row for every board;
--   • the "this tournament only" reset wiped live data for all of them.
--
-- This migration gives each of those a tournament dimension:
--   1. live_division gets `code` (what the .jar calls the id) + a NOT NULL
--      tournament_id; (tournament_id, code) is unique. `id` stays the single-
--      column PK the children reference, but it is now an opaque internal id:
--      legacy rows keep their bare code, new rows are '<tid8>-<code>'.
--   2. tournament_live_token: one write token per tournament (RPC-only table).
--      The tournament that owns the existing boards inherits the old global
--      token so deployed judge links and the current launcher.properties keep
--      working; app_config.live_token is removed.
--   3. tournament_judge: (tournament, account, default division). Existing
--      judges are moved to the tournament that owns the boards; the global
--      judge rows in account_roles are removed (account_roles keeps 'admin').
--   4. live_config keyed by (tournament_id, key).
--   5. Every live_* write RPC authorises against the DIVISION's tournament
--      (_can_write_division): a token can only touch its own tournament.
--      live_upsert_division derives the tournament from the token (the .jar
--      cannot say which event it is), so POST /api/divisions no longer guesses.
--   6. admin_selective_reset's 'live' group is scoped; live_clear_all and the
--      3-arg reset overload are dropped; live_clear_tournament replaces them.
--
-- Deploy: apply this FIRST, then ship the frontend immediately. Between the
-- two, old code that reads the dropped signatures fails loudly (judge button,
-- /admin/live token, /admin/judges) but nothing can write across tournaments.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) live_division: code + tournament_id NOT NULL + unique per tournament
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.live_division add column if not exists code text;
update public.live_division set code = id where code is null;
alter table public.live_division alter column code set not null;
alter table public.live_division drop constraint if exists live_division_code_nonempty;
alter table public.live_division add constraint live_division_code_nonempty check (btrim(code) <> '');

-- Any board still unassigned belongs to the tournament that already owns the
-- others; failing that the newest published tournament (the 20260822_0004
-- rule); failing that the newest tournament at all. Boards with no tournament
-- to belong to (an empty rebuild) are meaningless and go.
update public.live_division
   set tournament_id = coalesce(
     (select d.tournament_id from public.live_division d
       where d.tournament_id is not null
       group by d.tournament_id order by count(*) desc limit 1),
     (select t.id from public.tournament t where t.status = 'published'
       order by t.updated_at desc limit 1),
     (select t.id from public.tournament t order by t.updated_at desc limit 1))
 where tournament_id is null;
delete from public.live_division where tournament_id is null;
alter table public.live_division alter column tournament_id set not null;

-- Deleting a tournament now deletes its board (was ON DELETE SET NULL, which
-- left orphan divisions on the merged legacy board that no longer exists).
alter table public.live_division drop constraint if exists live_division_tournament_id_fkey;
alter table public.live_division add constraint live_division_tournament_id_fkey
  foreign key (tournament_id) references public.tournament(id) on delete cascade;

create unique index if not exists live_division_tournament_code_uniq
  on public.live_division (tournament_id, code);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) live_config: one announcement per tournament
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.live_config add column if not exists tournament_id uuid
  references public.tournament(id) on delete cascade;
update public.live_config
   set tournament_id = coalesce(
     (select d.tournament_id from public.live_division d
       group by d.tournament_id order by count(*) desc limit 1),
     (select t.id from public.tournament t where t.status = 'published'
       order by t.updated_at desc limit 1),
     (select t.id from public.tournament t order by t.updated_at desc limit 1))
 where tournament_id is null;
delete from public.live_config where tournament_id is null;
alter table public.live_config alter column tournament_id set not null;
alter table public.live_config drop constraint if exists live_config_pkey;
alter table public.live_config add constraint live_config_pkey primary key (tournament_id, key);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) tournament_live_token — RPC-only, like app_config was
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tournament_live_token (
  tournament_id uuid primary key references public.tournament(id) on delete cascade,
  token         text not null unique,
  created_at    timestamptz not null default now(),
  rotated_at    timestamptz
);
alter table public.tournament_live_token enable row level security;
-- Supabase's default privileges hand anon/authenticated full table rights on
-- every new table; RLS with no policy already denies, but be explicit.
revoke all on table public.tournament_live_token from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) tournament_judge — who judges WHICH tournament, and their default รุ่น
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tournament_judge (
  tournament_id       uuid not null references public.tournament(id) on delete cascade,
  account_id          uuid not null references auth.users(id) on delete cascade,
  default_division_id text references public.live_division(id) on delete set null,
  created_at          timestamptz not null default now(),
  primary key (tournament_id, account_id)
);
create index if not exists tournament_judge_account_idx on public.tournament_judge (account_id);
alter table public.tournament_judge enable row level security;
drop policy if exists tournament_judge_self_read on public.tournament_judge;
-- A judge may read their own assignments (the console resolves its default
-- รุ่น this way); nobody writes the table except through the admin RPCs.
create policy tournament_judge_self_read on public.tournament_judge
  for select to authenticated using (account_id = (select auth.uid()));
revoke all on table public.tournament_judge from public, anon;
revoke insert, update, delete on table public.tournament_judge from authenticated;
grant select on table public.tournament_judge to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Backfill: the tournament that owns today's boards inherits the global
--    token and the global judge roster, so nothing already in judges' hands
--    stops working. Every other tournament gets a fresh token.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_owner uuid;
  v_old   text;
begin
  select d.tournament_id into v_owner
    from public.live_division d
   group by d.tournament_id order by count(*) desc limit 1;
  select value into v_old from public.app_config where key = 'live_token';

  insert into public.tournament_live_token (tournament_id, token)
  select t.id,
         case when v_owner is not null and t.id = v_owner and v_old is not null
              then v_old
              else encode(gen_random_bytes(16), 'hex') end
    from public.tournament t
  on conflict (tournament_id) do nothing;

  if v_owner is not null then
    insert into public.tournament_judge (tournament_id, account_id, default_division_id, created_at)
    select v_owner, ar.account_id, ar.default_division_id, ar.created_at
      from public.account_roles ar
     where ar.role = 'judge'
    on conflict (tournament_id, account_id) do nothing;
  end if;
end $$;

delete from public.account_roles where role = 'judge';
alter table public.account_roles drop column if exists default_division_id;
delete from public.app_config where key = 'live_token';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Authorisation helpers
-- ─────────────────────────────────────────────────────────────────────────────
-- Which tournament a write secret belongs to (null = not a live token).
create or replace function public._live_token_tournament(p_secret text)
returns uuid
language sql security definer stable set search_path to 'public'
as $$
  select t.tournament_id from tournament_live_token t
   where p_secret is not null and p_secret <> '' and t.token = p_secret
   limit 1;
$$;
revoke all on function public._live_token_tournament(text) from public, anon, authenticated;

-- Coarse gate kept for live_check_token: "is this an admin or SOME tournament's token".
create or replace function public._is_live_writer(p_secret text)
returns boolean
language sql security definer set search_path to 'public'
as $$
  select public._is_admin(p_secret) or public._live_token_tournament(p_secret) is not null;
$$;

create or replace function public._can_write_tournament(p_secret text, p_tournament_id uuid)
returns boolean
language sql security definer set search_path to 'public'
as $$
  select public._is_admin(p_secret)
      or (p_tournament_id is not null
          and public._live_token_tournament(p_secret) = p_tournament_id);
$$;
revoke all on function public._can_write_tournament(text, uuid) from public, anon, authenticated;

-- The per-write gate: admin, or the token of the tournament that owns the division.
create or replace function public._can_write_division(p_secret text, p_division_id text)
returns boolean
language sql security definer set search_path to 'public'
as $$
  select public._is_admin(p_secret)
      or exists (select 1 from live_division d
                  where d.id = p_division_id
                    and d.tournament_id = public._live_token_tournament(p_secret));
$$;
revoke all on function public._can_write_division(text, text) from public, anon, authenticated;

-- Public wrapper for the Next.js API layer + /judge/[key]: resolves a secret to
-- its tournament. Only confirms a secret the caller already holds.
create or replace function public.live_token_tournament(p_secret text)
returns uuid
language sql security definer set search_path to 'public'
as $$ select public._live_token_tournament(p_secret); $$;
grant execute on function public.live_token_tournament(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Tokens: mint lazily, read (admin / assigned judge), rotate (admin)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public._ensure_live_token(p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v text;
begin
  insert into tournament_live_token (tournament_id, token)
  values (p_tournament_id, encode(gen_random_bytes(16), 'hex'))
  on conflict (tournament_id) do nothing;
  select token into v from tournament_live_token where tournament_id = p_tournament_id;
  return v;
end; $$;
revoke all on function public._ensure_live_token(uuid) from public, anon, authenticated;

drop function if exists public.live_get_token(text);
create or replace function public.live_get_token(p_admin_secret text, p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_tournament_id is null
     or not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  return _ensure_live_token(p_tournament_id);
end; $$;
revoke all on function public.live_get_token(text, uuid) from public, anon;
grant execute on function public.live_get_token(text, uuid) to authenticated;

-- A leaked judge link now costs one tournament its token, not the system.
create or replace function public.live_rotate_token(p_admin_secret text, p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_tournament_id is null
     or not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  insert into tournament_live_token (tournament_id, token, rotated_at)
  values (p_tournament_id, encode(gen_random_bytes(16), 'hex'), now())
  on conflict (tournament_id) do update
    set token = excluded.token, rotated_at = now();
  return (select token from tournament_live_token where tournament_id = p_tournament_id);
end; $$;
revoke all on function public.live_rotate_token(text, uuid) from public, anon;
grant execute on function public.live_rotate_token(text, uuid) to authenticated;

drop function if exists public.judge_get_token();
create or replace function public.judge_get_token(p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if not (_is_admin('') or exists (
        select 1 from tournament_judge
         where tournament_id = p_tournament_id and account_id = auth.uid())) then
    raise exception 'UNAUTHORIZED';
  end if;
  return _ensure_live_token(p_tournament_id);
end; $$;
revoke all on function public.judge_get_token(uuid) from public, anon;
grant execute on function public.judge_get_token(uuid) to authenticated;

-- Everything the signed-in judge is assigned to — feeds the per-tournament
-- "เปิดระบบกรรมการ" buttons on /results. Newest event first.
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
             'defaultDivisionId', j.default_division_id)
           order by t.competition_date desc, t.updated_at desc)
      from tournament_judge j
      join tournament t on t.id = j.tournament_id
     where j.account_id = auth.uid()), '[]'::jsonb);
end; $$;
revoke all on function public.judge_my_assignments() from public, anon;
grant execute on function public.judge_my_assignments() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) Admin: judges per tournament
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_set_judge(text, text, boolean, text);
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
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
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
revoke all on function public.admin_set_judge(text, uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_set_judge(text, uuid, text, boolean, text) to authenticated;

drop function if exists public.admin_list_judges(text);
create or replace function public.admin_list_judges(p_admin_secret text, p_tournament_id uuid)
returns table(account_id uuid, email text, first_name_th text, default_division_id text)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return query
    select j.account_id, u.email::text, p.first_name_th, j.default_division_id
      from tournament_judge j
      join auth.users u on u.id = j.account_id
      left join profile p on p.id = j.account_id
     where j.tournament_id = p_tournament_id
     order by u.email;
end; $$;
revoke all on function public.admin_list_judges(text, uuid) from public, anon;
grant execute on function public.admin_list_judges(text, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) Divisions: created under the token's tournament, identified by code
-- ─────────────────────────────────────────────────────────────────────────────
-- p_id is the code the .jar sends ('01'). The tournament comes from the token;
-- an admin (no token) must pass p_tournament_id. Returns the internal id the
-- children reference — the API layer hands that to the live_* RPCs.
drop function if exists public.live_upsert_division(text, text, text, int);
drop function if exists public.live_upsert_division(text, text, text, int, uuid);
create or replace function public.live_upsert_division(
  p_secret text, p_id text, p_name text, p_sort int default 0, p_tournament_id uuid default null
)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_tid  uuid;
  v_code text := btrim(coalesce(p_id, ''));
  v_id   text;
  v_sort int;
begin
  if v_code = '' then raise exception 'INVALID_DIVISION'; end if;
  v_tid := public._live_token_tournament(p_secret);
  if v_tid is null then
    if not _is_admin(p_secret) then raise exception 'UNAUTHORIZED'; end if;
    v_tid := p_tournament_id;
  elsif p_tournament_id is not null and p_tournament_id <> v_tid then
    raise exception 'UNAUTHORIZED';   -- a token never posts into another tournament
  end if;
  if v_tid is null or not exists (select 1 from tournament where id = v_tid) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  -- Same sort rule as 20260725_0001 §4, keyed on the code.
  v_sort := coalesce(nullif(p_sort, 0),
                     nullif(substring(v_code from '^[0-9]{1,6}'), '')::int,
                     1000000);
  select id into v_id from live_division
   where tournament_id = v_tid and code = v_code;
  if v_id is null then
    v_id := left(v_tid::text, 8) || '-' || v_code;
    insert into live_division (id, code, name, sort_order, tournament_id)
    values (v_id, v_code, coalesce(nullif(btrim(p_name), ''), v_code), v_sort, v_tid);
  else
    update live_division
       set name = coalesce(nullif(btrim(p_name), ''), name), sort_order = v_sort
     where id = v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.live_upsert_division(text, text, text, int, uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) Write RPCs: bodies unchanged from their latest definitions (verified by
--     md5 against prod), guard swapped to the division's tournament.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.live_replace_round(p_secret text, p_division_id text, p_round text, p_matches jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare m jsonb;
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;
  delete from live_match where division_id = p_division_id and round = p_round;
  for m in select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) loop
    insert into live_match (division_id, round, table_no, black, white, black_score, white_score)
    values (
      p_division_id, p_round,
      coalesce(m->>'table',''), coalesce(m->>'black',''), coalesce(m->>'white',''),
      m->>'blackScore', m->>'whiteScore'
    )
    on conflict (division_id, round, table_no) do update
      set black = excluded.black, white = excluded.white,
          black_score = excluded.black_score, white_score = excluded.white_score,
          updated_at = now();
  end loop;
end; $$;

create or replace function public.live_delete_round(p_secret text, p_division_id text, p_round text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;
  delete from live_match where division_id = p_division_id and round = p_round;
end; $$;

create or replace function public.live_set_checkin(p_secret text, p_division_id text, p_round text, p_table text, p_checkin text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;
  update live_match set check_in = coalesce(p_checkin,''), updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end; $$;

create or replace function public.live_set_standings(p_secret text, p_division_id text, p_headers jsonb, p_rows jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;
  insert into live_standing (division_id, headers, rows, updated_at)
  values (p_division_id, coalesce(p_headers,'[]'::jsonb), coalesce(p_rows,'[]'::jsonb), now())
  on conflict (division_id) do update
    set headers = excluded.headers, rows = excluded.rows, updated_at = now();
end; $$;

create or replace function public.live_set_force(
  p_secret text, p_division_id text, p_round text, p_table text,
  p_black_force text, p_white_force text, p_remark text default null
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_nb text := coalesce(nullif(trim(p_black_force), ''), '');
  v_nw text := coalesce(nullif(trim(p_white_force), ''), '');
  v_n  int;
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;

  update live_match
     set black_force = v_nb,
         white_force = v_nw,
         remark      = coalesce(p_remark, remark),
         updated_at  = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'MATCH_NOT_FOUND'; end if;

  update live_match
     set black_force = 'ไม่มีผู้เข้าแข่งขัน', updated_at = now()
   where division_id = p_division_id and round = p_round and table_no <> p_table
     and coalesce(nullif(black_force, ''), black) <> ''
     and coalesce(nullif(black_force, ''), black) in (v_nb, v_nw);

  update live_match
     set white_force = 'ไม่มีผู้เข้าแข่งขัน', updated_at = now()
   where division_id = p_division_id and round = p_round and table_no <> p_table
     and coalesce(nullif(white_force, ''), white) <> ''
     and coalesce(nullif(white_force, ''), white) in (v_nb, v_nw);
end; $$;

create or replace function public.live_submit_result(
  p_secret text, p_division_id text, p_round text, p_table text,
  p_result text, p_remark text default null, p_by text default ''
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_n int;
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;
  update live_match
     set result = p_result,
         remark = coalesce(p_remark, remark),
         submitted_by = coalesce(nullif(p_by,''), submitted_by),
         updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'MATCH_NOT_FOUND'; end if;
end; $$;

create or replace function public.live_toggle_checkin(
  p_secret text,
  p_division_id text,
  p_round text,
  p_table text,
  p_side text,
  p_checked boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chk text;
  v_abs text;
begin
  if not _can_write_division(p_secret, p_division_id) then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_side not in ('B', 'W') then
    raise exception 'INVALID_SIDE';
  end if;

  select check_in, absent into v_chk, v_abs
    from live_match
   where division_id = p_division_id and round = p_round and table_no = p_table
     for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;
  v_chk := coalesce(v_chk, '');
  v_abs := coalesce(v_abs, '');

  if p_side = 'B' then
    v_chk := case
      when p_checked then (case when v_chk in ('W', 'BOTH') then 'BOTH' else 'B' end)
      else (case when v_chk = 'BOTH' then 'W' when v_chk = 'B' then '' else v_chk end)
    end;
    if p_checked then
      v_abs := case when v_abs = 'BOTH' then 'W' when v_abs = 'B' then '' else v_abs end;
    end if;
  else
    v_chk := case
      when p_checked then (case when v_chk in ('B', 'BOTH') then 'BOTH' else 'W' end)
      else (case when v_chk = 'BOTH' then 'B' when v_chk = 'W' then '' else v_chk end)
    end;
    if p_checked then
      v_abs := case when v_abs = 'BOTH' then 'B' when v_abs = 'W' then '' else v_abs end;
    end if;
  end if;

  update live_match
     set check_in = v_chk, absent = v_abs, updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end;
$$;

create or replace function public.live_toggle_absent(
  p_secret text,
  p_division_id text,
  p_round text,
  p_table text,
  p_side text,
  p_absent boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_abs text;
  v_chk text;
begin
  if not _can_write_division(p_secret, p_division_id) then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_side not in ('B', 'W') then
    raise exception 'INVALID_SIDE';
  end if;

  select absent, check_in into v_abs, v_chk
    from live_match
   where division_id = p_division_id and round = p_round and table_no = p_table
     for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;
  v_abs := coalesce(v_abs, '');
  v_chk := coalesce(v_chk, '');

  if p_side = 'B' then
    v_abs := case
      when p_absent then (case when v_abs in ('W', 'BOTH') then 'BOTH' else 'B' end)
      else (case when v_abs = 'BOTH' then 'W' when v_abs = 'B' then '' else v_abs end)
    end;
    if p_absent then
      v_chk := case when v_chk = 'BOTH' then 'W' when v_chk = 'B' then '' else v_chk end;
    end if;
  else
    v_abs := case
      when p_absent then (case when v_abs in ('B', 'BOTH') then 'BOTH' else 'W' end)
      else (case when v_abs = 'BOTH' then 'B' when v_abs = 'W' then '' else v_abs end)
    end;
    if p_absent then
      v_chk := case when v_chk = 'BOTH' then 'B' when v_chk = 'W' then '' else v_chk end;
    end if;
  end if;

  update live_match
     set absent = v_abs, check_in = v_chk, updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end;
$$;

-- Announcement (and any future per-event key) now needs the tournament.
drop function if exists public.live_set_config(text, text, jsonb);
create or replace function public.live_set_config(p_secret text, p_tournament_id uuid, p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _can_write_tournament(p_secret, p_tournament_id) then raise exception 'UNAUTHORIZED'; end if;
  if not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  insert into live_config (tournament_id, key, value, updated_at)
  values (p_tournament_id, p_key, p_value, now())
  on conflict (tournament_id, key) do update set value = excluded.value, updated_at = now();
end; $$;
grant execute on function public.live_set_config(text, uuid, text, jsonb) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) Clearing live data: one tournament at a time
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.live_clear_all(text);
create or replace function public.live_clear_tournament(p_admin_secret text, p_tournament_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_tournament_id is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  delete from live_match    where division_id in (select id from live_division where tournament_id = p_tournament_id);
  delete from live_standing where division_id in (select id from live_division where tournament_id = p_tournament_id);
  delete from live_config   where tournament_id = p_tournament_id;
  delete from live_division where tournament_id = p_tournament_id;
end; $$;
revoke all on function public.live_clear_tournament(text, uuid) from public, anon;
grant execute on function public.live_clear_tournament(text, uuid) to authenticated;

-- admin_selective_reset: drop the legacy global overload (service_role-only,
-- unused since the admin-reset edge function moved to the 4-arg call) and scope
-- the 'live' group. Everything else is the 20260822_0001 body verbatim.
drop function if exists public.admin_selective_reset(uuid, text, text[]);
create or replace function public.admin_selective_reset(
  p_keep_uid uuid,
  p_confirm text,
  p_targets text[],
  p_tournament_id uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_known constant text[] := array[
    'registrations','promo_codes','accounts','institutes',
    'player_db','live','categories','tournament'];
  v_counts jsonb := '{}'::jsonb;
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
    if not ('registrations' = any(p_targets)) then
      update registration_batch set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
      update seat_withdrawal set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
      update promo_redemption set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
    end if;
    delete from auth.users where id <> p_keep_uid;
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
$function$;

revoke all on function public.admin_selective_reset(uuid, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_selective_reset(uuid, text, text[], uuid) to service_role;
