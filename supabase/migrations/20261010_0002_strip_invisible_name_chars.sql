-- ── Invisible characters stop splitting one person into two ─────────────────
-- On 2026-10-10 a player who had passed 1 dan could not enter the dan division:
-- reserve_seats answered AWARD_LIMIT_REACHED. has_dan_record looked for the
-- name among the DAN rows and found nothing, because the DAN sheet spelled the
-- first name "พีรวัชร์" + U+200B ZERO WIDTH SPACE. The character renders as
-- nothing, so the cell looked right, and neither tier of the match removes it —
-- btrim() strips spaces, and normalize_thai_name's \s+ collapse does not match
-- U+200B either — so the exact tier and the normalized tier both missed, the
-- player counted as "not yet dan", and three 1-kyu medals banned them from
-- every division. That one row was fixed by retyping the cell and re-syncing.
--
-- It was not one row. Prod that day: 12 DAN, 35 KYU and 14 AWARD rows held a
-- U+200B in a name (only in names — event fields, profiles, managed players,
-- seats and exemptions were clean), and go_person held 60 rows keyed on those
-- dirty spellings: one registry row per spelling instead of one per person, 12
-- of them beside a clean twin of the same person. None was linked to an
-- account, and that is the symptom, not the safety: the person behind each one
-- could not be linked to their own rank. 8 accounts were measurably affected —
-- a 2-dan player listed as self-declared, ranks that disagreed with the
-- registry.
--
-- lib/go-database.ts now strips the characters on import (str() and
-- normalizeThaiName), but that cleans only what arrives after it ships, and the
-- master sheets still hold the dirty cells. So the database stops depending on
-- every writer getting it right:
--
--   1. normalize_thai_name deletes U+200B/200C/200D (zero-width space,
--      non-joiner, joiner), U+2060 (word joiner), U+FEFF (BOM) and U+00AD (soft
--      hyphen) before anything else. None of them means anything in a Thai
--      name. They are written as chr() codes — not literals, which are
--      invisible in a diff by definition, and not \u escapes, which some
--      transports decode on the way to the server.
--      The whitespace collapse also moves BEFORE the trim. trim() strips spaces
--      only, so a name padded with a tab or a newline (a pasted CSV cell) came
--      out with a leading space here while JS .trim() removed it — the "KNOWN
--      DEFECT" lib/go-database.test.ts pinned. Collapse-then-btrim makes the two
--      agree. No stored name on prod changes because of that half.
--
--   2. The stored normalized pairs are recomputed under the new rule, and the
--      raw names in go_player_database and award_limit_exemption lose the
--      characters too: the exact tier (has_dan_record, award_1kyu_event_count,
--      _propagate_person_ranks Pass A) compares raw names.
--
--   3. go_person rows keyed on a stale pair are re-keyed. Where the clean pair
--      already has a row, that row survives and takes over the dirty row's
--      links; otherwise one dirty row per pair is renamed in place. The
--      registry is then refreshed and ranks propagated — exactly what an
--      admin's "sync all" does — so the fix shows without waiting for the next
--      import.
--
--   4. _propagate_person_ranks Pass B also rewrites a linked row whose rank
--      already EQUALS the official one but is still flagged rank_self_declared.
--      The flag is derived by a BEFORE UPDATE trigger (20260915_0002 §2), so it
--      is only as fresh as the row's last write, and Pass B skipped every row
--      whose power did not change: a player who declared 1 dan before the
--      registry caught up kept the flag — and their place on the organiser's
--      self-declared worklist — for good. The same player, the same day.
--      A flag-only rewrite counts in updatedProfiles / updatedPlayers; the row
--      did change.
--
-- Deploy: push the build first, then apply. Either order is safe for the
-- running app, but until the new build ships an import from the old one writes
-- the sheets' dirty cells back with dirty normalized pairs, which the new
-- function no longer matches; those stay unmatched until the next import from
-- the new build.

