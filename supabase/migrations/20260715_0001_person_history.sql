-- Person history surfaces — power the admin "ประวัตินักกีฬา" tab and the
-- RankPicker "ประวัติจากฐานข้อมูล" panel.
--
-- 1. person_rank_history(first, last) — signed-in users: the FULL raw history
--    (dan/kyu/award rows incl. seq + gat/rating) for ONE person-identity, i.e.
--    every go_player_database row in the same normalized-name equality class the
--    go_person registry groups by. search_go_person already exposes these rows
--    per-candidate (minus seq, collapsed to strongest-per-person); this returns
--    the whole set so a matched registrant sees their own record.
--    raw_data is deliberately NEVER selected — award imports carry phone numbers.
--
-- 2. admin_search_person_history(secret, query, limit) — admin-only partial-name
--    search over go_person, which is the COMPLETE person index: every imported
--    name pair is upserted by the registry refresh, and 20260714_0001 reserves a
--    row for every in-system-only profile/managed_player name. Returns, per
--    person: the full go-DB history, in-system links (profiles / managed players
--    via person_id), and registered seats — matched by the seat's normalized
--    name snapshot, the same identity class (precedent: cross-account dup check
--    in 20260708_0001, which also matches seats by normalized name).

-- ============================================================================
-- 1. person_rank_history — full history for one person-identity
-- ============================================================================

create or replace function public.person_rank_history(
  p_first_name_th text,
  p_last_name_th  text
)
returns table(
  id               uuid,
  source           text,
  seq              text,
  rank             text,
  power_level      integer,
  rating           numeric,
  year_promoted    integer,
  diamond          text,
  category         text,
  rank_in_category text,
  rank_award       integer,
  event_name       text,
  event_date       text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.id, g.source, g.seq, g.rank, g.power_level, g.rating,
         g.year_promoted, g.diamond, g.category, g.rank_in_category,
         g.rank_award, g.event_name, g.event_date
    from public.go_player_database g
   where public.normalize_thai_name(coalesce(p_first_name_th, '')) <> ''
     and public.normalize_thai_name(coalesce(p_last_name_th,  '')) <> ''
     and g.first_name_th_normalized = public.normalize_thai_name(p_first_name_th)
     and g.last_name_th_normalized  = public.normalize_thai_name(p_last_name_th)
   -- dan → kyu → award; within a source strongest first, then newest-ish.
   -- event_date sorts exactly for kyu (ISO-ish strings) and only approximately
   -- for award (free text like "Aug 6, 2023") — acceptable for a display list.
   order by case g.source when 'dan' then 1 when 'kyu' then 2 else 3 end,
            g.power_level desc,
            g.event_date desc nulls last,
            g.id
   limit 100;
$$;

revoke execute on function public.person_rank_history(text, text) from public, anon;
grant  execute on function public.person_rank_history(text, text) to authenticated;

-- ============================================================================
-- 2. admin_search_person_history — partial-name search with history + in-system
-- ============================================================================

create or replace function public.admin_search_person_history(
  p_admin_secret text,
  p_query        text,
  p_limit        integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_raw   text    := btrim(coalesce(p_query, ''));
  v_norm  text    := public.normalize_thai_name(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_out   jsonb;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if char_length(v_raw) < 2 then return '[]'::jsonb; end if;

  with matches as (
    select gp.*,
           -- rn carries the ranking into the outer jsonb_agg — an aggregate has
           -- no inherent order, so the CTE's ORDER BY alone would not survive.
           row_number() over (
             order by ((gp.first_name_th || ' ' || gp.last_name_th) = v_raw) desc,
                      (gp.first_name_th ilike v_raw || '%') desc,
                      gp.first_name_th, gp.last_name_th
           ) as rn
      from public.go_person gp
     where gp.first_name_th ilike '%' || v_raw || '%'
        or gp.last_name_th  ilike '%' || v_raw || '%'
        or (gp.first_name_th || ' ' || gp.last_name_th) ilike '%' || v_raw || '%'
        or (v_norm <> '' and (
               gp.first_name_th_normalized ilike '%' || v_norm || '%'
            or gp.last_name_th_normalized  ilike '%' || v_norm || '%'
            or (gp.first_name_th_normalized || ' ' || gp.last_name_th_normalized)
                 ilike '%' || v_norm || '%'))
     order by rn
     limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'personId',    m.id,
           'firstNameTh', m.first_name_th,
           'lastNameTh',  m.last_name_th,
           'powerLevel',  m.power_level,
           'isAmbiguous', m.is_ambiguous,
           'history', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', g.id, 'source', g.source, 'seq', g.seq, 'rank', g.rank,
                      'powerLevel', g.power_level, 'rating', g.rating,
                      'yearPromoted', g.year_promoted, 'diamond', g.diamond,
                      'category', g.category, 'rankInCategory', g.rank_in_category,
                      'rankAward', g.rank_award, 'eventName', g.event_name,
                      'eventDate', g.event_date)
                    order by case g.source when 'dan' then 1 when 'kyu' then 2 else 3 end,
                             g.power_level desc, g.event_date desc nulls last, g.id
                    ), '[]'::jsonb)
               -- raw_data is NEVER selected: award rows carry phone numbers.
               from public.go_player_database g
              where g.first_name_th_normalized = m.first_name_th_normalized
                and g.last_name_th_normalized  = m.last_name_th_normalized
           ),
           'profiles', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', p.id, 'firstNameTh', p.first_name_th, 'lastNameTh', p.last_name_th,
                      'powerLevel', p.power_level, 'rankSelfDeclared', p.rank_self_declared,
                      'phone', p.mobile_phone)
                    order by p.created_at), '[]'::jsonb)
               from public.profile p
              where p.person_id = m.id
           ),
           'managedPlayers', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', mp.id, 'firstNameTh', mp.first_name_th, 'lastNameTh', mp.last_name_th,
                      'powerLevel', mp.power_level, 'rankSelfDeclared', mp.rank_self_declared,
                      'ownerLabel', nullif(btrim(coalesce(o.first_name_th,'') || ' ' || coalesce(o.last_name_th,'')), ''))
                    order by mp.created_at), '[]'::jsonb)
               from public.managed_player mp
               left join public.profile o on o.id = mp.owner_id
              where mp.person_id = m.id
                and mp.archived_at is null
           ),
           'seats', (
             -- Matched by the seat's own name SNAPSHOT (normalized) — seats have
             -- no person_id by design, and this survives renames + null
             -- source_kind. draft/expired batches are transient noise.
             select coalesce(jsonb_agg(jsonb_build_object(
                      'tournamentName', t.name_th,
                      'categoryCode',   c.code,
                      'categoryName',   c.name,
                      'status',         b.status,
                      'withdrawn',      s.withdrawn_at is not null,
                      'batchReference', b.reference_code,
                      'createdAt',      s.created_at)
                    order by s.created_at desc), '[]'::jsonb)
               from public.registration_seat s
               join public.registration_batch b on b.id = s.batch_id
               join public.category c on c.id = s.category_id
               join public.tournament t on t.id = c.tournament_id
              where b.status not in ('draft', 'expired')
                and public.normalize_thai_name(s.first_name_th) = m.first_name_th_normalized
                and public.normalize_thai_name(s.last_name_th)  = m.last_name_th_normalized
           )
         ) order by m.rn), '[]'::jsonb)
    into v_out
    from matches m;

  return v_out;
end; $$;

revoke execute on function public.admin_search_person_history(text, text, integer) from public, anon;
grant  execute on function public.admin_search_person_history(text, text, integer) to authenticated;
