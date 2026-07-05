-- Admin role cleanup — remove the legacy shared-passphrase break-glass now that
-- account-based admin login is live. After this, the ONLY way to authorize as
-- admin is holding the 'admin' role on a signed-in account. The edge functions
-- (verify-slip, sync-go-database) already switched to JWT-based admin checks, so
-- app_config.admin_secret is no longer read anywhere.

create or replace function public._is_admin(p_secret text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  -- p_secret is retained only so the ~40 admin RPCs that pass p_admin_secret keep
  -- their signature; it is no longer consulted. Admin = the signed-in account role.
  select exists(
    select 1 from account_roles
    where account_id = auth.uid() and role = 'admin'
  );
$function$;

delete from app_config where key = 'admin_secret';
