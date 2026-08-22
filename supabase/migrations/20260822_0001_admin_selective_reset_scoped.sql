-- ── admin_selective_reset: tournament-scoped overload ────────────────────────
-- Multi-tournament: the Danger-Zone reset must be able to wipe ONE
-- tournament's registrations/promo codes/categories/row without touching the
-- others. This adds a 4-arg overload with an explicit p_tournament_id:
--
--   • p_tournament_id = null  → identical behavior to the deployed 3-arg
--     version (global wipe).
--   • p_tournament_id set     → 'registrations' / 'promo_codes' /
--     'categories' / 'tournament' delete only rows belonging to that
--     tournament. The inherently global groups ('accounts', 'institutes',
--     'player_db', 'live') keep their global meaning regardless — the UI
--     labels them as global.
--
-- The 3-arg overload STAYS until the updated admin-reset edge function is
-- deployed everywhere (expand/contract); drop it in a later contract
-- migration. No default on p_tournament_id — a default would make 3-arg
-- calls ambiguous between the two overloads.
-- Trust model mirrors the original: SECURITY DEFINER, EXECUTE for
-- service_role only (called by the admin-reset edge function after it has
-- verified the caller's admin JWT).

create or replace function public.admin_selective_reset(
  p_keep_uid uuid,
  p_confirm text,
  p_targets text[],
  p_tournament_id uuid
)
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
  if p_tournament_id is not null
     and not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
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
    if p_tournament_id is null then
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
    else
      update registration_batch set hold_id = null
       where tournament_id = p_tournament_id and hold_id is not null;
      delete from seat_withdrawal  where tournament_id = p_tournament_id;
      delete from promo_redemption where batch_id in
        (select id from registration_batch where tournament_id = p_tournament_id);
      delete from seat_hold_line   where hold_id in
        (select id from seat_hold where tournament_id = p_tournament_id);
      delete from registration_seat where batch_id in
        (select id from registration_batch where tournament_id = p_tournament_id);
      get diagnostics n = row_count;
      delete from seat_hold          where tournament_id = p_tournament_id;
      delete from registration_batch where tournament_id = p_tournament_id;
      update category set seats_taken = 0, updated_at = now()
       where tournament_id = p_tournament_id and seats_taken <> 0;
      if not ('promo_codes' = any(p_targets)) then
        update promo_code set used_count = 0, updated_at = now()
         where tournament_id = p_tournament_id and used_count <> 0;
      end if;
    end if;
    v_counts := v_counts || jsonb_build_object('registrations', n);
  end if;

  -- 2) promo_codes
  if 'promo_codes' = any(p_targets) then
    if p_tournament_id is null then
      delete from promo_code where true;
    else
      delete from promo_code where tournament_id = p_tournament_id;
    end if;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('promo_codes', n);
  end if;

  -- 3) live (global — the live subsystem has no tournament scope yet)
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

  -- 4) player_db (global)
  if 'player_db' = any(p_targets) then
    delete from award_limit_exemption where true;
    delete from go_player_database where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('player_db', n);
  end if;

  -- 5) institutes (global)
  if 'institutes' = any(p_targets) then
    update profile set institute_id = null, updated_at = now() where institute_id is not null;
    update managed_player set institute_id = null, updated_at = now() where institute_id is not null;
    update registration_seat set institute_id = null where institute_id is not null;
    delete from institute_merge where true;
    delete from go_institute where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('institutes', n);
  end if;

  -- 6) accounts (global)
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
    if p_tournament_id is null then
      delete from category where true;
    else
      delete from category where tournament_id = p_tournament_id;
    end if;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('categories', n);
  end if;

  -- 8) tournament
  if 'tournament' = any(p_targets) then
    if p_tournament_id is null then
      delete from tournament where true;
    else
      delete from tournament where id = p_tournament_id;
    end if;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('tournament', n);
  end if;

  return v_counts;
end;
$function$;

revoke all on function public.admin_selective_reset(uuid, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_selective_reset(uuid, text, text[], uuid) to service_role;
