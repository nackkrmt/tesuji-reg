-- ── A re-export from a MacMahon that has caught up with the judges' Force
-- ── edits must not erase what the judges entered ──────────────────────────
-- Since 20260915_0005 live_replace_round keeps a table's judge-entered columns
-- (result, remark, check_in, absent, submitted_by, the Force overrides) when
-- the re-uploaded SYSTEM names equal the stored system names. That rule has a
-- blind spot the launcher's new "Sync จาก TESUJI" (2026-09-20) walks straight
-- into: the sync makes MacMahon's pairing show exactly what the judges' board
-- shows — a player Force-moved to another table, a "ไม่มีผู้เข้าแข่งขัน" stand-in
-- on a seat a judge blanked. The next Export Pairings then uploads THOSE names
-- as the system names. They differ from the stored system names (which still
-- hold the pre-Force pairing) and only agree with the stored effective names
-- (black_force / white_force applied) — and the old rule read that as "a
-- different match at a reused table": result '?-?', check-in gone, walkover
-- lost, on the very tables the judges had to intervene on.
--
-- The fix: a re-uploaded table is the SAME match when its names equal either
-- the stored system names or the stored effective names. In the second case
-- the pairing program has simply adopted the judges' edit, so the Force
-- override is baked into the system columns and the force column is cleared
-- (kept only where it still differs from the new system name). Everything
-- else — different names on both readings — is a new match and is cleared as
-- before; tables missing from the payload are still deleted.
--
-- Structure: the upsert becomes an explicit select … for update / update /
-- insert so the "same match" test is written once instead of seven times. The
-- row lock gives the same guarantee the in-upsert comparison gave: nothing can
-- change the row between the comparison and the write.
--
-- Deploy: any time, no code change on the web side. The launcher build of
-- 2026-09-20 warns on export when the round has Force-edited tables until this
-- is on the server. Rollback is the 20260915_0005 body.

create or replace function public.live_replace_round(p_secret text, p_division_id text, p_round text, p_matches jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  m jsonb;
  v_table text;
  v_tables text[] := '{}';
  v_black text;
  v_white text;
  v_old live_match%rowtype;
  v_same boolean;
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;

  for m in select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) loop
    v_table := coalesce(m->>'table', '');
    v_tables := v_tables || v_table;
    v_black := coalesce(m->>'black', '');
    v_white := coalesce(m->>'white', '');

    select * into v_old
      from live_match
     where division_id = p_division_id and round = p_round and table_no = v_table
       for update;

    if not found then
      insert into live_match (division_id, round, table_no, black, white, black_score, white_score)
      values (p_division_id, p_round, v_table, v_black, v_white, m->>'blackScore', m->>'whiteScore');
      continue;
    end if;

    -- Same match: the same two system names, OR the same two names the judges
    -- see (their Force overrides applied) — the pairing program adopted the edit.
    v_same := (v_old.black, v_old.white) is not distinct from (v_black, v_white)
           or (coalesce(nullif(btrim(v_old.black_force), ''), v_old.black),
               coalesce(nullif(btrim(v_old.white_force), ''), v_old.white))
              is not distinct from (v_black, v_white);

    update live_match
       set black        = v_black,
           white        = v_white,
           black_score  = m->>'blackScore',
           white_score  = m->>'whiteScore',
           result       = case when v_same then v_old.result       else '?-?' end,
           remark       = case when v_same then v_old.remark       else ''    end,
           check_in     = case when v_same then v_old.check_in     else ''    end,
           absent       = case when v_same then v_old.absent       else ''    end,
           submitted_by = case when v_same then v_old.submitted_by else ''    end,
           -- A Force override that now equals the uploaded system name is baked
           -- in and dropped; one that still differs (the judges edited a seat
           -- MacMahon has not adopted) is kept. A new match keeps none.
           black_force  = case when v_same and btrim(v_old.black_force) is distinct from v_black
                               then v_old.black_force else '' end,
           white_force  = case when v_same and btrim(v_old.white_force) is distinct from v_white
                               then v_old.white_force else '' end,
           updated_at   = now()
     where division_id = p_division_id and round = p_round and table_no = v_table;
  end loop;

  -- Whatever the new pairing dropped. An empty payload matches nothing, so the
  -- round is cleared wholesale — the same end state the old delete produced.
  delete from live_match
   where division_id = p_division_id
     and round = p_round
     and not (table_no = any(v_tables));
end; $$;

revoke all on function public.live_replace_round(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.live_replace_round(text, text, text, jsonb) to anon, authenticated;