-- One spelling of the strip, for §2 and §3. pg_temp: it exists for this
-- transaction's session only and leaves nothing to grant or maintain.
create or replace function pg_temp.strip_invisible(t text)
returns text
language sql immutable
as $function$
  select btrim(translate(t,
    chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279) || chr(173),
    ''));
$function$;

-- ============================================================================
-- 1. normalize_thai_name — strip invisible characters; collapse, then trim
-- ============================================================================
-- translate() with an empty replacement deletes every listed character. Same
-- list as INVISIBLE_CHARS in lib/go-database.ts; the parity test reads the
-- chr() codes out of this definition.

create or replace function public.normalize_thai_name(input text)
returns text
language sql immutable set search_path to 'public'
as $function$
  select replace(
    translate(
      btrim(regexp_replace(
        translate(coalesce(input, ''),
          chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279) || chr(173),
          ''),
        '\s+', ' ', 'g')),
      'ศษณญภฎฏฑใ',
      'สสนยพดตทไ'
    ),
    '์',
    ''
  );
$function$;

revoke all on function public.normalize_thai_name(text) from public, anon, authenticated;
grant  execute on function public.normalize_thai_name(text) to anon, authenticated;

-- ============================================================================
-- 2. Stored names and pairs, recomputed
-- ============================================================================
-- SET expressions read the OLD row, and the new rule gives the same pair for
-- the dirty and the stripped spelling, so normalizing the old value is right.

update public.go_player_database g
   set first_name_th            = pg_temp.strip_invisible(g.first_name_th),
       last_name_th             = pg_temp.strip_invisible(g.last_name_th),
       first_name_th_normalized = public.normalize_thai_name(g.first_name_th),
       last_name_th_normalized  = public.normalize_thai_name(g.last_name_th)
 where g.first_name_th is distinct from pg_temp.strip_invisible(g.first_name_th)
    or g.last_name_th  is distinct from pg_temp.strip_invisible(g.last_name_th)
    or g.first_name_th_normalized is distinct from public.normalize_thai_name(g.first_name_th)
    or g.last_name_th_normalized  is distinct from public.normalize_thai_name(g.last_name_th);

update public.award_limit_exemption x
   set first_name_th            = pg_temp.strip_invisible(x.first_name_th),
       last_name_th             = pg_temp.strip_invisible(x.last_name_th),
       first_name_th_normalized = public.normalize_thai_name(x.first_name_th),
       last_name_th_normalized  = public.normalize_thai_name(x.last_name_th)
 where x.first_name_th is distinct from pg_temp.strip_invisible(x.first_name_th)
    or x.last_name_th  is distinct from pg_temp.strip_invisible(x.last_name_th)
    or x.first_name_th_normalized is distinct from public.normalize_thai_name(x.first_name_th)
    or x.last_name_th_normalized  is distinct from public.normalize_thai_name(x.last_name_th);

-- ============================================================================
-- 3. go_person — one row per person again
-- ============================================================================
-- A row is stale when its stored pair is no longer what the rule makes of its
-- own name (_refresh_go_person_registry and ensure_go_person both store exactly
-- that, so on prod "stale" means "dirty").

create temp table _gp_rekey on commit drop as
select gp.id,
       public.normalize_thai_name(gp.first_name_th) as nfn,
       public.normalize_thai_name(gp.last_name_th)  as nln
  from public.go_person gp
 where gp.first_name_th_normalized is distinct from public.normalize_thai_name(gp.first_name_th)
    or gp.last_name_th_normalized  is distinct from public.normalize_thai_name(gp.last_name_th);

