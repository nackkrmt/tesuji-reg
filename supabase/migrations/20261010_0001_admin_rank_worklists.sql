-- ── The two rank worklists on /admin/database: grouped by tournament, and the
-- ── self-declared one becomes editable ──────────────────────────────────────
-- Two organiser complaints about the worklists 20260712_0001 §7 and
-- 20260714_0001 §3 feed:
--
--   1. "ที่นั่งที่ระดับปัจจุบันขัดกับเกณฑ์รุ่น" is one flat list across every
--      tournament ever run. On 2026-10-10 all 34 rows on prod belonged to a
--      tournament that closed in August, so the list the organiser opens to
--      prepare the NEXT event is a page of last event's leftovers. The page now
--      groups by tournament and lets each group be hidden — which needs the
--      tournament's id (two events can share a name; a hidden-group key built
--      from the name would hide both) and its date (newest event first).
--      Adding columns changes the RETURNS TABLE type, which CREATE OR REPLACE
--      refuses, so the function is dropped and recreated in this transaction.
--      Same argument list, so the deployed client's call keeps resolving; it
--      ignores the two extra keys.
--
--   2. "ระดับฝีมือที่ผู้ใช้กรอกเอง" could be read but not acted on. An organiser
--      who phoned the player and learned the real rank had no way to record
--      it: set_my_rank is owner-only and admin_update_seat edits a seat's
--      snapshot, not the person. admin_set_rank is that missing writer.
--
-- admin_set_rank keeps the two rules every other rank writer obeys:
--   - rank_self_declared is NOT set here. _derive_rank_self_declared
--     (20260915_0002 §2) recomputes it on the update, so an admin-entered rank
--     that is not the registry's stays on the worklist — it is still not
--     registry-backed, it is just the organiser's number now.
--   - The registry wins. When the row is linked to a clean go_person with an
--     official rank, _propagate_person_ranks Pass B pushes that rank back on
--     the next import or sync, so writing anything else would be a change that
--     silently reverts days later. Refused as OFFICIAL_RANK_EXISTS:<power>
--     instead; setting it TO the official rank is allowed (it is what the next
--     sync would do anyway). 2 of the 27 flagged rows on prod are in that state.
-- Seats are not touched: registration_seat.power_level is the registration-
-- time snapshot by design (20260712_0001 §7), and a seat the new rank pushes
-- out of its band shows up on worklist 1, which is what it is for.
--
-- Deploy: SQL first. Purely additive for the deployed build (new function, two
-- new result columns); the new build calls admin_set_rank and reads
-- tournament_id, and falls back to one group per tournament name without it.

-- ============================================================================
-- 1. admin_list_rank_conflicts — + tournament_id, competition_date; newest
--    tournament first. Body otherwise verbatim from 20260712_0001 §7.
-- ============================================================================

drop function if exists public.admin_list_rank_conflicts(text);

create function public.admin_list_rank_conflicts(p_admin_secret text)
returns table(
  seat_id uuid,
  batch_reference text,
  tournament_id uuid,
  tournament_name text,
  competition_date text,
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
    select s.id, b.reference_code, t.id, t.name_th, t.competition_date,
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
     order by t.competition_date desc nulls last, t.name_th, t.id,
              c.sort_order, s.first_name_th;
end; $$;

revoke all on function public.admin_list_rank_conflicts(text) from public, anon, authenticated;
grant  execute on function public.admin_list_rank_conflicts(text) to authenticated;

-- ============================================================================
-- 2. admin_set_rank — the organiser's rank writer for one profile / managed
--    player. p_kind uses the worklist's own vocabulary
--    (admin_list_self_declared_ranks.kind), not set_my_rank's 'self'/'managed'.
-- ============================================================================

create or replace function public.admin_set_rank(
  p_admin_secret text,
  p_kind text,
  p_id uuid,
  p_power_level int
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_person uuid; v_official int; v_power int; v_flag boolean;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_kind not in ('profile', 'managed_player') then raise exception 'INVALID_SOURCE'; end if;
  -- 0..22 = 15 kyu .. 8 dan, the whole ladder lib/rank.ts offers (MIN/MAX_POWER).
  if p_power_level is null or p_power_level not between 0 and 22 then
    raise exception 'INVALID_FIELD';
  end if;

  -- Lock the row first so the official-rank check and the write see the same
  -- link (a concurrent rename re-points person_id through the autolink trigger).
  if p_kind = 'profile' then
    select person_id into v_person from profile where id = p_id for update;
    if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  else
    select person_id into v_person from managed_player
     where id = p_id and archived_at is null for update;
    if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  end if;

  -- Same predicate as _derive_rank_self_declared and Pass B: only a single,
  -- currently-listed holder of the name has a rank the sync would push back.
  select gp.power_level into v_official
    from go_person gp
   where gp.id = v_person
     and gp.is_ambiguous = false
     and gp.missing_since is null
     and gp.power_level is not null;
  if v_official is not null and v_official <> p_power_level then
    raise exception 'OFFICIAL_RANK_EXISTS:%', v_official;
  end if;

  if p_kind = 'profile' then
    update profile set power_level = p_power_level, updated_at = now()
     where id = p_id
    returning power_level, rank_self_declared into v_power, v_flag;
  else
    update managed_player set power_level = p_power_level, updated_at = now()
     where id = p_id
    returning power_level, rank_self_declared into v_power, v_flag;
  end if;

  return jsonb_build_object(
    'kind', p_kind, 'id', p_id,
    'power_level', v_power, 'rank_self_declared', v_flag);
end; $$;

revoke all on function public.admin_set_rank(text, text, uuid, int) from public, anon, authenticated;
grant  execute on function public.admin_set_rank(text, text, uuid, int) to authenticated;
