-- Remove the (never-wired) self-declared "pending rank" review system — part 1/2.
--
-- rank_status ('verified' | 'pending') gated nothing: reserve_seats never read it,
-- and the review RPCs (admin_list_pending_ranks / admin_set_rank_status) had no UI
-- caller. This drops those two dormant RPCs and rewrites the only two functions
-- that still referenced rank_status / rank_reviewed_* so they no longer touch
-- those columns. The columns themselves are dropped in 20260712_0005 AFTER the new
-- client (which stops sending rank_status in its profile upsert) is deployed.

-- ── drop the dormant review RPCs ─────────────────────────────────────────────
drop function if exists public.admin_list_pending_ranks(text);
drop function if exists public.admin_set_rank_status(text, text, uuid, text, integer, text, text);

-- ── _propagate_person_ranks — same as 20260712_0001 minus all rank_status /
--    rank_reviewed_* writes (a sync now only updates power_level) ──────────────
create or replace function public._propagate_person_ranks()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link_p bigint; v_link_m bigint; v_upd_p bigint; v_upd_m bigint;
begin
  -- Pass A: auto-link (fills NULL links only; never overwrites a chosen link).
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

  -- Pass B: push the resolved power through the link. Ambiguous / missing /
  -- power-null persons are skipped without touching the link.
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

-- ── admin_selective_reset — verbatim live definition minus the two rank_status
--    demotion UPDATEs in the 'player_db' branch (matched_go_player_id is still
--    nulled automatically by the go_player_database delete via ON DELETE SET NULL)
create or replace function public.admin_selective_reset(p_keep_uid uuid, p_confirm text, p_targets text[])
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_known constant text[] := array[
    'registrations','promo_codes','accounts','institutes',
    'player_db','live','categories','tournament'];
  v_counts jsonb := '{}'::jsonb;
  n bigint;
begin
  if btrim(coalesce(p_confirm, '')) <> 'ล้างข้อมูล' then
    raise exception 'CONFIRM_MISMATCH';
  end if;
  if p_targets is null or array_length(p_targets, 1) is null then
    raise exception 'NO_TARGETS';
  end if;
  if exists (select 1 from unnest(p_targets) t where t <> all (v_known)) then
    raise exception 'INVALID_TARGETS';
  end if;
  if p_keep_uid is null
     or not exists (select 1 from account_roles
                    where account_id = p_keep_uid and role = 'admin') then
    raise exception 'KEEP_UID_NOT_ADMIN';
  end if;
  if 'categories' = any(p_targets) and not ('registrations' = any(p_targets)) then
    raise exception 'MISSING_DEPS';
  end if;
  if 'tournament' = any(p_targets) and not (
       'registrations' = any(p_targets)
       and 'categories'  = any(p_targets)
       and 'promo_codes' = any(p_targets)) then
    raise exception 'MISSING_DEPS';
  end if;

  -- 1) registrations
  if 'registrations' = any(p_targets) then
    update registration_batch set hold_id = null where hold_id is not null;
    delete from seat_withdrawal   where true;
    delete from promo_redemption  where true;
    delete from seat_hold_line    where true;
    delete from registration_seat where true;
    get diagnostics n = row_count;
    delete from seat_hold          where true;
    delete from registration_batch where true;
    update category set seats_taken = 0, updated_at = now() where seats_taken <> 0;
    if not ('promo_codes' = any(p_targets)) then
      update promo_code set used_count = 0, updated_at = now() where used_count <> 0;
    end if;
    v_counts := v_counts || jsonb_build_object('registrations', n);
  end if;

  -- 2) promo_codes
  if 'promo_codes' = any(p_targets) then
    delete from promo_code where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('promo_codes', n);
  end if;

  -- 3) live
  if 'live' = any(p_targets) then
    delete from live_match where true;
    get diagnostics n = row_count;
    delete from live_standing where true;
    delete from live_config   where true;
    update account_roles set default_division_id = null where default_division_id is not null;
    delete from live_division where true;
    if to_regclass('public.live_match_bak_20260703') is not null then
      execute 'delete from live_match_bak_20260703 where true';
    end if;
    v_counts := v_counts || jsonb_build_object('live', n);
  end if;

  -- 4) player_db  (rank_status demotion removed — column is being retired)
  if 'player_db' = any(p_targets) then
    delete from award_limit_exemption where true;
    delete from go_player_database where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('player_db', n);
  end if;

  -- 5) institutes
  if 'institutes' = any(p_targets) then
    update profile set institute_id = null, updated_at = now() where institute_id is not null;
    update managed_player set institute_id = null, updated_at = now() where institute_id is not null;
    update registration_seat set institute_id = null where institute_id is not null;
    delete from institute_merge where true;
    delete from go_institute where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('institutes', n);
  end if;

  -- 6) accounts
  if 'accounts' = any(p_targets) then
    if not ('registrations' = any(p_targets)) then
      update registration_batch set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
      update seat_withdrawal set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
      update promo_redemption set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
    end if;
    delete from auth.users where id <> p_keep_uid;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('accounts', n);
  end if;

  -- 7) categories
  if 'categories' = any(p_targets) then
    delete from category where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('categories', n);
  end if;

  -- 8) tournament
  if 'tournament' = any(p_targets) then
    delete from tournament where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('tournament', n);
  end if;

  return v_counts;
end;
$function$;