-- The survivor for each clean pair: the row already holding it if there is one
-- (the unique key allows at most one), else a dirty row with links, else the
-- lowest id — deterministic, so a dry run and the real run pick the same.
create temp table _gp_keep on commit drop as
select distinct on (c.nfn, c.nln) c.nfn, c.nln, c.id as keep_id
  from (
    select gp.id, gp.first_name_th_normalized as nfn, gp.last_name_th_normalized as nln,
           0 as pref
      from public.go_person gp
     where (gp.first_name_th_normalized, gp.last_name_th_normalized)
             in (select r.nfn, r.nln from _gp_rekey r)
       and gp.id not in (select r.id from _gp_rekey r)
    union all
    select r.id, r.nfn, r.nln,
           case when exists (select 1 from public.profile p where p.person_id = r.id)
                  or exists (select 1 from public.managed_player m where m.person_id = r.id)
                then 1 else 2 end
      from _gp_rekey r
  ) c
 order by c.nfn, c.nln, c.pref, c.id;

-- a. A dirty survivor takes its clean pair first, so the links moved onto it in
--    (b) pass _autolink_person_id's check that a link matches the row's name.
--    No conflict is possible: had any row held the pair, it would have won.
update public.go_person gp
   set first_name_th            = pg_temp.strip_invisible(gp.first_name_th),
       last_name_th             = pg_temp.strip_invisible(gp.last_name_th),
       first_name_th_normalized = k.nfn,
       last_name_th_normalized  = k.nln,
       updated_at               = now()
  from _gp_keep k
 where gp.id = k.keep_id
   and gp.id in (select r.id from _gp_rekey r);

-- b. Links on a losing row move to its survivor (0 on prod; kept so the file
--    stays right if an account links one before this is applied).
update public.profile p
   set person_id = k.keep_id
  from _gp_rekey r
  join _gp_keep k on k.nfn = r.nfn and k.nln = r.nln
 where p.person_id = r.id
   and r.id <> k.keep_id;

update public.managed_player m
   set person_id = k.keep_id
  from _gp_rekey r
  join _gp_keep k on k.nfn = r.nfn and k.nln = r.nln
 where m.person_id = r.id
   and r.id <> k.keep_id;

-- c. The losing rows, now unreferenced.
delete from public.go_person gp
 using _gp_rekey r
  join _gp_keep k on k.nfn = r.nfn and k.nln = r.nln
 where gp.id = r.id
   and r.id <> k.keep_id;

-- ============================================================================
-- 4. _propagate_person_ranks — Pass B also refreshes a stale self-declared flag
-- ============================================================================
-- Verbatim from the live definition (20260712_0006) except the last predicate
-- of the two Pass B updates.

create or replace function public._propagate_person_ranks()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link_p bigint; v_link_m bigint; v_upd_p bigint; v_upd_m bigint;
begin
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

  -- Pass B. A row whose rank already equals the official one is rewritten too
  -- while it is still flagged: the rewrite is what makes
  -- _derive_rank_self_declared recompute the flag.
  update profile p
     set power_level = gp.power_level, updated_at = now()
    from go_person gp
   where p.person_id = gp.id
     and gp.is_ambiguous = false
     and gp.missing_since is null
     and gp.power_level is not null
     and (p.power_level is distinct from gp.power_level or p.rank_self_declared);
  get diagnostics v_upd_p = row_count;

  update managed_player p
     set power_level = gp.power_level, updated_at = now()
    from go_person gp
   where p.person_id = gp.id
     and p.archived_at is null
     and gp.is_ambiguous = false
     and gp.missing_since is null
     and gp.power_level is not null
     and (p.power_level is distinct from gp.power_level or p.rank_self_declared);
  get diagnostics v_upd_m = row_count;

  return jsonb_build_object(
    'linkedProfiles',  v_link_p, 'linkedPlayers',   v_link_m,
    'updatedProfiles', v_upd_p,  'updatedPlayers',  v_upd_m);
end; $function$;

revoke all on function public._propagate_person_ranks() from public, anon, authenticated;

-- ============================================================================
-- 5. Refresh the registry and push ranks, as admin_sync_player_ranks does
-- ============================================================================

select public._refresh_go_person_registry();
select public._propagate_person_ranks();
