-- ── Grant hygiene: name `public` in every revoke ────────────────────────────
-- PostgreSQL grants EXECUTE to PUBLIC on CREATE FUNCTION, and privileges are
-- additive, so `revoke ... from anon, authenticated` without naming `public`
-- is a silent no-op. That lesson is written down in 20260705_0004 and again in
-- 20260725_0001 §3, but was never applied retroactively: verified against
-- production, every function below is still executable by an unauthenticated
-- caller holding only the publishable key.
--
-- Most are harmless — they re-check auth.uid() internally, so the open grant
-- only lets a stranger call something that immediately refuses. Two are not:
--
--   _recompute_batch_total(uuid)  has NO auth check at all and performs
--     `update registration_batch set discount_thb = …, total_amount_thb = …`.
--     Anyone who knows or guesses a batch UUID can rewrite what that
--     registration owes. This is a genuine unauthenticated write path.
--
--   search_go_player_database(...)  was made SECURITY DEFINER by
--     20260701_0002, which then dropped the open table policy and revoked
--     SELECT on go_player_database from anon — but never revoked EXECUTE on
--     the function itself, leaving the bulk PII dump (real names, ranks,
--     award history, including minors') reachable 25 rows at a time. Its
--     successor search_go_person was revoked correctly in 20260712_0001:511.
--     This one has zero callers in the app.
--
-- Safe to apply while v1 is serving: the five owner-facing RPCs keep their
-- `authenticated` grant (each already gates on auth.uid(), verified), and the
-- two internal helpers are only ever called from SECURITY DEFINER functions —
-- admin_delete_seat, admin_resolve_division_change, admin_update_seat,
-- apply_promo, preview_division_change, request_division_change,
-- submit_registration — which execute as the owner and so keep EXECUTE.

-- Internal helpers: no caller outside the database should reach these.
revoke execute on function public._recompute_batch_total(uuid)
  from public, anon, authenticated;
revoke execute on function public._promo_discount(text, numeric, numeric)
  from public, anon, authenticated;

-- Owner-facing RPCs: signed-in users still need these; anonymous callers never did.
revoke execute on function public.get_batch_public(uuid) from public, anon;
grant  execute on function public.get_batch_public(uuid) to authenticated;

revoke execute on function public.release_batch(uuid) from public, anon;
grant  execute on function public.release_batch(uuid) to authenticated;

revoke execute on function public.submit_registration(uuid, text) from public, anon;
grant  execute on function public.submit_registration(uuid, text) to authenticated;

revoke execute on function public.withdraw_seat(uuid, text, text, text, text)
  from public, anon;
grant  execute on function public.withdraw_seat(uuid, text, text, text, text)
  to authenticated;

revoke execute on function public.swap_seat(uuid, text, uuid, uuid) from public, anon;
grant  execute on function public.swap_seat(uuid, text, uuid, uuid) to authenticated;

-- Superseded by search_go_person and called from nowhere. Revoked rather than
-- dropped so this migration stays additive; drop it in a later contract pass.
revoke execute on function
  public.search_go_player_database(text, text, text[], integer)
  from public, anon, authenticated;
