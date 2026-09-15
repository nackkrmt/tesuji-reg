-- ── Re-exporting a round must not erase what the judges entered ─────────────
-- Defect (found 2026-09-15): live_replace_round starts with
--   delete from live_match where division_id = … and round = …
-- and then inserts the payload fresh. Every column the judges own — result,
-- remark, check_in, absent, black_force/white_force and submitted_by — falls
-- back to its default on the new row, and the `on conflict do update` clause
-- that follows can never fire because the rows were just deleted.
--
-- The MacMahon .jar calls this on EVERY "Export Pairings" (see
-- app/api/divisions/[id]/matches/route.ts), so one re-export of the CURRENT
-- round — to fix a single pairing, to add a late entrant, or simply out of
-- habit — silently resets every table of that round to '?-?' and clears the
-- attendance the judges just took, on the public board and in every console at
-- once. There is no backup of live_match and no audit trail: recovery is
-- re-entering the whole round from memory, on competition day.
--
-- The fix keeps the replace semantics the .jar's flow needs (a table removed
-- from the pairing disappears) but reaches them by upsert:
--   • a table whose two SYSTEM seats are unchanged keeps everything the judges
--     entered — the pairing is the same pairing, only re-uploaded;
--   • a table whose seats changed is a different match, so its judge-entered
--     columns are cleared: a result for A-vs-B must not stand over C-vs-D, and
--     a Force override naming A is meaningless (and actively misleading on the
--     board) once A no longer sits there;
--   • tables absent from the payload are deleted, exactly as before.
--
-- Also here: live_submit_result learns which pairing the judge was LOOKING at.
-- MacMahon reuses table numbers, so MATCH_NOT_FOUND — the only guard today —
-- does not fire when table 5 still exists but now holds two other players. The
-- judge console queues results offline for minutes at a time and submits from a
-- screen up to 30 s behind the CDN, so both paths could land a winner on the
-- wrong pair. The two new arguments are OPTIONAL and default to null: results
-- already sitting in a judge's localStorage from before this deploy carry no
-- names and keep the old (unchecked) behaviour rather than being rejected on
-- arrival. Changing the argument list is deliberate here — the 7-argument
-- overload is dropped first so PostgREST is left with exactly one signature.
--
-- Deploy: apply this FIRST, then ship the frontend. The judge console sends
-- p_black/p_white on every result from that build on, and PostgREST answers
-- PGRST202 for arguments a function does not have — a frontend deployed ahead
-- of this migration cannot record results at all. The reverse order is safe:
-- the old console's seven named arguments resolve to the new function. Never
-- mid-tournament either way. Rollback is the 7-arg body from 20260908_0001
-- (results submitted in between keep their values; nothing here changes a
-- column or a row shape).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) live_replace_round: upsert the payload, delete only what it omits
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.live_replace_round(p_secret text, p_division_id text, p_round text, p_matches jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  m jsonb;
  v_table text;
  v_tables text[] := '{}';
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;

  for m in select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) loop
    v_table := coalesce(m->>'table', '');
    v_tables := v_tables || v_table;
    insert into live_match (division_id, round, table_no, black, white, black_score, white_score)
    values (
      p_division_id, p_round,
      v_table, coalesce(m->>'black',''), coalesce(m->>'white',''),
      m->>'blackScore', m->>'whiteScore'
    )
    on conflict (division_id, round, table_no) do update
      set black       = excluded.black,
          white       = excluded.white,
          black_score = excluded.black_score,
          white_score = excluded.white_score,
          -- Same seats = same match: everything the judges entered survives the
          -- re-upload. Different seats = a different match at a reused table
          -- number, and nothing entered against the old pair may carry over —
          -- including a Force override, which names players who have left.
          -- The row comparison is evaluated inside the upsert itself, so a
          -- concurrent write cannot slip between "is it the same pairing?" and
          -- the decision made from the answer.
          result       = case when (live_match.black, live_match.white)
                                  is not distinct from (excluded.black, excluded.white)
                         then live_match.result else '?-?' end,
          remark       = case when (live_match.black, live_match.white)
                                  is not distinct from (excluded.black, excluded.white)
                         then live_match.remark else '' end,
          check_in     = case when (live_match.black, live_match.white)
                                  is not distinct from (excluded.black, excluded.white)
                         then live_match.check_in else '' end,
          absent       = case when (live_match.black, live_match.white)
                                  is not distinct from (excluded.black, excluded.white)
                         then live_match.absent else '' end,
          submitted_by = case when (live_match.black, live_match.white)
                                  is not distinct from (excluded.black, excluded.white)
                         then live_match.submitted_by else '' end,
          black_force  = case when (live_match.black, live_match.white)
                                  is not distinct from (excluded.black, excluded.white)
                         then live_match.black_force else '' end,
          white_force  = case when (live_match.black, live_match.white)
                                  is not distinct from (excluded.black, excluded.white)
                         then live_match.white_force else '' end,
          updated_at   = now();
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) live_submit_result: refuse a result written against a pairing that moved
-- ─────────────────────────────────────────────────────────────────────────────
-- The 7-arg overload must go before the 9-arg one is created: two overloads
-- differing only by defaulted trailing arguments make every PostgREST call
-- ambiguous. Callers that send the original seven named arguments resolve to
-- the new function unchanged (p_black/p_white take their defaults).
drop function if exists public.live_submit_result(text, text, text, text, text, text, text);

create or replace function public.live_submit_result(
  p_secret text, p_division_id text, p_round text, p_table text,
  p_result text, p_remark text default null, p_by text default '',
  p_black text default null, p_white text default null
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_black text;
  v_white text;
begin
  if not _can_write_division(p_secret, p_division_id) then raise exception 'UNAUTHORIZED'; end if;

  -- `for update` so a concurrent live_replace_round cannot re-seat the table
  -- between this check and the write below.
  select coalesce(nullif(btrim(black_force), ''), black),
         coalesce(nullif(btrim(white_force), ''), white)
    into v_black, v_white
    from live_match
   where division_id = p_division_id and round = p_round and table_no = p_table
     for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;

  -- p_black/p_white are the names the judge had in front of them, as displayed
  -- (Force override wins, which is what the console shows). Null means the
  -- caller predates this check — an offline result queued before the deploy —
  -- and is accepted as it was before, rather than stranded in the queue.
  if (p_black is not null and btrim(p_black) is distinct from v_black)
     or (p_white is not null and btrim(p_white) is distinct from v_white) then
    raise exception 'MATCH_CHANGED';
  end if;

  update live_match
     set result = p_result,
         remark = coalesce(p_remark, remark),
         submitted_by = coalesce(nullif(p_by,''), submitted_by),
         updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end; $$;

revoke all on function public.live_submit_result(text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.live_submit_result(text, text, text, text, text, text, text, text, text)
  to anon, authenticated;
