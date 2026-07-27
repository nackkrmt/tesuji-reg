-- Live-competition write hardening. Four independent fixes, one migration:
--   §1 live_set_force      — abort before the de-dup when the target row is gone
--   §2 zero-row writes     — report MATCH_NOT_FOUND instead of silent success
--   §3 destructive RPCs    — admin-gate / un-grant what a live token can reach
--   §4 live_upsert_division— derive sort_order from the numeric division id
--
-- Every function is re-created with its EXACT current signature (same arg names,
-- same defaults, `returns void`), so no `drop function` is needed: grants, the
-- PostgREST schema cache and the checked-in lib/data/database.types.ts all stay
-- valid, and a frontend mid-deploy keeps working.
--
-- Deploy note: ship the frontend (routes + judge.js, which translate the new
-- error code) BEFORE this migration. New frontend + old DB = code that never
-- fires; old frontend + new DB = an untranslated error instead of a false
-- success. Both are safe; the reverse order for a NEW error code is not.

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  live_set_force: never blank other seats when the target row doesn't exist
-- ─────────────────────────────────────────────────────────────────────────────
-- The two de-dup UPDATEs below run unconditionally today. If the target table_no
-- no longer exists (round re-uploaded by the MacMahon .jar between the judge
-- opening the Force sheet and saving, a stale table number, or an '01' vs '1'
-- division-id change), the first UPDATE matches 0 rows but the de-dup still
-- blanks BOTH named players out of the seats they actually occupy — and the API
-- returned success. Raising aborts the transaction, so the de-dup can never
-- outlive a failed target write.
create or replace function public.live_set_force(
  p_secret text, p_division_id text, p_round text, p_table text,
  p_black_force text, p_white_force text, p_remark text default null
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_nb text := coalesce(nullif(trim(p_black_force), ''), '');
  v_nw text := coalesce(nullif(trim(p_white_force), ''), '');
  v_n  int;
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;

  update live_match
     set black_force = v_nb,
         white_force = v_nw,
         remark      = coalesce(p_remark, remark),
         updated_at  = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'MATCH_NOT_FOUND'; end if;

  update live_match
     set black_force = 'ไม่มีผู้เข้าแข่งขัน', updated_at = now()
   where division_id = p_division_id and round = p_round and table_no <> p_table
     and coalesce(nullif(black_force, ''), black) <> ''
     and coalesce(nullif(black_force, ''), black) in (v_nb, v_nw);

  update live_match
     set white_force = 'ไม่มีผู้เข้าแข่งขัน', updated_at = now()
   where division_id = p_division_id and round = p_round and table_no <> p_table
     and coalesce(nullif(white_force, ''), white) <> ''
     and coalesce(nullif(white_force, ''), white) in (v_nb, v_nw);
end; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Zero-row judge writes must fail loudly, not return success
-- ─────────────────────────────────────────────────────────────────────────────
-- A judge tapping a result while the .jar re-uploads that round (live_replace_round
-- = delete + re-insert) can land in the gap where the row does not exist. These
-- were bare UPDATEs / `if not found then return`, so the RPC returned void, the
-- route returned 200 {success:true}, and the judge saw a green checkmark for a
-- write that went nowhere. Now the caller can tell them to refresh and re-submit.
--
-- Deliberately NOT given this treatment: live_delete_round, live_replace_round,
-- live_set_standings, live_set_config, live_upsert_division — all legitimately
-- affect 0 rows (the .jar DELETEs a possibly-absent round before every export)
-- and must keep succeeding. live_set_checkin is left alone too: it has no caller.

create or replace function public.live_submit_result(
  p_secret text, p_division_id text, p_round text, p_table text,
  p_result text, p_remark text default null, p_by text default ''
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_n int;
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  update live_match
     set result = p_result,
         remark = coalesce(p_remark, remark),
         submitted_by = coalesce(nullif(p_by,''), submitted_by),
         updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'MATCH_NOT_FOUND'; end if;
end; $$;

-- live_toggle_checkin / live_toggle_absent: bodies carried over verbatim from
-- 20260717_0001_live_absent.sql (the `for update` + clears-the-opposite-bit
-- versions); the ONLY change is `return` → `raise` on the not-found branch.
create or replace function public.live_toggle_checkin(
  p_secret text,
  p_division_id text,
  p_round text,
  p_table text,
  p_side text,
  p_checked boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chk text;
  v_abs text;
begin
  if not _is_live_writer(p_secret) then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_side not in ('B', 'W') then
    raise exception 'INVALID_SIDE';
  end if;

  select check_in, absent into v_chk, v_abs
    from live_match
   where division_id = p_division_id and round = p_round and table_no = p_table
     for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;
  v_chk := coalesce(v_chk, '');
  v_abs := coalesce(v_abs, '');

  if p_side = 'B' then
    v_chk := case
      when p_checked then (case when v_chk in ('W', 'BOTH') then 'BOTH' else 'B' end)
      else (case when v_chk = 'BOTH' then 'W' when v_chk = 'B' then '' else v_chk end)
    end;
    if p_checked then
      v_abs := case when v_abs = 'BOTH' then 'W' when v_abs = 'B' then '' else v_abs end;
    end if;
  else
    v_chk := case
      when p_checked then (case when v_chk in ('B', 'BOTH') then 'BOTH' else 'W' end)
      else (case when v_chk = 'BOTH' then 'B' when v_chk = 'W' then '' else v_chk end)
    end;
    if p_checked then
      v_abs := case when v_abs = 'BOTH' then 'B' when v_abs = 'W' then '' else v_abs end;
    end if;
  end if;

  update live_match
     set check_in = v_chk, absent = v_abs, updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end;
$$;

create or replace function public.live_toggle_absent(
  p_secret text,
  p_division_id text,
  p_round text,
  p_table text,
  p_side text,
  p_absent boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_abs text;
  v_chk text;
begin
  if not _is_live_writer(p_secret) then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_side not in ('B', 'W') then
    raise exception 'INVALID_SIDE';
  end if;

  select absent, check_in into v_abs, v_chk
    from live_match
   where division_id = p_division_id and round = p_round and table_no = p_table
     for update;
  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;
  v_abs := coalesce(v_abs, '');
  v_chk := coalesce(v_chk, '');

  if p_side = 'B' then
    v_abs := case
      when p_absent then (case when v_abs in ('W', 'BOTH') then 'BOTH' else 'B' end)
      else (case when v_abs = 'BOTH' then 'W' when v_abs = 'B' then '' else v_abs end)
    end;
    if p_absent then
      v_chk := case when v_chk = 'BOTH' then 'W' when v_chk = 'B' then '' else v_chk end;
    end if;
  else
    v_abs := case
      when p_absent then (case when v_abs in ('B', 'BOTH') then 'BOTH' else 'W' end)
      else (case when v_abs = 'BOTH' then 'B' when v_abs = 'W' then '' else v_abs end)
    end;
    if p_absent then
      v_chk := case when v_chk = 'BOTH' then 'B' when v_chk = 'W' then '' else v_chk end;
    end if;
  end if;

  update live_match
     set absent = v_abs, check_in = v_chk, updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Destructive RPCs a leaked live token could reach
-- ─────────────────────────────────────────────────────────────────────────────
-- The live token is the most leak-prone secret in the system by design: it rides
-- in every /judge/<token> URL. Anyone holding it can call PostgREST directly with
-- the published anon key, bypassing the Next.js routes entirely — so the RPC gate
-- is the real boundary, not the route.
--
-- live_delete_division cascades to every live_match and live_standing row for the
-- division. It has no REST route and no caller anywhere in the app; gating it on
-- _is_admin costs nothing and removes the most destructive token-reachable call.
create or replace function public.live_delete_division(p_secret text, p_id text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  delete from live_division where id = p_id;   -- cascades to matches + standings
end; $$;

-- `public` MUST be named alongside `anon`. PostgreSQL grants EXECUTE to PUBLIC on
-- every CREATE FUNCTION, and privileges are additive — revoking only the explicit
-- anon grant leaves anon executing through PUBLIC, i.e. a silent no-op. Verified
-- on this database: proacl carries a bare "=X/postgres" entry for all live_*
-- functions. Same lesson as 20260705_0004_award_limit_grants_hardening.sql.
--
-- `authenticated` is deliberately kept on both: /admin/* runs in the browser as
-- the authenticated role and _is_admin() passes on auth.uid() alone, so a future
-- admin UI needs the grant. Its explicit grant survives the PUBLIC revoke.
revoke execute on function public.live_delete_division(text, text) from public, anon;
revoke execute on function public.live_clear_all(text)              from public, anon;

-- live_force_pairing: an orphan that exists in prod but in NO migration and with
-- NO caller (it survives from a pre-repo dashboard edit; it is visible only in
-- the generated lib/data/database.types.ts). Its body was inspected before
-- writing this: it is an older copy of live_set_force with the SAME unconditional
-- de-dup UPDATEs that §1 just fixed, and it is granted to anon — i.e. it is a
-- back door around §1 that a token holder could use to blank two real players.
-- Un-granting closes it without dropping a function whose history is unclear;
-- re-grant if some forgotten client ever turns out to need it.
-- Guarded by a catalog lookup so this migration still applies to a database
-- rebuilt from migrations alone, where the function does not exist.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname = 'live_force_pairing'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4  Division sort order
-- ─────────────────────────────────────────────────────────────────────────────
-- POST /api/divisions sends only {id, name}, so p_sort was always the 0 default
-- and every division sorted equal — leaving the reads (which order by sort_order,
-- then id) to fall back to lexicographic text, where '10' lands between '1' and
-- '2'. MacMahon division ids ARE the leading number of the .xml file name
-- ('01 - 1-2 Kyu.xml' → '01'), so derive the sort key from it. An explicit
-- non-zero p_sort still wins. The {1,6} bound keeps a long numeric id from
-- overflowing int4.
--
-- A non-numeric id ('Open') sorts AFTER the numbered divisions, not before:
-- leaving it at 0 would jump it to the head of every list, which is neither what
-- it did before (everything was 0, so ordering fell through to the id text) nor
-- what an organiser expects from an extra division.
create or replace function public.live_upsert_division(
  p_secret text, p_id text, p_name text, p_sort int default 0
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  insert into live_division (id, name, sort_order)
  values (
    p_id, p_name,
    coalesce(nullif(p_sort, 0), nullif(substring(p_id from '^[0-9]{1,6}'), '')::int, 1000000)
  )
  on conflict (id) do update
    set name = excluded.name, sort_order = excluded.sort_order;
end; $$;

-- One-time backfill: the .jar only POSTs a division it did not already find, so
-- existing rows would otherwise keep sort_order 0 forever. Only rows still at the
-- default are touched; non-numeric ids go to the end, matching the RPC above.
update live_division
   set sort_order = coalesce(nullif(substring(id from '^[0-9]{1,6}'), '')::int, 1000000)
 where sort_order = 0;
