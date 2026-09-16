-- ── Storage, grants and the last anon-reachable oracles ──────────────────────
-- Audit 2026-09-15. Everything here was reachable with nothing but the
-- publishable key, which ships inside the JS bundle.
--
--   • storage.objects policy `tesuji_insert` (authored in the dashboard, in no
--     repo file) allowed roles {anon, authenticated} to INSERT into the PUBLIC
--     'tesuji' bucket with the single condition `bucket_id = 'tesuji'`. No
--     owner, no path, no admin check. A stranger could park arbitrary 10 MB
--     PDFs on the organiser's public storage URL, and ~100 of them exhaust the
--     free tier — after which slip uploads fail and registration stops. There
--     is no DELETE policy either, which is why every replaced banner is still
--     in the bucket. The only legitimate writer is an admin going through
--     upsertTournament (banners/, venue-maps/), so: admin-only INSERT, plus
--     the admin DELETE that was missing.
--
--   • `tesuji_slips_insert` checks only the bucket id, so any self-signed-up
--     account may write any object name, any number of times, and no policy
--     can ever remove them. Slips move to a per-uploader prefix
--     `<auth.uid()>/<random>.<ext>`; an account can now only write under its
--     own folder, and an admin can purge.
--
--   • `live_check_token(text)` / `_is_live_writer(text)` were EXECUTE-able by
--     anon: an unrated yes/no oracle on "is this a valid write token". The
--     judge console stopped using it when 20260908_0001 moved to
--     live_token_tournament, and lib/live/client.ts checkToken() has no
--     callers. 20260908_0001 re-created _is_live_writer without the
--     `revoke ... from public, anon` its siblings carry, which re-opened it.
--
--   • 20260822_0002 hid draft tournaments from the table reads, but
--     list_participants (SECURITY DEFINER, granted to anon) and the four
--     live_* SELECT policies (`using (true)`) never learned about it. A
--     tournament set back to draft still serves its registrants' full Thai
--     names by id, and a draft's board — pairings, player names — renders at
--     /live/<uuid>. Latent today (no draft tournament owns a board) and real
--     the first time pairings are imported before publishing.
--
--   • find_or_create_institute accepts a name of any length and the row is
--     immediately visible in every registrant's dropdown (gi_read_all).
--     ensure_go_person already caps at 100 chars; this one never did.
--
--   • apply_promo answers PROMO_INVALID / _INACTIVE / _NOT_STARTED /
--     _EXPIRED / _EXHAUSTED — five distinct answers, ~66 ms each, unlimited
--     attempts — so a batch owner can brute-force short codes against their
--     own pending batch, and a guessed 'free' code confirms a seat with no
--     slip and no admin review. One answer now, and an attempt budget.
--
--   • Supabase's default privileges hand anon/authenticated ALL on every
--     table, TRUNCATE included. TRUNCATE is not subject to RLS. Nothing
--     reaches it through PostgREST today, so this is defense in depth rather
--     than a live hole — but it is free, and it stops the 13 policy-less
--     tables from depending on RLS alone.
--
--   • Two Supabase linter warnings: normalize_thai_name has a role-mutable
--     search_path, and account_roles_self_read calls bare auth.uid() once per
--     row instead of the initplan form.
--
-- DEPLOY ORDER — the opposite of 20260908_0001. §2 rejects a slip written to
-- the bucket root, which is what today's uploadSlip does. Ship the frontend
-- that writes `<uid>/<file>` FIRST, confirm one real upload, then apply this.
-- Applied the other way round, every slip upload fails for the window between
-- the two. Reading the 124 existing root-level slips is unaffected: they are
-- read by the service role (verify-slip) and by the separate, unchanged admin
-- SELECT policy, and nothing here moves or renames an object.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Public 'tesuji' bucket (banners, venue maps, rules PDFs): admin writes only
-- ─────────────────────────────────────────────────────────────────────────────
-- The bucket stays PUBLIC: banners and venue maps are served from its public
-- URL and there is deliberately no SELECT policy — public reads bypass RLS.
drop policy if exists tesuji_insert on storage.objects;

drop policy if exists tesuji_admin_insert on storage.objects;
create policy tesuji_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tesuji' and public.is_admin_me());

