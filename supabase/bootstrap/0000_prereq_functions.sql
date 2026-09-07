-- ============================================================================
-- PREREQUISITE FUNCTIONS — dashboard-era helpers that migrations depend on
-- but that no repo file creates early enough.
--
-- supabase/bootstrap/0001 deliberately holds only the functions that exist in
-- NO migration. _is_admin is the gap that rule leaves: it was authored in the
-- Supabase SQL editor before this repo adopted migrations, so 0001 excludes it
-- (20260705_0001 does define it) — but every migration from 20260630_0002
-- onward already CALLS it, and 20260702_0001 calls it from a SQL-language
-- function body, which Postgres resolves at CREATE time. On a fresh project
-- the replay therefore dies with "function public._is_admin(text) does not
-- exist" long before 20260705_0001 runs.
--
-- The body here is the END state (20260705_0002): admin is the signed-in
-- account's role, and the p_secret argument is ignored. 20260705_0001 will
-- briefly CREATE OR REPLACE it back to the legacy break-glass version during
-- the replay, and 20260705_0002 restores exactly this — so the final state is
-- identical either way.
--
-- Runs after schema-baseline.sql (it reads account_roles) and before 0001.
-- NEVER APPLY TO PROD — it is already there.
-- ============================================================================

create or replace function public._is_admin(p_secret text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1 from account_roles
    where account_id = auth.uid() and role = 'admin'
  );
$function$;
