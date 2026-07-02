-- Fix: live_clear_all failed over PostgREST with "DELETE requires a WHERE clause"
-- (Supabase preloads pg_safeupdate on the API roles, which blocks unqualified
-- DELETE/UPDATE). Add an always-true WHERE so the mass delete is allowed while
-- still being explicit. Child rows cascade, but we delete in FK order anyway.
create or replace function public.live_clear_all(p_admin_secret text)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  delete from live_match    where true;
  delete from live_standing where true;
  delete from live_division where true;
  delete from live_config   where true;
end; $$;