-- New: without this a replaced banner leaks forever, because no role could
-- ever delete an object in this bucket.
drop policy if exists tesuji_admin_delete on storage.objects;
create policy tesuji_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tesuji' and public.is_admin_me());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Private 'tesuji-slips' bucket: one folder per uploader
-- ─────────────────────────────────────────────────────────────────────────────
-- storage.foldername('abc.jpg') is an empty array, so [1] is NULL and the
-- check is NULL — a root-level write is refused. That is the point (it is how
-- the old unlimited-spam path is closed), and it is also why the frontend has
-- to ship first. Existing root-level objects keep working: this is a WITH
-- CHECK on new rows only.
drop policy if exists tesuji_slips_insert on storage.objects;
create policy tesuji_slips_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tesuji-slips'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- New: slips could be uploaded but never removed (purge-slips is a 410 stub),
-- so an admin now has a path to clear a tournament's slips after the event.
drop policy if exists tesuji_slips_admin_delete on storage.objects;
create policy tesuji_slips_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tesuji-slips' and public.is_admin_me());

-- The `<uid>/` prefix above splits the slip path into two legal shapes, and the
-- five checks that validate one (submit_registration, request_division_change,
-- admin_resolve_division_change, admin_set_withdrawal_status and verify-slip's
-- isPrivatePath) must accept both. The shared validator that does it,
-- public._is_slip_path, is defined in 20260915_0003 rather than here: this file
-- is applied LAST in the release (see its header), and 0003 both needs the
-- function and is applied first, so defining it here would leave every slip
-- submission failing on a missing function for the whole window between them.
-- Nothing in THIS file calls it.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Live/judge: close the token-validity oracle
-- ─────────────────────────────────────────────────────────────────────────────
-- live_check_token has no caller left in the app; live_token_tournament is the
-- one the API layer and /judge/[key] use, and it returns the same information
-- to a caller who already holds the secret.
drop function if exists public.live_check_token(text);

-- _is_live_writer is now unreferenced. Revoked rather than dropped so this
-- migration stays additive; drop it in a later contract pass.
revoke all on function public._is_live_writer(text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Draft tournaments: hide their registrants and their board
-- ─────────────────────────────────────────────────────────────────────────────
-- Same rule as tournament_public_read (20260822_0002): not a draft, or you are
-- an admin. SECURITY DEFINER helpers rather than an inline EXISTS, because a
-- subquery inside a policy is itself filtered by the referenced table's RLS —
-- live_match's policy reading live_division would re-enter live_division_read
-- on every row. They are granted to anon because a policy expression is
-- evaluated as the querying role; they reveal nothing the policy does not.
create or replace function public.live_tournament_visible(p_tournament_id uuid)
returns boolean
language sql security definer stable set search_path to 'public'
as $$
  select exists (
    select 1 from tournament t
     where t.id = p_tournament_id
       and (t.status <> 'draft' or is_admin_me()));
$$;
revoke all on function public.live_tournament_visible(uuid) from public;
grant execute on function public.live_tournament_visible(uuid) to anon, authenticated;

create or replace function public.live_division_visible(p_division_id text)
returns boolean
language sql security definer stable set search_path to 'public'
as $$
  select exists (
    select 1 from live_division d
      join tournament t on t.id = d.tournament_id
     where d.id = p_division_id
       and (t.status <> 'draft' or is_admin_me()));
$$;
revoke all on function public.live_division_visible(text) from public;
grant execute on function public.live_division_visible(text) to anon, authenticated;

drop policy if exists live_division_read on public.live_division;
create policy live_division_read on public.live_division
  for select to anon, authenticated
  using (public.live_tournament_visible(tournament_id));

drop policy if exists live_config_read on public.live_config;
create policy live_config_read on public.live_config
  for select to anon, authenticated
  using (public.live_tournament_visible(tournament_id));

drop policy if exists live_match_read on public.live_match;
create policy live_match_read on public.live_match
  for select to anon, authenticated
  using (public.live_division_visible(division_id));

drop policy if exists live_standing_read on public.live_standing;
create policy live_standing_read on public.live_standing
  for select to anon, authenticated
  using (public.live_division_visible(division_id));

-- The write path is unaffected: every live_* write RPC is SECURITY DEFINER and
-- gated by _can_write_division, so the .jar and the judge console still post
-- into a draft tournament. Only anon READS of a draft's board are now empty —
-- /live/<tid> and the judge console render nothing until the event is
-- published, which is the same rule the tournament page already follows.

-- list_participants is the RPC twin of that read: SECURITY DEFINER, granted to
-- anon, and until now it answered for any tournament id whatsoever.
create or replace function public.list_participants(p_tournament_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'fullNameTh',
      (case when s.title_prefix = 'อื่นๆ' then coalesce(s.title_custom, '') else s.title_prefix::text end)
      || s.first_name_th
      || (case when s.has_middle_name and s.middle_name_th is not null then ' ' || s.middle_name_th else '' end)
      || ' ' || s.last_name_th,
    'categoryCode', c.code, 'categoryName', c.name, 'skillLevel', c.skill_level,
    'status', b.status)
    order by c.code, (b.status = 'confirmed') desc, s.first_name_th), '[]'::jsonb)
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  join category c on c.id = s.category_id
  where b.tournament_id = p_tournament_id
    and b.status in ('confirmed', 'pending_review')
    and s.withdrawn_at is null
    and exists (select 1 from tournament t
                 where t.id = p_tournament_id
                   and (t.status <> 'draft' or is_admin_me()));
