-- ── The lazy token mint has never once minted ───────────────────────────────
-- "อ่าน token ของรายการนี้ไม่สำเร็จ" on /admin/live for a newly created
-- tournament, and no judge console anywhere for it. One cause, three screens.
--
-- `_ensure_live_token` mints a tournament's live token with
-- `encode(gen_random_bytes(16), 'hex')`. `gen_random_bytes` is pgcrypto, and on
-- Supabase pgcrypto lives in the `extensions` schema — but 20260908_0001 gave
-- the function `set search_path to 'public'`, so the name does not resolve at
-- call time:
--
--   ERROR 42883: function gen_random_bytes(integer) does not exist
--   CONTEXT: PL/pgSQL function _ensure_live_token(uuid) line 4
--
-- It looked healthy for eight days because 20260908_0001 also BACKFILLED a
-- token row for every tournament that existed then, and that backfill is a
-- plain statement in the migration body — it runs with the migration role's
-- own search_path, which does include `extensions`. So every event created
-- before 2026-09-08 has a token and every event created after it cannot get
-- one. "The Best of Gen" (created 2026-09-16) is the first to hit it.
--
-- Everything downstream of the mint fails with it, which is why this is one
-- fix and not three:
--   · live_get_token   → /admin/live launcher.properties rows + rotate button
--   · judge_get_token  → a judge opening their own console link
--   · judge_my_assignments → the whole RPC raises, so /results shows a judge
--     NO console button at all rather than a broken one
--
-- `live_rotate_token` calls gen_random_bytes directly and carries the same
-- `search_path to 'public'`, so "สร้าง token ใหม่" was broken in exactly the
-- same way — including as a workaround for the read failing.
--
-- Fixed by schema-qualifying the call rather than by widening the search_path
-- of two SECURITY DEFINER functions. (`search_go_person` and
-- `search_go_player_database` take the other route, `search_path to 'public',
-- 'extensions'` — fine for them, but those two need the extensions schema for
-- an operator class and a threshold GUC, not for a single call we can name.)
-- The bodies are otherwise byte-for-byte those of 20260908_0001.
--
-- `create or replace` keeps the ACL a function already has, so these two stay
-- revoked/granted as 20260908_0001 left them; the grant lines are repeated
-- anyway, per the rule that every function in this repo is followed by its
-- own explicit revoke.

create or replace function public._ensure_live_token(p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v text;
begin
  insert into tournament_live_token (tournament_id, token)
  values (p_tournament_id, encode(extensions.gen_random_bytes(16), 'hex'))
  on conflict (tournament_id) do nothing;
  select token into v from tournament_live_token where tournament_id = p_tournament_id;
  return v;
end; $$;
revoke all on function public._ensure_live_token(uuid) from public, anon, authenticated;

create or replace function public.live_rotate_token(p_admin_secret text, p_tournament_id uuid)
returns text
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_tournament_id is null
     or not exists (select 1 from tournament where id = p_tournament_id) then
    raise exception 'TOURNAMENT_NOT_FOUND';
  end if;
  insert into tournament_live_token (tournament_id, token, rotated_at)
  values (p_tournament_id, encode(extensions.gen_random_bytes(16), 'hex'), now())
  on conflict (tournament_id) do update
    set token = excluded.token, rotated_at = now();
  return (select token from tournament_live_token where tournament_id = p_tournament_id);
end; $$;
revoke all on function public.live_rotate_token(text, uuid) from public, anon;
grant execute on function public.live_rotate_token(text, uuid) to authenticated;

-- No backfill on purpose. The mint is lazy by design (20260908_0001 §7) and it
-- works again from here: the next /admin/live open, judge link or
-- judge_my_assignments call writes the row for any event still missing one.
