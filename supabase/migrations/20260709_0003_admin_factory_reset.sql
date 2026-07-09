-- admin_factory_reset — the "reset for a fresh start" wipe behind the admin
-- Danger Zone button. Clears ALL participant / account / reference data but
-- KEEPS the database structure, the tournament + its categories (รุ่น),
-- app_config, and the ONE acting-admin account (p_keep_uid) together with its
-- roles + profile, so the admin who presses the button stays logged in.
--
-- Slip *files* in the private storage bucket are purged separately by the
-- `admin-reset` edge function (that needs the service role + the Storage API);
-- this function only clears database rows.
--
-- Trust model: SECURITY DEFINER, with EXECUTE granted to `service_role` ONLY —
-- it is unreachable by anon / authenticated. The sole caller is the admin-reset
-- edge function, which authenticates the admin from their JWT and passes their
-- own uid as p_keep_uid. We still re-check the confirm phrase and that
-- p_keep_uid actually holds the admin role (belt-and-suspenders).

create or replace function public.admin_factory_reset(
  p_keep_uid uuid,
  p_confirm  text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_users      int;
  v_profiles   int;
  v_players    int;
  v_institutes int;
begin
  if btrim(coalesce(p_confirm, '')) <> 'ล้างข้อมูลทั้งหมด' then
    raise exception 'CONFIRM_MISMATCH';
  end if;
  if p_keep_uid is null
     or not exists (select 1 from account_roles
                    where account_id = p_keep_uid and role = 'admin') then
    raise exception 'KEEP_UID_NOT_ADMIN';
  end if;

  -- 1) registrations / payments / withdrawals / promos ────────────────────────
  update registration_batch set hold_id = null where true; -- break batch<->hold cycle
  delete from seat_withdrawal    where true;
  delete from promo_redemption   where true;
  delete from seat_hold_line     where true;
  delete from registration_seat  where true;
  delete from seat_hold          where true;
  delete from registration_batch where true;
  delete from promo_code         where true;

  -- 2) people — keep ONLY the acting admin's profile ──────────────────────────
  delete from managed_player        where true;
  delete from award_limit_exemption where true;
  select count(*) into v_profiles from profile where id <> p_keep_uid;
  delete from profile where id <> p_keep_uid;
  -- the kept profile may point at an institute / go_player row we are about to
  -- drop — null those refs first so the deletes below don't hit the FK.
  update profile
     set institute_id = null, matched_go_player_id = null, updated_at = now()
   where id = p_keep_uid;

  -- 3) live-competition subsystem + stale backup ──────────────────────────────
  delete from live_match    where true;
  delete from live_standing where true;
  delete from live_config   where true;
  -- kept admin's roles may default to a live_division we're dropping — null it.
  update account_roles set default_division_id = null where account_id = p_keep_uid;
  delete from account_roles where account_id <> p_keep_uid;
  delete from live_division where true;
  delete from live_match_bak_20260703 where true;

  -- 4) institutes ─────────────────────────────────────────────────────────────
  delete from institute_merge where true;
  select count(*) into v_institutes from go_institute;
  delete from go_institute where true;

  -- 5) master player database ─────────────────────────────────────────────────
  select count(*) into v_players from go_player_database;
  delete from go_player_database where true;

  -- 6) all auth accounts except the acting admin (auth.* children cascade) ─────
  select count(*) into v_users from auth.users where id <> p_keep_uid;
  delete from auth.users where id <> p_keep_uid;

  -- 7) reset kept categories' seat counters ───────────────────────────────────
  update category set seats_taken = 0, updated_at = now() where true;

  return jsonb_build_object(
    'users_deleted',      v_users,
    'profiles_deleted',   v_profiles,
    'players_deleted',    v_players,
    'institutes_deleted', v_institutes
  );
end;
$$;

revoke all on function public.admin_factory_reset(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_factory_reset(uuid, text) to service_role;
