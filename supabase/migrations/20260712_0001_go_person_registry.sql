-- Canonical resolved-person registry (go_person) + live rank propagation.
--
-- Problem: profile.power_level / managed_player.power_level are SNAPSHOTS copied
-- from go_player_database when the person last picked their rank, and the link
-- matched_go_player_id (FK → go_player_database, ON DELETE SET NULL) is nulled by
-- every re-import (replace_go_player_database_source = delete-then-insert). So a
-- rank DB refresh never reaches the people already in the system, and the
-- "ยืนยันจากฐานข้อมูล" link silently dies each import. On prod today every
-- profile/player has matched_go_player_id = NULL despite past matches.
--
-- Fix: a canonical registry keyed on the normalized Thai name pair with STABLE
-- ids that survive re-imports (upsert, never delete). profile/managed_player gain
-- a durable person_id link; on every import/sync the registry is re-resolved and
-- every linked person's power_level is pushed through the link. Names never
-- disappear from the source sheets in practice, but a person row that loses all
-- backing keeps its last power (never auto-demoted) and is flagged missing_since.
--
-- Resolution (mirrors the client searchRank, fuzzy removed — auto mode has no
-- human to confirm a fuzzy pick):
--   * identity = (first_name_th_normalized, last_name_th_normalized).
--   * a strong DAN row wins outright over kyu/award history; resolved iff all dan
--     rows agree on one power_level.
--   * otherwise kyu/award rows collapse per RAW spelling to their max power (the
--     client's byName collapse); resolved iff every spelling group agrees.
--   * disagreement → is_ambiguous, resolved power NULL → propagation SKIPS it, so
--     real namesakes keep whatever each person picked manually.
--   * go_player_database stays the raw evidence store (award-ceiling counts, the
--     candidate evidence in the picker) — untouched here.

-- ============================================================================
-- 1. Table + durable links
-- ============================================================================

create table if not exists public.go_person (
  id uuid primary key default gen_random_uuid(),          -- STABLE across re-imports
  first_name_th text not null,                            -- display spelling (strongest backing row)
  last_name_th  text not null,
  first_name_th_normalized text not null,
  last_name_th_normalized  text not null,
  power_level integer check (power_level is null or power_level between 0 and 25),
  resolved_source text check (resolved_source is null or resolved_source in ('dan','kyu','award')),
  is_ambiguous boolean not null default false,            -- strong candidates disagree on power
  missing_since timestamptz,                              -- no backing go_player_database rows since
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint go_person_norm_name_uniq
    unique (first_name_th_normalized, last_name_th_normalized)
);

-- RLS on, zero policies, direct grants revoked → reachable only via the definer
-- RPCs below (same posture as go_player_database).
alter table public.go_person enable row level security;
revoke all on public.go_person from anon, authenticated;

alter table public.profile
  add column if not exists person_id uuid references public.go_person(id) on delete set null;
alter table public.managed_player
  add column if not exists person_id uuid references public.go_person(id) on delete set null;
create index if not exists idx_profile_person on public.profile (person_id);
create index if not exists idx_mp_person      on public.managed_player (person_id);

-- ============================================================================
-- 2. _refresh_go_person_registry — rebuild the registry from go_player_database
--    (internal worker; upserts, NEVER deletes)
-- ============================================================================

create or replace function public._refresh_go_person_registry()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_persons bigint; v_ambiguous bigint; v_missing bigint;
begin
  with
  -- one display spelling per pair: prefer a dan row, then highest power
  display as (
    select distinct on (g.first_name_th_normalized, g.last_name_th_normalized)
           g.first_name_th_normalized as nfn,
           g.last_name_th_normalized  as nln,
           g.first_name_th            as disp_first,
           g.last_name_th             as disp_last
      from go_player_database g
     order by g.first_name_th_normalized, g.last_name_th_normalized,
              (g.source = 'dan') desc, g.power_level desc,
              g.uploaded_at desc nulls last, g.id
  ),
  -- dan branch: distinct powers among dan rows
  dan_agg as (
    select first_name_th_normalized as nfn, last_name_th_normalized as nln,
           count(distinct power_level) as dan_distinct,
           max(power_level)            as dan_power
      from go_player_database
     where source = 'dan'
     group by first_name_th_normalized, last_name_th_normalized
  ),
  -- kyu/award branch: collapse per raw spelling to its max power
  ka_grp as (
    select first_name_th_normalized as nfn, last_name_th_normalized as nln,
           first_name_th, last_name_th,
           max(power_level) as grp_max
      from go_player_database
     where source in ('kyu', 'award')
     group by first_name_th_normalized, last_name_th_normalized,
              first_name_th, last_name_th
  ),
  ka_agg as (
    select nfn, nln,
           count(distinct grp_max) as ka_distinct,
           max(grp_max)            as ka_power
      from ka_grp
     group by nfn, nln
  ),
  -- source of the winning (max-power) kyu/award row — informational only
  ka_src as (
    select distinct on (first_name_th_normalized, last_name_th_normalized)
           first_name_th_normalized as nfn, last_name_th_normalized as nln, source
      from go_player_database
     where source in ('kyu', 'award')
     order by first_name_th_normalized, last_name_th_normalized, power_level desc, id
  ),
  resolved as (
    select d.nfn, d.nln, d.disp_first, d.disp_last,
           case
             when da.nfn is not null then (da.dan_distinct <> 1)
             else (ka.ka_distinct is distinct from 1)
           end as is_ambiguous,
           case
             when da.nfn is not null then
               (case when da.dan_distinct = 1 then da.dan_power end)
             else
               (case when ka.ka_distinct = 1 then ka.ka_power end)
           end as power_level,
           case
             when da.nfn is not null then
               (case when da.dan_distinct = 1 then 'dan' end)
             else
               (case when ka.ka_distinct = 1 then ks.source end)
           end as resolved_source
      from display d
      left join dan_agg da on da.nfn = d.nfn and da.nln = d.nln
      left join ka_agg  ka on ka.nfn = d.nfn and ka.nln = d.nln
      left join ka_src  ks on ks.nfn = d.nfn and ks.nln = d.nln
  )
  insert into go_person (
    first_name_th, last_name_th, first_name_th_normalized, last_name_th_normalized,
    power_level, resolved_source, is_ambiguous, missing_since, updated_at)
  select disp_first, disp_last, nfn, nln,
         power_level, resolved_source, is_ambiguous, null, now()
    from resolved
  on conflict (first_name_th_normalized, last_name_th_normalized) do update set
    first_name_th   = excluded.first_name_th,
    last_name_th    = excluded.last_name_th,
    -- a pair turning ambiguous keeps its last resolved power (never demoted to null)
    power_level     = coalesce(excluded.power_level, go_person.power_level),
    resolved_source = coalesce(excluded.resolved_source, go_person.resolved_source),
    is_ambiguous    = excluded.is_ambiguous,
    missing_since   = null,
    updated_at      = now();

  -- rows no longer backed by any go_player_database row: flag, keep power
  update go_person gp
     set missing_since = now(), updated_at = now()
   where gp.missing_since is null
     and not exists (
       select 1 from go_player_database g
        where g.first_name_th_normalized = gp.first_name_th_normalized
          and g.last_name_th_normalized  = gp.last_name_th_normalized);

  select count(*),
         count(*) filter (where is_ambiguous),
         count(*) filter (where missing_since is not null)
    into v_persons, v_ambiguous, v_missing
    from go_person;

  return jsonb_build_object(
    'persons', v_persons, 'ambiguous', v_ambiguous, 'missing', v_missing);
end; $$;

-- ============================================================================
-- 3. _propagate_person_ranks — auto-link unlinked people, then push resolved
--    ranks through every link (internal worker)
-- ============================================================================

create or replace function public._propagate_person_ranks()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link_p bigint; v_link_m bigint; v_upd_p bigint; v_upd_m bigint;
begin
  -- ── Pass A: auto-link (fills NULL links only; never overwrites a chosen link).
  -- go_person's unique normalized pair guarantees ≤1 match per person row.
  update profile p
     set person_id = gp.id, updated_at = now()
    from go_person gp
   where p.person_id is null
     and btrim(coalesce(p.first_name_th, '')) <> ''
     and btrim(coalesce(p.last_name_th,  '')) <> ''
     and public.normalize_thai_name(p.first_name_th) = gp.first_name_th_normalized
     and public.normalize_thai_name(p.last_name_th)  = gp.last_name_th_normalized;
  get diagnostics v_link_p = row_count;

  update managed_player p
     set person_id = gp.id, updated_at = now()
    from go_person gp
   where p.person_id is null
     and p.archived_at is null
     and btrim(coalesce(p.first_name_th, '')) <> ''
     and btrim(coalesce(p.last_name_th,  '')) <> ''
     and public.normalize_thai_name(p.first_name_th) = gp.first_name_th_normalized
     and public.normalize_thai_name(p.last_name_th)  = gp.last_name_th_normalized;
  get diagnostics v_link_m = row_count;

  -- ── Pass B: apply resolved rank through the link. Ambiguous / missing / power-
  -- null persons are skipped WITHOUT touching the link or the stored power, so a
  -- manually-picked power sticks for collision rows through every refresh cycle.
  update profile p
     set power_level = gp.power_level,
         rank_status = 'verified',
         rank_reviewed_by = case when p.power_level is distinct from gp.power_level
                                 then null else p.rank_reviewed_by end,
         rank_reviewed_at = case when p.power_level is distinct from gp.power_level
                                 then null else p.rank_reviewed_at end,
         rank_review_note = case when p.power_level is distinct from gp.power_level
                                 then null else p.rank_review_note end,
         updated_at = now()
    from go_person gp
   where p.person_id = gp.id
     and gp.is_ambiguous = false
     and gp.missing_since is null
     and gp.power_level is not null
     and (p.power_level is distinct from gp.power_level or p.rank_status <> 'verified');
  get diagnostics v_upd_p = row_count;

  update managed_player p
     set power_level = gp.power_level,
         rank_status = 'verified',
         rank_reviewed_by = case when p.power_level is distinct from gp.power_level
                                 then null else p.rank_reviewed_by end,
         rank_reviewed_at = case when p.power_level is distinct from gp.power_level
                                 then null else p.rank_reviewed_at end,
         rank_review_note = case when p.power_level is distinct from gp.power_level
                                 then null else p.rank_review_note end,
         updated_at = now()
    from go_person gp
   where p.person_id = gp.id
     and p.archived_at is null
     and gp.is_ambiguous = false
     and gp.missing_since is null
     and gp.power_level is not null
     and (p.power_level is distinct from gp.power_level or p.rank_status <> 'verified');
  get diagnostics v_upd_m = row_count;

  return jsonb_build_object(
    'linkedProfiles',  v_link_p, 'linkedPlayers',   v_link_m,
    'updatedProfiles', v_upd_p,  'updatedPlayers',  v_upd_m);
end; $$;

-- ============================================================================
-- 4. admin_import_rank_database — replace a source's rows + refresh + propagate
--    in ONE transaction (supersedes replace_go_player_database_source in the app;
--    the old RPC is left untouched as the rollback path)
-- ============================================================================

create or replace function public.admin_import_rank_database(
  p_admin_secret text, p_source text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
  v_registry jsonb;
  v_propagation jsonb;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_source not in ('dan','kyu','award') then raise exception 'INVALID_SOURCE'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'ROWS_NOT_ARRAY'; end if;

  -- replace all rows for this source (mirrors live replace_go_player_database_source)
  delete from go_player_database where source = p_source;

  insert into go_player_database (
    source, seq, prefix_th, first_name_th, last_name_th,
    first_name_th_normalized, last_name_th_normalized, rank, power_level, rating,
    year_promoted, diamond, category, rank_in_category, rank_award,
    event_name, event_date, raw_data, uploaded_at)
  select p_source, r.seq, r.prefix_th, r.first_name_th, r.last_name_th,
    r.first_name_th_normalized, r.last_name_th_normalized, r.rank, r.power_level, r.rating,
    r.year_promoted, r.diamond, r.category, r.rank_in_category, r.rank_award,
    r.event_name, r.event_date, r.raw_data, now()
  from jsonb_to_recordset(p_rows) as r(
    seq text, prefix_th text, first_name_th text, last_name_th text,
    first_name_th_normalized text, last_name_th_normalized text, rank text,
    power_level integer, rating numeric, year_promoted integer, diamond text,
    category text, rank_in_category text, rank_award integer,
    event_name text, event_date text, raw_data jsonb)
  where r.first_name_th is not null and r.last_name_th is not null
    and r.first_name_th_normalized is not null and r.last_name_th_normalized is not null;

  get diagnostics v_count = row_count;

  v_registry    := public._refresh_go_person_registry();
  v_propagation := public._propagate_person_ranks();

  return jsonb_build_object('ok', true, 'imported', v_count)
         || v_registry || v_propagation;
end; $$;

-- ============================================================================
-- 5. admin_sync_player_ranks — manual refresh + propagate (admin button)
-- ============================================================================

create or replace function public.admin_sync_player_ranks(p_admin_secret text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_registry jsonb; v_propagation jsonb;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  v_registry    := public._refresh_go_person_registry();
  v_propagation := public._propagate_person_ranks();
  return jsonb_build_object('ok', true) || v_registry || v_propagation;
end; $$;

-- ============================================================================
-- 6. ensure_go_person — reserve a person row for a name the DB doesn't know yet,
--    so a not_found registrant gets a durable link that heals automatically the
--    day the name is imported (power stays NULL until then → propagation skips it)
-- ============================================================================

create or replace function public.ensure_go_person(p_first_name_th text, p_last_name_th text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_first text := btrim(coalesce(p_first_name_th, ''));
  v_last  text := btrim(coalesce(p_last_name_th, ''));
  v_id uuid;
begin
  if v_first = '' or v_last = '' then raise exception 'INVALID_NAME'; end if;
  if char_length(v_first) > 100 or char_length(v_last) > 100 then
    raise exception 'NAME_TOO_LONG';
  end if;

  insert into go_person (
    first_name_th, last_name_th, first_name_th_normalized, last_name_th_normalized,
    power_level, is_ambiguous, missing_since)
  values (
    v_first, v_last,
    public.normalize_thai_name(v_first), public.normalize_thai_name(v_last),
    null, false, now())
  on conflict (first_name_th_normalized, last_name_th_normalized)
    do update set updated_at = go_person.updated_at   -- no-op: return the existing id, keep its data
  returning id into v_id;

  return v_id;
end; $$;

-- ============================================================================
-- 7. admin_list_rank_conflicts — live seats whose occupant's CURRENT rank now
--    breaks the division band. Seats keep their snapshots (historical by design);
--    this is the admin worklist. Occupant resolved by source linkage, not name.
-- ============================================================================

create or replace function public.admin_list_rank_conflicts(p_admin_secret text)
returns table(
  seat_id uuid,
  batch_reference text,
  tournament_name text,
  category_code text,
  category_name text,
  first_name_th text,
  last_name_th text,
  seat_power_level integer,
  current_power_level integer,
  min_power_level integer,
  max_power_level integer,
  source_kind text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  -- returns-table names are in-scope plpgsql vars: every column stays qualified.
  return query
    select s.id, b.reference_code, t.name_th,
           c.code, c.name,
           s.first_name_th, s.last_name_th,
           s.power_level,
           cur.power_level,
           c.min_power_level, c.max_power_level,
           s.source_kind
      from registration_seat s
      join registration_batch b on b.id = s.batch_id
      join category c   on c.id = s.category_id
      join tournament t on t.id = c.tournament_id
      join lateral (
        select pr.power_level from profile pr
         where s.source_kind = 'self' and pr.id = b.account_id
        union all
        select mp.power_level from managed_player mp
         where s.source_kind = 'managed_player' and mp.id = s.source_player_id
      ) cur on true
     where s.withdrawn_at is null
       and b.status in ('pending_payment', 'pending_review', 'confirmed')
       -- negation of lib/rank.ts isRankEligible(): open band → anyone; bounded
       -- band → requires a non-null in-band rank (null counts as a violation)
       and not (
             (c.min_power_level is null and c.max_power_level is null)
          or (cur.power_level is not null
              and (c.min_power_level is null or cur.power_level >= c.min_power_level)
              and (c.max_power_level is null or cur.power_level <= c.max_power_level)))
     order by t.name_th, c.sort_order, s.first_name_th;
end; $$;

-- ============================================================================
-- 8. search_go_person — the picker search: search_go_player_database's body +
--    a left join to the canonical person row (evidence still from the raw table)
-- ============================================================================

create or replace function public.search_go_person(
  p_first_name_th text,
  p_last_name_th  text,
  p_sources       text[] default array['dan','kyu','award'],
  p_limit         integer default 5
)
returns table(
  id uuid, source text, first_name_th text, last_name_th text, rank text,
  power_level integer, rating numeric, match_type text, similarity_score real,
  year_promoted integer, diamond text, category text, rank_in_category text,
  rank_award integer, event_name text, event_date text, raw_data jsonb,
  person_id uuid, person_power_level integer, person_is_ambiguous boolean
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with input as (
    select
      trim(coalesce(p_first_name_th, '')) as first_name,
      trim(coalesce(p_last_name_th, '')) as last_name,
      public.normalize_thai_name(p_first_name_th) as first_name_norm,
      public.normalize_thai_name(p_last_name_th) as last_name_norm,
      public.normalize_thai_name(coalesce(p_first_name_th,'') || ' ' || coalesce(p_last_name_th,'')) as full_name_norm
  ),
  candidates as (
    select
      g.id, g.source, g.first_name_th, g.last_name_th, g.rank, g.power_level, g.rating,
      case
        when g.first_name_th = input.first_name and g.last_name_th = input.last_name then 'exact'
        when g.first_name_th_normalized = input.first_name_norm
          and g.last_name_th_normalized = input.last_name_norm then 'normalized'
        else 'fuzzy'
      end as match_type,
      greatest(
        similarity(g.first_name_th_normalized || ' ' || g.last_name_th_normalized, input.full_name_norm),
        similarity(g.first_name_th || ' ' || g.last_name_th, input.first_name || ' ' || input.last_name)
      ) as similarity_score,
      g.year_promoted, g.diamond, g.category, g.rank_in_category, g.rank_award,
      g.event_name, g.event_date,
      g.first_name_th_normalized as nfn, g.last_name_th_normalized as nln
    from public.go_player_database g
    cross join input
    where g.source = any(p_sources)
      and (
        (g.first_name_th = input.first_name and g.last_name_th = input.last_name)
        or (g.first_name_th_normalized = input.first_name_norm and g.last_name_th_normalized = input.last_name_norm)
        or similarity(g.first_name_th_normalized || ' ' || g.last_name_th_normalized, input.full_name_norm) > 0.4
      )
  )
  select
    c.id, c.source, c.first_name_th, c.last_name_th, c.rank, c.power_level, c.rating,
    c.match_type, c.similarity_score, c.year_promoted, c.diamond, c.category,
    c.rank_in_category, c.rank_award, c.event_name, c.event_date,
    null::jsonb as raw_data,                    -- never expose the raw imported source row
    gp.id           as person_id,
    gp.power_level  as person_power_level,
    gp.is_ambiguous as person_is_ambiguous
  from candidates c
  left join public.go_person gp
    on gp.first_name_th_normalized = c.nfn and gp.last_name_th_normalized = c.nln
  order by
    case c.match_type when 'exact' then 1 when 'normalized' then 2 else 3 end,
    c.similarity_score desc,
    c.power_level desc
  limit least(greatest(1, coalesce(p_limit, 5)), 25);   -- hard server-side cap
$function$;

-- ============================================================================
-- 9. Grants
-- ============================================================================

-- internal workers: not callable by any client role (wrappers run as owner)
revoke execute on function public._refresh_go_person_registry() from public, anon, authenticated;
revoke execute on function public._propagate_person_ranks()     from public, anon, authenticated;

-- client-callable, auth-gated surfaces
revoke execute on function public.search_go_person(text,text,text[],integer) from public, anon;
grant  execute on function public.search_go_person(text,text,text[],integer) to authenticated;
revoke execute on function public.ensure_go_person(text,text) from public, anon;
grant  execute on function public.ensure_go_person(text,text) to authenticated;

-- admin RPCs (gated internally by _is_admin)
revoke execute on function public.admin_import_rank_database(text,text,jsonb) from public, anon;
grant  execute on function public.admin_import_rank_database(text,text,jsonb) to authenticated;
revoke execute on function public.admin_sync_player_ranks(text) from public, anon;
grant  execute on function public.admin_sync_player_ranks(text) to authenticated;
revoke execute on function public.admin_list_rank_conflicts(text) from public, anon;
grant  execute on function public.admin_list_rank_conflicts(text) to authenticated;

-- ============================================================================
-- 10. One-shot production backfill — build the registry from the CURRENT
--     go_player_database and link + align everyone already deployed.
-- ============================================================================

do $$
declare v_registry jsonb; v_propagation jsonb;
begin
  v_registry    := public._refresh_go_person_registry();
  v_propagation := public._propagate_person_ranks();
  raise notice 'go_person backfill: registry=% propagation=%', v_registry, v_propagation;
end $$;
