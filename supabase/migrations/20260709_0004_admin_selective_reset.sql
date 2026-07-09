-- admin_selective_reset — the checklist reset behind the admin Danger Zone
-- (/admin/reset). The admin ticks which data groups to wipe; each group maps to
-- one conditional block below. Replaces admin_factory_reset (dropped at the
-- bottom), whose all-or-nothing wipe is now just "tick everything".
--
-- Always kept: the db structure, app_config (gsheet URLs + live_token), and the
-- acting admin's OWN account + roles + profile + managed players (p_keep_uid),
-- so the admin who presses the button stays logged in.
--
-- Storage files (payment slips, banner/rules assets) are purged separately by
-- the `admin-reset` edge function (needs the service role + Storage API); this
-- function only clears database rows.
--
-- Trust model: SECURITY DEFINER, EXECUTE granted to `service_role` ONLY —
-- unreachable by anon / authenticated. The sole caller is the admin-reset edge
-- function, which authenticates the admin from their JWT and passes their own
-- uid as p_keep_uid. Confirm phrase + admin role + target deps are all
-- re-checked here (belt-and-suspenders).

create or replace function public.admin_selective_reset(
  p_keep_uid uuid,
  p_confirm  text,
  p_targets  text[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_known constant text[] := array[
    'registrations','promo_codes','accounts','institutes',
    'player_db','live','categories','tournament'];
  v_counts jsonb := '{}'::jsonb;
  n bigint;
begin
  -- ── guards ──────────────────────────────────────────────────────────────────
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
  -- dependency re-validation (the UI auto-ticks these; server re-checks).
  -- categories: its registration_seat/seat_hold_line refs CASCADE, but that
  -- would leave batches with no seats — require the registrations wipe instead.
  if 'categories' = any(p_targets) and not ('registrations' = any(p_targets)) then
    raise exception 'MISSING_DEPS';
  end if;
  -- tournament: category/promo_code/batch/hold all CASCADE from it; requiring
  -- the groups keeps the checklist honest (nothing unticked gets deleted).
  if 'tournament' = any(p_targets) and not (
       'registrations' = any(p_targets)
       and 'categories'  = any(p_targets)
       and 'promo_codes' = any(p_targets)) then
    raise exception 'MISSING_DEPS';
  end if;

  -- Block order matters: registrations before accounts (clears the NO ACTION
  -- account_id children), player_db demotes before its FK SET NULLs fire,
  -- categories/tournament last (deps guarantee their children are gone).

  -- 1) ใบสมัคร + สลิป ──────────────────────────────────────────────────────────
  if 'registrations' = any(p_targets) then
    update registration_batch set hold_id = null where hold_id is not null; -- batch<->hold cycle
    delete from seat_withdrawal   where true;
    delete from promo_redemption  where true;
    delete from seat_hold_line    where true;
    delete from registration_seat where true;
    get diagnostics n = row_count;
    delete from seat_hold          where true;
    delete from registration_batch where true;
    update category set seats_taken = 0, updated_at = now() where seats_taken <> 0;
    -- redemptions are gone, so surviving codes must not look exhausted
    if not ('promo_codes' = any(p_targets)) then
      update promo_code set used_count = 0, updated_at = now() where used_count <> 0;
    end if;
    v_counts := v_counts || jsonb_build_object('registrations', n);
  end if;

  -- 2) โปรโมโค้ด ───────────────────────────────────────────────────────────────
  if 'promo_codes' = any(p_targets) then
    delete from promo_code where true; -- promo_redemption cascades
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('promo_codes', n);
  end if;

  -- 3) ข้อมูลแข่งสด ────────────────────────────────────────────────────────────
  if 'live' = any(p_targets) then
    delete from live_match where true;
    get diagnostics n = row_count;
    delete from live_standing where true;
    delete from live_config   where true;
    update account_roles set default_division_id = null where default_division_id is not null;
    delete from live_division where true;
    -- stale manual backup; guarded so a fresh-from-migrations db doesn't error
    if to_regclass('public.live_match_bak_20260703') is not null then
      execute 'delete from live_match_bak_20260703 where true';
    end if;
    v_counts := v_counts || jsonb_build_object('live', n);
  end if;

  -- 4) ฐานข้อมูลนักกีฬา ────────────────────────────────────────────────────────
  if 'player_db' = any(p_targets) then
    -- demote auto-match verifications BEFORE the FK SET NULLs erase the evidence;
    -- admin-reviewed ones (rank_reviewed_by set) stay verified.
    update profile set rank_status = 'pending', updated_at = now()
     where rank_status = 'verified'
       and matched_go_player_id is not null and rank_reviewed_by is null;
    update managed_player set rank_status = 'pending', updated_at = now()
     where rank_status = 'verified'
       and matched_go_player_id is not null and rank_reviewed_by is null;
    delete from award_limit_exemption where true; -- meaningless without the award list
    delete from go_player_database where true;    -- matched refs SET NULL via FK
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('player_db', n);
  end if;

  -- 5) สถาบัน ──────────────────────────────────────────────────────────────────
  if 'institutes' = any(p_targets) then
    -- all three institute_id FKs are NO ACTION — null them first; the
    -- institute_name text snapshots survive by design.
    update profile set institute_id = null, updated_at = now() where institute_id is not null;
    update managed_player set institute_id = null, updated_at = now() where institute_id is not null;
    update registration_seat set institute_id = null where institute_id is not null;
    delete from institute_merge where true;
    delete from go_institute where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('institutes', n);
  end if;

  -- 6) บัญชีผู้ใช้ (ยกเว้น p_keep_uid) ─────────────────────────────────────────
  if 'accounts' = any(p_targets) then
    -- batch/withdrawal/redemption.account_id are NO ACTION — when registrations
    -- survive this wipe, detach them (seats keep their name snapshots).
    if not ('registrations' = any(p_targets)) then
      update registration_batch set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
      update seat_withdrawal set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
      update promo_redemption set account_id = null
       where account_id is not null and account_id <> p_keep_uid;
    end if;
    -- cascades profile, managed_player (other owners; the admin's own roster is
    -- kept — user decision), account_roles, auth.* children.
    -- registration_seat.source_player_id is a soft uuid (no FK) — dangling ok.
    delete from auth.users where id <> p_keep_uid;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('accounts', n);
  end if;

  -- 7) รุ่นทั้งหมด ─────────────────────────────────────────────────────────────
  if 'categories' = any(p_targets) then
    -- referencing rows already gone via the required registrations wipe; the
    -- tournament's schedule_text keeps orphaned category ids (same accepted
    -- behavior as admin_clear_categories).
    delete from category where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('categories', n);
  end if;

  -- 8) รายการแข่งทั้งหมด ───────────────────────────────────────────────────────
  if 'tournament' = any(p_targets) then
    delete from tournament where true;
    get diagnostics n = row_count;
    v_counts := v_counts || jsonb_build_object('tournament', n);
  end if;

  return v_counts;
end;
$$;

revoke all on function public.admin_selective_reset(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.admin_selective_reset(uuid, text, text[]) to service_role;

-- superseded by admin_selective_reset (tick everything = old factory reset)
drop function if exists public.admin_factory_reset(uuid, text);
