-- ── วันที่แข่งขัน becomes a list: tournament.competition_dates ───────────────
-- A tournament had exactly one competition_date. Real events do not: a
-- championship runs Saturday and Sunday, a school league plays ten Saturdays
-- with weeks in between, and the organiser was typing the first day into the
-- box and the rest into the name. On every day after the first, three things
-- then went wrong: the home page filed the event under "finished", /t/<id>
-- stopped handing arrivals straight to the pairing board, and the board itself
-- told everyone the competition day had not arrived.
--
-- Shape: competition_dates date[], ascending and unique, free to skip days.
-- competition_date (text) stays, kept equal to the FIRST day, so every reader
-- that orders or filters by it works unchanged: judge_my_assignments and
-- admin_list_rank_conflicts (newest event first), the live board's
-- tournamentDate, and purge-slips' query (which now also reads the list, so
-- the retention clock runs from the last day).
--
-- Backfill: a row whose competition_date is a real yyyy-mm-dd gets the
-- one-element list. Free-text rows ("ปลายเดือนกันยายน") stay empty — unknown
-- is not a day, and the admin form makes the organiser pick real days on the
-- next save, which also overwrites the free text with the first of them.
--
-- upsert_tournament whitelists every column in both branches (20260716_0001),
-- so it is re-declared to carry the list. Two client generations call it:
--   · the new build sends competitionDates (an array); the server sorts and
--     de-duplicates it and derives competition_date from it — the payload's
--     own competitionDate is ignored, so the two can never disagree;
--   · the deployed build sends only competitionDate; the server derives the
--     one-element list from that, as the backfill did.
-- Each element must be a strict yyyy-mm-dd: the date type would also take
-- "Sep 5 2026", and a column that is compared as text elsewhere cannot afford
-- a second spelling.
--
-- Deploy: SQL first. The new build selects competition_dates on /t/<id> (the
-- LINE link card) and in the live snapshot, and a save from the new build
-- through the OLD function would keep only the first day. Safe against the
-- deployed build: the column is defaulted and the function still takes the
-- old payload. /api/health probes the column.

-- ============================================================================
-- 1. The column, and the backfill
-- ============================================================================

alter table public.tournament
  add column if not exists competition_dates date[] not null default '{}';

-- Is this text one real calendar day written as yyyy-mm-dd? Strict spelling,
-- and "2026-02-30" is not one. A pure predicate: no auth, no data.
create or replace function public._is_iso_day(p_text text)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $$
begin
  if p_text is null or p_text !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform p_text::date;
  return true;
exception when others then
  return false;
end; $$;
revoke all on function public._is_iso_day(text) from public, anon, authenticated;

update public.tournament
   set competition_dates = array[substring(competition_date from '^\d{4}-\d{2}-\d{2}')::date]
 where competition_dates = '{}'
   and _is_iso_day(substring(competition_date from '^\d{4}-\d{2}-\d{2}'));

-- ============================================================================
-- 2. upsert_tournament — carries the list; body otherwise as 20260716_0001
-- ============================================================================

create or replace function public.upsert_tournament(p_admin_secret text, p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid; v_row tournament;
  v_days date[]; v_first text; v_bad text;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  if p_payload ? 'competitionDates' then
    -- the new build: the list is the truth and competition_date its first day
    if jsonb_typeof(p_payload->'competitionDates') <> 'array' then
      raise exception 'INVALID_COMPETITION_DATES';
    end if;
    select e.v into v_bad
      from jsonb_array_elements_text(p_payload->'competitionDates') as e(v)
     where not _is_iso_day(e.v)
     limit 1;
    if v_bad is not null then
      raise exception 'INVALID_COMPETITION_DATE:%', v_bad;
    end if;
    select coalesce(array_agg(s.d order by s.d), '{}'::date[]) into v_days
      from (select distinct e.v::date as d
              from jsonb_array_elements_text(p_payload->'competitionDates') as e(v)) s;
    v_first := coalesce(to_char(v_days[1], 'YYYY-MM-DD'), '');
  else
    -- the deployed build (before this migration): one day, under the old key
    v_first := coalesce(p_payload->>'competitionDate', '');
    v_days := case when _is_iso_day(v_first) then array[v_first::date] else '{}'::date[] end;
  end if;

  v_id := nullif(p_payload->>'id', '')::uuid;
  if v_id is null then
    insert into tournament(name_th, banner_url, venue_map_url,
      competition_date, competition_dates, location_text, location_maps_url,
      registration_opens_at, registration_closes_at, schedule_text, rules_text,
      promptpay_target_type, promptpay_target_value, status)
    values (p_payload->>'nameTh', nullif(p_payload->>'bannerUrl', ''), nullif(p_payload->>'venueMapUrl', ''),
      v_first, v_days,
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
      competition_date = v_first,
      competition_dates = v_days,
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
end; $function$;

-- Gated by _is_admin inside, which needs a signed-in account holding the role:
-- anon could only ever be refused. Said in the grant, as docs/DEV-SETUP.md
-- § Schema changes asks of every function a migration creates or replaces.
revoke all on function public.upsert_tournament(text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_tournament(text, jsonb) to authenticated;
