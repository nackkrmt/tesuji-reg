-- ── Housekeeping: the one table that grows while nobody registers ────────────
-- Audit 2026-09-15. Four non-behavioural items. Nothing here changes what any
-- RPC returns; they change what the database spends its disk and its per-call
-- work on.
--
--   1. cron.job_run_details IS THE BIGGEST OBJECT IN THE DATABASE. pg_cron
--      writes one row per run and never deletes them unless a cleanup job
--      exists. 0002_operational_objects.sql scheduled release-expired-holds at
--      '* * * * *' and nothing else, so at audit time that table held 128,264
--      rows / 20 MB of a 46 MB database — ~44% — with the oldest run dating to
--      2026-06-15 and growing 1,440 rows (≈0.5 MB) a day forever, toward the
--      free-tier 500 MB cap, inflating every backup and export on the way.
--      pg_stat_statements shows the real cost of the minute sweep is five
--      statements, not one: the sweep plus four job_run_details bookkeeping
--      writes, run all year for a database whose active_holds is 0 except
--      during a registration window.
--
--      The sweep itself stays at one minute — item 4 below removes the lazy
--      release from the read RPCs, so the cron job is now the ONLY thing
--      expiring holds and a player must not watch a seat stay held for five
--      minutes after their 15 are up. The purge is what fixes the growth.
--
--      NOTE ON PERMISSIONS: cron.job_run_details lives in the `cron` schema and
--      is owned by supabase_admin, so this normally needs the postgres role.
--      Checked against production before writing this file: the migration role
--      (postgres) has USAGE on cron, DELETE on cron.job_run_details and EXECUTE
--      on cron.schedule, and the existing job already runs as postgres — so
--      both statements below apply as written. If a future environment refuses
--      them, run them by hand from the Supabase SQL editor as postgres; nothing
--      else in this migration depends on them.
--
--   2. registration_batch HAD NO INDEX ON hold_id. release_expired_holds ends
--      each iteration with `update registration_batch set status = 'expired'
--      where hold_id = r.id and status = 'pending_payment'`, and the only
--      indexes were (id), (account_id) and (tournament_id, status) — hence
--      17,342 sequential scans over the table. 177 rows means one page today,
--      so this is insurance for the next registration rush, not a fix. The
--      other 18 unindexed foreign keys the advisor lists were checked against
--      the code paths and left alone deliberately: every table involved is
--      0–228 rows, and 18 more indexes would cost more write amplification
--      than they could save.
--
--   3. THE TRIGRAM INDEXES DID NOT COVER THE FUZZY BRANCH. search_go_person's
--      third predicate is `similarity(first_name_th_normalized || ' ' ||
--      last_name_th_normalized, <input>) >= 0.68`, but the only trigram
--      indexes were on the RAW first_name_th and last_name_th columns — and
--      `similarity() >= x` is not index-able at all; only the `%` operator is.
--      So every rank lookup scanned all 4,040 rows computing two similarity()
--      values each. 33 ms today, but the DAN/KYU/AWARD sheets grow with every
--      event and RankPicker fires this on every tap during registration.
--
--      The rewrite keeps the result set EXACTLY as it is: `%` (index-able,
--      with the threshold pinned to 0.68 on the function itself) is ANDed with
--      the original similarity() test, so even if the threshold were ever
--      loosened elsewhere the recheck still decides what comes back.
--
--   4. THE HOTTEST READ RPCs PERFORMED WRITES. my_registrations,
--      admin_list_registrations and admin_category_stats each began with
--      `perform release_expired_holds(...)`, a plpgsql loop that takes row
--      locks on seat_hold and issues three UPDATEs per expired hold — inside
--      what store.tsx treats as an idempotent read and wraps in withRetry. The
--      minute cron already does this, so the lazy call only ever mattered in
--      the ≤60 s window after a hold expires; the price was a write path and
--      lock acquisition on every dashboard poll, dock-badge fetch and auth
--      refetch (the admin variants are the top statement by total time in
--      pg_stat_statements: 4,644 calls at 29.5 ms). reserve_seats and
--      get_batch_public keep theirs — there the freshness of one specific hold
--      is the answer to the question being asked.
--
--      They stay VOLATILE rather than being marked STABLE. STABLE would only
--      buy PostgREST the right to serve them over GET, which no caller uses,
--      and two of the three still call _is_admin, which is VOLATILE. The write
--      removal is the substance; the marker would be a claim without a payer.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Purge pg_cron's run history (see item 1 — postgres role required)
-- ─────────────────────────────────────────────────────────────────────────────

