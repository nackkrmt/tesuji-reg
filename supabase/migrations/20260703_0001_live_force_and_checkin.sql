-- Judge-page write RPCs that the v1 index.html/app.js clone needs but the initial
-- live_competition migration didn't ship: Force Pairing and per-side check-in toggle.
-- Both are SECURITY DEFINER + guarded by _is_live_writer (admin passphrase OR the
-- live_token secret link), matching the other live_* write RPCs.
--   • live_set_force       ↔ v1 PUT /api/divisions/:id/force
--   • live_toggle_checkin  ↔ v1 PUT /api/divisions/:id/checkin  (per-side B/W merge)

-- ── Force Pairing ─────────────────────────────────────────────────────────────
-- Sets the manual-override columns (black_force / white_force) + remark on the
-- target table. parseMatches() in lib/live/serverData.ts already displays
-- `black_force || black`, so the override wins without touching the system pairing.
-- Replicates v1's de-dup side effect (server.js:855): if a forced player was
-- already paired at another table this round, blank that slot to 'ไม่มีผู้เข้าแข่งขัน'
-- so nobody is double-booked. Comparison uses the *effective* name (override wins,
-- else system pairing) — same as v1.
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
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;

  update live_match
     set black_force = v_nb,
         white_force = v_nw,
         remark      = coalesce(p_remark, remark),
         updated_at  = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;

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

-- ── Per-side check-in toggle ──────────────────────────────────────────────────
-- v1 tracks check-in as a single code ('' | 'B' | 'W' | 'BOTH'); the judge toggles
-- one side at a time. Merge atomically in SQL (read-modify-write in one call) so
-- two judges toggling B and W on the same table don't clobber each other. Mirrors
-- the merge in v1 server.js:838-840. live_set_checkin (whole-string) is left as-is
-- since AdminLiveClient / lib/live/client.ts still use it.
create or replace function public.live_toggle_checkin(
  p_secret text, p_division_id text, p_round text, p_table text,
  p_side text, p_checked boolean
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_cur text;
  v_new text;
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_side not in ('B', 'W') then raise exception 'INVALID_SIDE'; end if;

  select check_in into v_cur from live_match
   where division_id = p_division_id and round = p_round and table_no = p_table;
  if not found then return; end if;
  v_cur := coalesce(v_cur, '');

  if p_side = 'B' then
    v_new := case when p_checked then (case when v_cur = 'W' then 'BOTH' else 'B' end)
                  else (case when v_cur = 'BOTH' then 'W' else '' end) end;
  else
    v_new := case when p_checked then (case when v_cur = 'B' then 'BOTH' else 'W' end)
                  else (case when v_cur = 'BOTH' then 'B' else '' end) end;
  end if;

  update live_match set check_in = v_new, updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end; $$;

grant execute on function
  public.live_set_force(text, text, text, text, text, text, text),
  public.live_toggle_checkin(text, text, text, text, text, boolean)
to anon, authenticated;
