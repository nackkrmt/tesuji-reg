-- Make admin-sync auto-linking as strict as the rank picker: EXACT names only.
--
-- _propagate_person_ranks Pass A linked any unlinked profile/player whose
-- NORMALIZED Thai name matched a go_person row. That mirrors the old picker
-- behavior, but the picker now auto-applies only EXACT (character-for-character)
-- matches — a normalized-only match can fold two different people together and
-- must be confirmed by a human. So auto-link is the one remaining place that
-- could silently bind a fold-collision. Tighten it: a profile/player auto-links
-- only when go_player_database actually holds a row spelled EXACTLY like its name
-- (which is exactly the picker's "exact" tier). Anyone spelled differently keeps
-- linking through the picker (where they confirm), and already-linked rows are
-- untouched. Pass B (push resolved power through the link) is unchanged.

create or replace function public._propagate_person_ranks()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link_p bigint; v_link_m bigint; v_upd_p bigint; v_upd_m bigint;
begin
  -- Pass A: auto-link (fills NULL links only). EXACT spelling required — the
  -- profile's name must appear verbatim (btrimmed) as a go_player_database row
  -- backing this go_person. Normalized-only look-alikes are NOT auto-linked.
  update profile p
     set person_id = gp.id, updated_at = now()
    from go_person gp
   where p.person_id is null
     and btrim(coalesce(p.first_name_th, '')) <> ''
     and btrim(coalesce(p.last_name_th,  '')) <> ''
     and public.normalize_thai_name(p.first_name_th) = gp.first_name_th_normalized
     and public.normalize_thai_name(p.last_name_th)  = gp.last_name_th_normalized
     and exists (
       select 1 from go_player_database g
        where g.first_name_th_normalized = gp.first_name_th_normalized
          and g.last_name_th_normalized  = gp.last_name_th_normalized
          and btrim(g.first_name_th) = btrim(p.first_name_th)
          and btrim(g.last_name_th) = btrim(p.last_name_th));
  get diagnostics v_link_p = row_count;

  update managed_player p
     set person_id = gp.id, updated_at = now()
    from go_person gp
   where p.person_id is null
     and p.archived_at is null
     and btrim(coalesce(p.first_name_th, '')) <> ''
     and btrim(coalesce(p.last_name_th,  '')) <> ''
     and public.normalize_thai_name(p.first_name_th) = gp.first_name_th_normalized
     and public.normalize_thai_name(p.last_name_th)  = gp.last_name_th_normalized
     and exists (
       select 1 from go_player_database g
        where g.first_name_th_normalized = gp.first_name_th_normalized
          and g.last_name_th_normalized  = gp.last_name_th_normalized
          and btrim(g.first_name_th) = btrim(p.first_name_th)
          and btrim(g.last_name_th) = btrim(p.last_name_th));
  get diagnostics v_link_m = row_count;

  -- Pass B: push the resolved power through the link (unchanged). Ambiguous /
  -- missing / power-null persons are skipped without touching the link.
  update profile p
     set power_level = gp.power_level, updated_at = now()
    from go_person gp
   where p.person_id = gp.id
     and gp.is_ambiguous = false
     and gp.missing_since is null
     and gp.power_level is not null
     and p.power_level is distinct from gp.power_level;
  get diagnostics v_upd_p = row_count;

  update managed_player p
     set power_level = gp.power_level, updated_at = now()
    from go_person gp
   where p.person_id = gp.id
     and p.archived_at is null
     and gp.is_ambiguous = false
     and gp.missing_since is null
     and gp.power_level is not null
     and p.power_level is distinct from gp.power_level;
  get diagnostics v_upd_m = row_count;

  return jsonb_build_object(
    'linkedProfiles',  v_link_p, 'linkedPlayers',   v_link_m,
    'updatedProfiles', v_upd_p,  'updatedPlayers',  v_upd_m);
end; $$;

revoke execute on function public._propagate_person_ranks() from public, anon, authenticated;
