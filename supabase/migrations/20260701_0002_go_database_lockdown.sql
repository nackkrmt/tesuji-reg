-- Pre-deploy hardening #2 — stop the bulk PII dump of go_player_database.
-- The table had RLS policy gpd_read_all USING(true) for {anon,authenticated}, so the
-- whole national/club rank roster (real names incl. minors + raw source rows) was
-- pageable with the public anon key. search_go_player_database was NOT security
-- definer, so it relied on that open policy. Fix: make the search RPC SECURITY
-- DEFINER (owner reads the table), hard-cap the result count, stop returning the
-- raw source blob, then drop the open table policy so the RPC is the only read path.

-- ── search RPC: definer + capped + no raw_data leak ──────────────────────────
create or replace function public.search_go_player_database(
  p_first_name_th text,
  p_last_name_th  text,
  p_sources       text[] default array['dan','kyu','award'],
  p_limit         integer default 5
)
returns table(
  id uuid, source text, first_name_th text, last_name_th text, rank text,
  power_level integer, rating numeric, match_type text, similarity_score real,
  year_promoted integer, diamond text, category text, rank_in_category text,
  rank_award integer, event_name text, event_date text, raw_data jsonb
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
      g.event_name, g.event_date
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
    id, source, first_name_th, last_name_th, rank, power_level, rating,
    match_type, similarity_score, year_promoted, diamond, category,
    rank_in_category, rank_award, event_name, event_date,
    null::jsonb as raw_data           -- never expose the raw imported source row
  from candidates
  order by
    case match_type when 'exact' then 1 when 'normalized' then 2 else 3 end,
    similarity_score desc,
    power_level desc
  limit least(greatest(1, coalesce(p_limit, 5)), 25);   -- hard server-side cap
$function$;

-- ── remove the open table read + revoke direct SELECT ────────────────────────
-- The app only ever reaches this table through the search RPC (verified: no
-- .from("go_player_database") in the client) and admin import via the service role,
-- so no client role needs direct table access.
drop policy if exists gpd_read_all on public.go_player_database;
revoke select on public.go_player_database from anon, authenticated;
