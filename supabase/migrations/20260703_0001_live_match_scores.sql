-- Carry each player's MacMahon score (แต้ม McMahon ก่อนเข้ารอบนี้) alongside the
-- pairing itself — sent by the macmahon-tesuji .jar's "Export Pairings to TESUJI"
-- action, formatted exactly as MacMahon's own pairing view shows it in "(...)":
--   getScoreDisplayString(getScoreAfterRound(currentRound - 1))
-- (verified against Participant.getPairingDisplayString bytecode). Stored as TEXT,
-- not int, because the display can carry half/quarter points (e.g. "1½" from a
-- jigo). Kept as separate columns rather than baked into black/white so
-- subscribe-by-name (checkResultChanges / buildPlayerCard in results.js) keeps
-- matching a player across rounds even as their score changes.
alter table public.live_match add column if not exists black_score text;
alter table public.live_match add column if not exists white_score text;

create or replace function public.live_replace_round(p_secret text, p_division_id text, p_round text, p_matches jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare m jsonb;
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  delete from live_match where division_id = p_division_id and round = p_round;
  for m in select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb)) loop
    insert into live_match (division_id, round, table_no, black, white, black_score, white_score)
    values (
      p_division_id, p_round,
      coalesce(m->>'table',''), coalesce(m->>'black',''), coalesce(m->>'white',''),
      m->>'blackScore', m->>'whiteScore'
    )
    on conflict (division_id, round, table_no) do update
      set black = excluded.black, white = excluded.white,
          black_score = excluded.black_score, white_score = excluded.white_score,
          updated_at = now();
  end loop;
end; $$;
