-- Live competition data (ผลการจับคู่ / ผลแข่งสด) — ports the tesuji-v1 Google-Sheet
-- backend to Supabase. Shape mirrors v1 so the existing clients (results.html /
-- judge / admin import) and the MacMahon-TESUJI .jar keep working unchanged:
--   • division ids are TEXT (e.g. "1-2_Kyu"), created by MacMahon export
--   • matches carry free-text black/white player names (no seat linkage — v1 parity)
--   • results are text ("1-0", "0-1", "?-?")
-- Writes never happen with the anon key directly: they go through SECURITY DEFINER
-- RPCs guarded by _is_live_writer() (admin passphrase OR the live_token). Reads are
-- public SELECT so the Live page + .jar GET work with the anon key.

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.live_division (
  id          text primary key,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.live_match (
  id           uuid primary key default gen_random_uuid(),
  division_id  text not null references public.live_division(id) on delete cascade,
  round        text not null,
  table_no     text not null,
  black        text not null default '',
  white        text not null default '',
  black_force  text not null default '',   -- v1 BlackForce (manual override)
  white_force  text not null default '',   -- v1 WhiteForce
  result       text not null default '?-?',
  remark       text not null default '',
  check_in     text not null default '',
  submitted_by text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (division_id, round, table_no)
);
create index if not exists live_match_div_round_idx on public.live_match (division_id, round);

create table if not exists public.live_standing (
  division_id text primary key references public.live_division(id) on delete cascade,
  headers     jsonb not null default '[]'::jsonb,
  rows        jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.live_config (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- ── RLS: public read, no direct writes (writes go through the guarded RPCs) ────
alter table public.live_division enable row level security;
alter table public.live_match    enable row level security;
alter table public.live_standing enable row level security;
alter table public.live_config   enable row level security;

drop policy if exists live_division_read on public.live_division;
drop policy if exists live_match_read    on public.live_match;
drop policy if exists live_standing_read on public.live_standing;
drop policy if exists live_config_read   on public.live_config;

create policy live_division_read on public.live_division for select to anon, authenticated using (true);
create policy live_match_read    on public.live_match    for select to anon, authenticated using (true);
create policy live_standing_read on public.live_standing for select to anon, authenticated using (true);
create policy live_config_read   on public.live_config   for select to anon, authenticated using (true);

-- ── Write authorization: admin passphrase OR the shared live_token ────────────
-- The live_token gates judges (secret link) and the MacMahon .jar. The admin
-- passphrase always qualifies. Both stored in app_config (key/value text).
insert into public.app_config (key, value)
values ('live_token', encode(gen_random_bytes(16), 'hex'))
on conflict (key) do nothing;

create or replace function public._is_live_writer(p_secret text)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select public._is_admin(p_secret)
      or exists (select 1 from app_config where key = 'live_token' and value = p_secret);
$$;

-- Lightweight gate the Judge page calls to validate its secret link.
create or replace function public.live_check_token(p_secret text)
returns boolean
language sql
security definer
set search_path to 'public'
as $$ select public._is_live_writer(p_secret); $$;

-- ── Write RPCs (all guarded) ──────────────────────────────────────────────────
create or replace function public.live_upsert_division(p_secret text, p_id text, p_name text, p_sort int default 0)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  insert into live_division (id, name, sort_order) values (p_id, p_name, coalesce(p_sort, 0))
  on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;
end; $$;

create or replace function public.live_delete_division(p_secret text, p_id text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  delete from live_division where id = p_id;   -- cascades to matches + standings
end; $$;

-- Replace one round's pairings wholesale (POST /api/divisions/:id/matches parity).
-- p_matches = [{"table":"1","black":"A","white":"B"}, ...]
create or replace function public.live_replace_round(p_secret text, p_division_id text, p_round text, p_matches jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare m jsonb;
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  delete from live_match where division_id = p_division_id and round = p_round;
  for m in select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) loop
    insert into live_match (division_id, round, table_no, black, white)
    values (
      p_division_id, p_round,
      coalesce(m->>'table',''), coalesce(m->>'black',''), coalesce(m->>'white','')
    )
    on conflict (division_id, round, table_no) do update
      set black = excluded.black, white = excluded.white, updated_at = now();
  end loop;
end; $$;

create or replace function public.live_delete_round(p_secret text, p_division_id text, p_round text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  delete from live_match where division_id = p_division_id and round = p_round;
end; $$;

create or replace function public.live_submit_result(p_secret text, p_division_id text, p_round text, p_table text, p_result text, p_remark text default null, p_by text default '')
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  update live_match
     set result = p_result,
         remark = coalesce(p_remark, remark),
         submitted_by = coalesce(nullif(p_by,''), submitted_by),
         updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end; $$;

create or replace function public.live_set_checkin(p_secret text, p_division_id text, p_round text, p_table text, p_checkin text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  update live_match set check_in = coalesce(p_checkin,''), updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end; $$;

create or replace function public.live_set_standings(p_secret text, p_division_id text, p_headers jsonb, p_rows jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  insert into live_standing (division_id, headers, rows, updated_at)
  values (p_division_id, coalesce(p_headers,'[]'::jsonb), coalesce(p_rows,'[]'::jsonb), now())
  on conflict (division_id) do update
    set headers = excluded.headers, rows = excluded.rows, updated_at = now();
end; $$;

create or replace function public.live_set_config(p_secret text, p_key text, p_value jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  insert into live_config (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end; $$;

-- ── Danger zone: wipe ALL live competition data (admin only, reusable per event)
create or replace function public.live_clear_all(p_admin_secret text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  -- WHERE true satisfies pg_safeupdate (preloaded on Supabase API roles), which
  -- blocks unqualified DELETE/UPDATE.
  delete from live_match    where true;
  delete from live_standing where true;
  delete from live_division where true;
  delete from live_config   where true;   -- announcement / schedule are per-event too
end; $$;

grant execute on function
  public.live_check_token(text),
  public.live_upsert_division(text, text, text, int),
  public.live_delete_division(text, text),
  public.live_replace_round(text, text, text, jsonb),
  public.live_delete_round(text, text, text),
  public.live_submit_result(text, text, text, text, text, text, text),
  public.live_set_checkin(text, text, text, text, text),
  public.live_set_standings(text, text, jsonb, jsonb),
  public.live_set_config(text, text, jsonb),
  public.live_clear_all(text)
to anon, authenticated;

-- ── Realtime: push table changes to subscribed Live pages (replaces SSE+polling)
alter publication supabase_realtime add table public.live_division;
alter publication supabase_realtime add table public.live_match;
alter publication supabase_realtime add table public.live_standing;