$$;
revoke all on function public.list_participants(uuid) from public;
grant execute on function public.list_participants(uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Reference rows: bound what one account can create
-- ─────────────────────────────────────────────────────────────────────────────
-- Body is the bootstrap/0001 version with the length cap ensure_go_person
-- already has (same 100 chars, same NAME_TOO_LONG). The anon grant went with
-- it: the very first line refuses an anonymous caller anyway.
create or replace function public.find_or_create_institute(p_name text)
returns go_institute
language plpgsql security definer set search_path to 'public'
as $$
declare v_norm text; v_row public.go_institute;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_norm := lower(public.normalize_thai_name(p_name));
  if v_norm = '' then raise exception 'EMPTY_NAME'; end if;
  -- An institute is world-readable the instant it exists (gi_read_all) and
  -- appears in every registrant's dropdown, so it is not a free-text field.
  if char_length(btrim(p_name)) > 100 then raise exception 'NAME_TOO_LONG'; end if;
  select * into v_row from public.go_institute where name_normalized = v_norm;
  if v_row.id is not null then
    if not v_row.active then
      update public.go_institute set active = true, updated_at = now()
        where id = v_row.id returning * into v_row;
    end if;
    return v_row;
  end if;
  insert into public.go_institute (name_th, name_normalized)
    values (btrim(p_name), v_norm) returning * into v_row;
  return v_row;
end; $$;
revoke all on function public.find_or_create_institute(text) from public, anon;
grant execute on function public.find_or_create_institute(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) apply_promo: one error code, and an attempt budget
-- ─────────────────────────────────────────────────────────────────────────────
-- RPC-only, like tournament_live_token: one row per account, rewritten in
-- place, never read by the client.
create table if not exists public.promo_attempt (
  account_id   uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  failed_count integer not null default 0
);
alter table public.promo_attempt enable row level security;
revoke all on table public.promo_attempt from public, anon, authenticated;

-- Body is the prod version verbatim except for the two changes above. Note
-- what is deliberately NOT changed: a 100%/free code still confirms the batch
-- without admin review (submit_registration, 20260701_0007) and there is still
-- no per-person cap (removed on purpose in the same migration).
create or replace function public.apply_promo(p_batch_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_uid      uuid := auth.uid();
  v_batch    registration_batch;
  v_gross    numeric(10, 2);
  v_promo    promo_code;
  v_discount numeric(10, 2) := 0;
  v_total    numeric(10, 2);
  v_fails    integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED'); end if;

  select * into v_batch from registration_batch where id = p_batch_id;
  if v_batch.id is null then return jsonb_build_object('ok', false, 'error', 'BATCH_NOT_FOUND'); end if;
  if v_batch.account_id is distinct from v_uid then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  if v_batch.status <> 'pending_payment' then return jsonb_build_object('ok', false, 'error', 'NOT_PENDING_PAYMENT'); end if;

  select coalesce(sum(fee_thb_snapshot), 0) into v_gross
    from registration_seat where batch_id = p_batch_id;

  if p_code is null or btrim(p_code) = '' then
    update registration_batch
      set promo_code = null, promo_kind = null, promo_value = null,
          discount_thb = 0, total_amount_thb = v_gross, updated_at = now()
    where id = p_batch_id;
    return jsonb_build_object('ok', true, 'totalAmountThb', v_gross, 'discountThb', 0,
                              'isFree', (v_gross <= 0), 'kind', null, 'code', null);
  end if;

  -- Ten wrong codes per account per 15 minutes — the hold's own lifetime, so
  -- somebody fixing a typo never reaches it while a guesser stops after ten.
  -- A throttled caller gets the same PROMO_INVALID as a wrong code: telling
  -- them they are being throttled is itself a signal worth withholding.
  select failed_count into v_fails from promo_attempt
   where account_id = v_uid and window_start > now() - interval '15 minutes';
  if coalesce(v_fails, 0) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'PROMO_INVALID');
  end if;

  select * into v_promo from promo_code
    where tournament_id = v_batch.tournament_id and upper(code) = upper(btrim(p_code));

  -- ONE answer for every "this code does not work" case. The old five told a
  -- guesser which codes exist, which are merely expired, and which are used
  -- up — i.e. exactly how to aim the next guess.
  if v_promo.id is null
     or not v_promo.active
     or (v_promo.valid_from  is not null and now() < v_promo.valid_from)
     or (v_promo.valid_until is not null and now() > v_promo.valid_until)
     or (v_promo.max_uses    is not null and v_promo.used_count >= v_promo.max_uses) then
    insert into promo_attempt (account_id, window_start, failed_count)
    values (v_uid, now(), 1)
    on conflict (account_id) do update
      set failed_count = case when promo_attempt.window_start > now() - interval '15 minutes'
                              then promo_attempt.failed_count + 1 else 1 end,
          window_start = case when promo_attempt.window_start > now() - interval '15 minutes'
                              then promo_attempt.window_start else now() end;
    return jsonb_build_object('ok', false, 'error', 'PROMO_INVALID');
  end if;

  delete from promo_attempt where account_id = v_uid;

  v_discount := _promo_discount(v_promo.kind, v_promo.value, v_gross);
  v_total := greatest(0, v_gross - v_discount);

  update registration_batch
    set promo_code = v_promo.code, promo_kind = v_promo.kind, promo_value = v_promo.value,
        discount_thb = v_discount, total_amount_thb = v_total, updated_at = now()
  where id = p_batch_id;

  return jsonb_build_object('ok', true, 'totalAmountThb', v_total, 'discountThb', v_discount,
                            'isFree', (v_total <= 0), 'kind', v_promo.kind, 'code', v_promo.code);
end;
$$;
revoke all on function public.apply_promo(uuid, text) from public, anon;
grant execute on function public.apply_promo(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Table grants: drop the verbs RLS does not cover
-- ─────────────────────────────────────────────────────────────────────────────
-- TRUNCATE ignores RLS entirely; REFERENCES and TRIGGER only matter to a role
-- with DDL rights. None of the three is reachable through PostgREST, Storage
-- or Realtime, so nothing changes today — but a future role-scoped SQL path
-- (a pg_net or edge helper running as `authenticated`) would inherit them.
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;

-- No table in this schema has an anon write policy (verified against
-- pg_policies: the only INSERT/UPDATE/DELETE policies are profile_* and mp_*,
-- both `to authenticated`). Every anon write already dies on RLS; now it dies
-- one step earlier.
revoke insert, update, delete on all tables in schema public from anon;

-- ALL of the above is re-granted to the next table a migration creates unless
-- the default is fixed too. This only covers objects created by `postgres`;
-- the parallel supabase_admin default ACL belongs to a role no migration can
-- alter, so a table created through the dashboard still arrives wide open —
-- keep writing the explicit `revoke all on table ...` that 20260908_0001 does.
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public
  revoke insert, update, delete on tables from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) The two Supabase linter warnings
-- ─────────────────────────────────────────────────────────────────────────────
-- normalize_thai_name is the only function in the schema with no search_path
-- of its own, so it resolves names against whatever the caller set. It is
-- pure string work on builtins, but it is called from inside SECURITY DEFINER
-- functions, which is precisely where a caller-controlled search_path pays.
-- Body unchanged and still IMMUTABLE. A SET clause blocks inlining, so this
-- was only safe to add after checking that nothing depends on the function
-- being folded into a plan: no index expression and no generated column uses
-- it (pg_index / pg_attrdef, both empty), and its eighteen callers normalize
-- their own arguments into a variable rather than a scanned column.
create or replace function public.normalize_thai_name(input text)
returns text
language sql immutable set search_path to 'public'
as $$
  select replace(
    translate(
      regexp_replace(trim(coalesce(input, '')), '\s+', ' ', 'g'),
      'ศษณญภฎฏฑใ',
      'สสนยพดตทไ'
    ),
    '์',
    ''
  );
$$;
revoke all on function public.normalize_thai_name(text) from public;
grant execute on function public.normalize_thai_name(text) to anon, authenticated;

-- Bare auth.uid() in a policy is re-evaluated for every row scanned;
-- (select auth.uid()) is hoisted to an initplan and evaluated once. Same rule
-- tournament_judge_self_read already follows (20260908_0001 §4).
drop policy if exists account_roles_self_read on public.account_roles;
create policy account_roles_self_read on public.account_roles
  for select to authenticated
  using (account_id = (select auth.uid()));
