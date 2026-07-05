-- Multi-role accounts: allow one account to hold BOTH 'admin' and 'judge'.
-- The role-checking functions (_is_admin / is_admin_me / judge_get_token /
-- admin_list_judges) already gate on exists(role = ...), so they work unchanged
-- with multiple rows per account. Only two things assumed one-role-per-account:
-- the account_roles PK (was account_id) and admin_set_judge's upsert/delete
-- (keyed on account_id alone) — both updated here. account_roles is currently
-- empty, so the PK change touches no data.

-- 1) composite PK so an account can hold multiple distinct roles ─────────────
do $$
declare v_pk text;
begin
  select conname into v_pk from pg_constraint
  where conrelid = 'public.account_roles'::regclass and contype = 'p';
  if v_pk is not null then
    execute format('alter table public.account_roles drop constraint %I', v_pk);
  end if;
end $$;
alter table public.account_roles add primary key (account_id, role);

-- 2) admin_set_judge: target the 'judge' role specifically so adding/removing a
--    judge leaves any other role (e.g. admin) on the same account intact.
create or replace function public.admin_set_judge(
  p_admin_secret text, p_email text, p_is_judge boolean, p_default_division_id text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if p_is_judge then
    insert into account_roles (account_id, role, default_division_id)
    values (v_uid, 'judge', p_default_division_id)
    on conflict (account_id, role) do update
      set default_division_id = excluded.default_division_id;
  else
    delete from account_roles where account_id = v_uid and role = 'judge';
  end if;
end; $function$;

-- 3) seed nackkrmt@gmail.com with BOTH admin + judge (mirrors the 0001 admin-seed
--    pattern; a no-op on a fresh DB until that account signs up).
insert into account_roles (account_id, role)
select u.id, r.role
from auth.users u
cross join (values ('admin'), ('judge')) as r(role)
where lower(u.email) = 'nackkrmt@gmail.com'
on conflict (account_id, role) do nothing;
