-- Link person_id at WRITE TIME so every profile/managed_player is bound to its
-- canonical go_person the instant it is saved — instead of only when the client
-- rank picker happens to set it, then healed later by an admin sync.
--
-- Problem (observed on prod): person_id was written ONLY by the client
-- RankPicker, and its manual paths (applyManual → "ไม่ใช่อันดับนี้" / "ไม่อยู่ใน
-- รายชื่อ") deliberately set it NULL. The DB upsert stored whatever the form held
-- (person_id = p.personId ?? null), with no server-side resolution. So a
-- registrant who declared their own rank — or edited their profile without a
-- fresh match — was saved unlinked and stayed unlinked until an admin ran Import
-- / Sync ranks. Worse: those names were reserved by ensure_go_person but have NO
-- go_player_database backing, and _propagate_person_ranks Pass A (0006) requires
-- EXACT backing to auto-link — so the admin sync could never link them either.
-- They were stuck NULL forever.
--
-- Fix (two parts):
--   1. A BEFORE INSERT/UPDATE trigger on profile + managed_player that fills a
--      NULL person_id from the name via ensure_go_person (reserve-or-return). It
--      links EVERYONE immediately, through every write path. Reserved rows carry
--      power_level = NULL, so Pass B still SKIPS them — a manually-declared rank
--      is preserved until that exact name lands in an imported rank DB, at which
--      point the official rank heals it (the ensure_go_person contract).
--   2. A durable `rank_self_declared` flag + admin_list_self_declared_ranks RPC so
--      the organizer can see exactly who typed their own rank (manual override /
--      not-in-list) and double-check them. The flag is set by the client on the
--      manual paths going forward; this migration also best-effort backfills the
--      obvious existing cases (linked to a purely-reserved person, rank > 0).

-- ============================================================================
-- 1. Durable self-declared flag
-- ============================================================================

alter table public.profile
  add column if not exists rank_self_declared boolean not null default false;
alter table public.managed_player
  add column if not exists rank_self_declared boolean not null default false;

-- ============================================================================
-- 2. Write-time auto-link trigger (shared by both tables)
-- ============================================================================

create or replace function public._autolink_person_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_first text := btrim(coalesce(new.first_name_th, ''));
  v_last  text := btrim(coalesce(new.last_name_th,  ''));
begin
  -- A genuine name change drops the stale link so it re-resolves to the NEW name.
  -- (A deliberately-chosen link always has a name matching its person, so this
  -- never re-points a match — only a real rename moves the link.)
  if tg_op = 'UPDATE'
     and (new.first_name_th is distinct from old.first_name_th
       or new.last_name_th  is distinct from old.last_name_th) then
    new.person_id := null;
  end if;

  -- Fill a NULL link from the name. ensure_go_person returns the existing
  -- canonical row or reserves a new one (power NULL until the name is imported).
  if new.person_id is null
     and v_first <> '' and v_last <> ''
     and char_length(v_first) <= 100 and char_length(v_last) <= 100 then
    begin
      new.person_id := public.ensure_go_person(v_first, v_last);
    exception when others then
      -- Best-effort: a link failure must NEVER block a registration write.
      if tg_op = 'UPDATE' then new.person_id := old.person_id; else new.person_id := null; end if;
    end;
  end if;

  return new;
end; $$;

-- NOTE: intentionally NOT revoking execute here. A trigger function errors if
-- called directly ("can only be called as a trigger"), so leaving the default
-- grant is harmless — and it avoids any chance of an EXECUTE-privilege check
-- blocking a registration write on some role.

drop trigger if exists trg_profile_autolink_person on public.profile;
create trigger trg_profile_autolink_person
  before insert or update of first_name_th, last_name_th, person_id
  on public.profile
  for each row execute function public._autolink_person_id();

drop trigger if exists trg_mp_autolink_person on public.managed_player;
create trigger trg_mp_autolink_person
  before insert or update of first_name_th, last_name_th, person_id
  on public.managed_player
  for each row execute function public._autolink_person_id();

-- ============================================================================
-- 3. admin_list_self_declared_ranks — the organizer worklist of people who
--    typed their own rank (manual override / not in the official DB)
-- ============================================================================

create or replace function public.admin_list_self_declared_ranks(p_admin_secret text)
returns table(
  kind          text,
  id            uuid,
  first_name_th text,
  last_name_th  text,
  power_level   integer,
  mobile_phone  text,
  person_id     uuid,
  owner_label   text,          -- null for self profiles; the owner's name for managed players
  created_at    timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return query
    select 'profile'::text, p.id, p.first_name_th, p.last_name_th,
           p.power_level, p.mobile_phone, p.person_id,
           null::text, p.created_at
      from profile p
     where p.rank_self_declared = true
    union all
    select 'managed_player'::text, m.id, m.first_name_th, m.last_name_th,
           m.power_level, m.mobile_phone, m.person_id,
           nullif(btrim(coalesce(o.first_name_th,'') || ' ' || coalesce(o.last_name_th,'')), ''),
           m.created_at
      from managed_player m
      left join profile o on o.id = m.owner_id
     where m.rank_self_declared = true
       and m.archived_at is null
     order by created_at desc;
end; $$;

revoke execute on function public.admin_list_self_declared_ranks(text) from public, anon;
grant  execute on function public.admin_list_self_declared_ranks(text) to authenticated;

-- ============================================================================
-- 4. Backfill — link everyone already saved, then flag the obvious manual cases
-- ============================================================================

-- 4a. Link every unlinked profile/player to its canonical (or newly reserved)
--     person. Setting person_id explicitly means the trigger's own fill is a
--     no-op (person_id already non-null), so no double work.
update public.profile p
   set person_id  = public.ensure_go_person(p.first_name_th, p.last_name_th),
       updated_at = now()
 where p.person_id is null
   and btrim(coalesce(p.first_name_th,'')) <> '' and char_length(btrim(p.first_name_th)) <= 100
   and btrim(coalesce(p.last_name_th ,'')) <> '' and char_length(btrim(p.last_name_th )) <= 100;

update public.managed_player p
   set person_id  = public.ensure_go_person(p.first_name_th, p.last_name_th),
       updated_at = now()
 where p.person_id is null
   and p.archived_at is null
   and btrim(coalesce(p.first_name_th,'')) <> '' and char_length(btrim(p.first_name_th)) <= 100
   and btrim(coalesce(p.last_name_th ,'')) <> '' and char_length(btrim(p.last_name_th )) <= 100;

-- 4b. Best-effort historical flag: a row linked to a PURELY-reserved person
--     (missing_since set AND never touched by a registry refresh) that carries a
--     rank ABOVE 15-kyu could only have got that rank by a manual pick — the
--     not-found default is always 15-kyu (power 0). Conservative on purpose:
--     power 0 stays unflagged (could be the auto beginner default), and truly
--     DB-backed matches are never touched. New writes set the flag precisely.
update public.profile p
   set rank_self_declared = true
  from public.go_person gp
 where p.person_id = gp.id
   and gp.missing_since is not null
   and gp.created_at = gp.updated_at
   and p.power_level is not null and p.power_level > 0
   and p.rank_self_declared = false;

update public.managed_player p
   set rank_self_declared = true
  from public.go_person gp
 where p.person_id = gp.id
   and p.archived_at is null
   and gp.missing_since is not null
   and gp.created_at = gp.updated_at
   and p.power_level is not null and p.power_level > 0
   and p.rank_self_declared = false;
