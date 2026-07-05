-- Harden award-limit function grants. Supabase's default privileges auto-GRANT
-- EXECUTE to anon+authenticated on every new function in `public`, so the
-- `revoke ... from public` in 20260705_0003 did NOT lock the internal helpers:
-- PUBLIC was revoked, but the direct anon/authenticated grants remained (see the
-- security advisor's anon_security_definer_function_executable warnings).
--
-- Intent: the three internal helpers are only ever called by the SECURITY DEFINER
-- wrappers (award_limit_status / reserve_seats, owned by postgres → the owner can
-- always execute them), so no client role needs direct access. award_limit_status
-- stays authenticated-only (the register RankPicker calls it) and is never exposed
-- to anon. The admin exemption RPCs keep the codebase's anon+authenticated
-- convention (they are gated internally by _is_admin, so anon just gets
-- UNAUTHORIZED) — consistent with every other admin_* RPC.

revoke execute on function public.award_1kyu_event_count(text,text) from anon, authenticated;
revoke execute on function public.has_dan_record(text,text)         from anon, authenticated;
revoke execute on function public.award_limit_is_exempt(text,text)  from anon, authenticated;
revoke execute on function public.award_limit_status(text,text)     from anon;