-- One manual purge for the 128k rows already there; the job below keeps it flat.
-- end_time is null while a run is in flight, so those rows are never touched.
delete from cron.job_run_details where end_time < now() - interval '7 days';

-- Re-runnable: older pg_cron builds error on a duplicate jobname instead of
-- replacing it.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'purge-cron-history') then
    perform cron.unschedule('purge-cron-history');
  end if;
end
$do$;

select cron.schedule(
  'purge-cron-history',
  '0 3 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '7 days' $job$);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) The one foreign key worth indexing (see item 2)
-- ─────────────────────────────────────────────────────────────────────────────

-- Not CONCURRENTLY: that cannot run inside a transaction block, and at 177
-- rows the plain build is instant.
create index if not exists idx_batch_hold
  on public.registration_batch (hold_id)
  where hold_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Make the fuzzy name search index-able (see item 3)
-- ─────────────────────────────────────────────────────────────────────────────

-- The expression the fuzzy predicate actually compares. Both columns are NOT
-- NULL, so every row is indexed. gin_trgm_ops is schema-qualified because
-- pg_trgm lives in `extensions` and a migration's search_path may not include it.
create index if not exists idx_gpd_fullname_trgm
  on public.go_player_database
  using gin ((first_name_th_normalized || ' ' || last_name_th_normalized) extensions.gin_trgm_ops);

create or replace function public.search_go_person(p_first_name_th text, p_last_name_th text, p_sources text[] default array['dan'::text, 'kyu'::text, 'award'::text], p_limit integer default 5)
returns table(id uuid, source text, first_name_th text, last_name_th text, rank text, power_level integer, rating numeric, match_type text, similarity_score real, year_promoted integer, diamond text, category text, rank_in_category text, rank_award integer, event_name text, event_date text, raw_data jsonb, person_id uuid, person_power_level integer, person_is_ambiguous boolean)
language sql
stable
security definer
set search_path to 'public', 'extensions'
set pg_trgm.similarity_threshold to '0.68'
as $fn$
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
        -- `%` is what idx_gpd_fullname_trgm can answer; the function-level
        -- pg_trgm.similarity_threshold pins it to the same 0.68 the explicit
        -- test uses, and that test is kept so the result set cannot drift if
        -- the threshold is ever changed out from under this function.
        or ((g.first_name_th_normalized || ' ' || g.last_name_th_normalized) % input.full_name_norm
            and similarity(g.first_name_th_normalized || ' ' || g.last_name_th_normalized, input.full_name_norm) >= 0.68)
      )
  )
  select
    c.id, c.source, c.first_name_th, c.last_name_th, c.rank, c.power_level, c.rating,
    c.match_type, c.similarity_score, c.year_promoted, c.diamond, c.category,
    c.rank_in_category, c.rank_award, c.event_name, c.event_date,
    null::jsonb as raw_data,
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
  limit least(greatest(1, coalesce(p_limit, 5)), 25);
$fn$;

revoke all on function public.search_go_person(text, text, text[], integer) from public, anon, authenticated;
grant execute on function public.search_go_person(text, text, text[], integer) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Read RPCs stop writing (see item 4)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.my_registrations()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  -- The per-tournament release_expired_holds sweep that used to run here is
  -- gone: the minute cron does it, and this is a read.
  return coalesce((
    select jsonb_agg(_batch_json(b.id) order by b.created_at desc)
    from registration_batch b
    where b.account_id = v_uid
      and b.status <> 'cancelled'
  ), '[]'::jsonb);
end;
$fn$;

revoke all on function public.my_registrations() from public, anon, authenticated;
grant execute on function public.my_registrations() to anon, authenticated, service_role;

create or replace function public.admin_list_registrations(p_admin_secret text, p_tournament_id uuid, p_status text default 'all'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(_batch_json(b.id) order by b.created_at desc)
    from registration_batch b
    where b.tournament_id = p_tournament_id and b.status <> 'cancelled'
      and (p_status = 'all' or b.status = p_status::registration_status)
  ), '[]'::jsonb);
end; $fn$;

revoke all on function public.admin_list_registrations(text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_registrations(text, uuid, text) to anon, authenticated, service_role;

create or replace function public.admin_category_stats(p_admin_secret text, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
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
end; $fn$;

revoke all on function public.admin_category_stats(text, uuid) from public, anon, authenticated;
grant execute on function public.admin_category_stats(text, uuid) to anon, authenticated, service_role;
