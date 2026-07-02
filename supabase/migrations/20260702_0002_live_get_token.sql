-- Admin-only reader for the live_token, so the admin UI can display / copy the
-- secret Judge link (/judge/<token>) and the value to paste into the MacMahon
-- launcher.properties. Guarded by the admin passphrase.
create or replace function public.live_get_token(p_admin_secret text)
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v text;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select value into v from app_config where key = 'live_token';
  return v;
end; $$;

grant execute on function public.live_get_token(text) to anon, authenticated;
