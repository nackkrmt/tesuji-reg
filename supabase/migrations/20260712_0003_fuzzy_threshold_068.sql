-- Adjust the rank-picker fuzzy gate from 0.7 to 0.68 (inclusive).
--
-- 0.7 was too strict: it caught only a single dropped character (~0.71) and let
-- a mis-ordered vowel/tone typo (e.g. ตั้ง vs ต้ัง, similarity exactly 0.68) fall
-- through to "not found → 15 kyu". Since fuzzy candidates now NEVER auto-apply
-- (the user must pick one), a slightly looser gate is safe — it only surfaces
-- more suggestions, never a wrong silent rank. Use `>= 0.68` so a name scoring
-- exactly 0.68 is included instead of dropped on a strict `>` boundary.
--
-- Only the WHERE threshold changes vs 20260712_0002; everything else identical.

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
        or similarity(g.first_name_th_normalized || ' ' || g.last_name_th_normalized, input.full_name_norm) >= 0.68
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
$function$;
