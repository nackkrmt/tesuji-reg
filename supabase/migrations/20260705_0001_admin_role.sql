-- Admin role via Supabase Auth — replaces the shared client-side passphrase gate
-- (NEXT_PUBLIC_ADMIN_PASSPHRASE, which shipped in the browser bundle) with a
-- per-account role, reusing the same account_roles table the judge role uses.
--
-- Transition-safe: _is_admin() now authorizes EITHER a signed-in account holding
-- the 'admin' role OR the legacy app_config.admin_secret (break-glass), so the
-- currently-deployed frontend keeps working until the new login ships and is
-- verified. A follow-up migration drops the secret branch once real login is
-- confirmed. All ~40 admin RPCs call _is_admin(p_admin_secret) unchanged — only
-- this function's body changes, so nothing else needs touching.

-- ── allow 'admin' alongside 'judge' ──────────────────────────────────────────
alter table public.account_roles drop constraint if exists account_roles_role_check;
alter table public.account_roles
  add constraint account_roles_role_check check (role in ('judge', 'admin'));

-- ── seed the first admin (account_id is PK → one role per account) ────────────
insert into public.account_roles (account_id, role)
select id, 'admin' from auth.users where lower(email) = 'nackkrmt@gmail.com'
on conflict (account_id) do update set role = 'admin';

-- ── _is_admin: auth-role first, legacy secret as break-glass ─────────────────
create or replace function public._is_admin(p_secret text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1 from account_roles
    where account_id = auth.uid() and role = 'admin'
  ) or exists(
    -- TODO(cleanup): remove this branch once account login is verified in prod.
    select 1 from app_config where key = 'admin_secret' and value = p_secret
  );
$function$;

-- ── is_admin_me: lets the frontend gate the /admin UI on the current session ──
create or replace function public.is_admin_me()
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $function$
  select exists(
    select 1 from account_roles
    where account_id = auth.uid() and role = 'admin'
  );
$function$;
grant execute on function public.is_admin_me() to anon, authenticated;

-- ── keep judge-only flows from matching admin rows ───────────────────────────
-- account_roles now holds both roles; the judge button + judges list must stay
-- judge-scoped so admins don't leak into them.
create or replace function public.judge_get_token()
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v_token text;
begin
  if not exists (
    select 1 from account_roles where account_id = auth.uid() and role = 'judge'
  ) then
    raise exception 'UNAUTHORIZED';
  end if;
  select value into v_token from app_config where key = 'live_token';
  return v_token;
end; $$;

create or replace function public.admin_list_judges(p_admin_secret text)
returns table(account_id uuid, email text, first_name_th text, default_division_id text)
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return query
    select ar.account_id, u.email::text, p.first_name_th, ar.default_division_id
    from account_roles ar
    join auth.users u on u.id = ar.account_id
    left join profile p on p.id = ar.account_id
    where ar.role = 'judge'
    order by u.email;
end; $$;
