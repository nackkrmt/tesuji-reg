-- Judge role: ties a reg-app account (auth.users) to judge access, so the home
-- page can show a "ระบบส่งผล" button and the judge console can auto-fill the
-- submitter's real first name + a default รุ่น, instead of everyone sharing the
-- anonymous /judge/<live_token> link with a manually-typed nickname.
--
-- Admin still gates everything with the admin passphrase (_is_admin), same as
-- every other admin RPC in this codebase — this just adds who's a judge.

create table if not exists public.account_roles (
  account_id          uuid primary key references auth.users(id) on delete cascade,
  role                text not null default 'judge' check (role = 'judge'),
  default_division_id text references public.live_division(id) on delete set null,
  created_at          timestamptz not null default now()
);

alter table public.account_roles enable row level security;

-- Judges can read their own row (used to show the button + resolve their
-- default รุ่น) — never anyone else's.
drop policy if exists account_roles_self_read on public.account_roles;
create policy account_roles_self_read on public.account_roles
  for select to authenticated using (account_id = auth.uid());

-- ── Admin: grant/revoke the judge role + set a default รุ่น, by email ─────────
-- The account must already exist (signed up via the normal reg-app login) —
-- this only assigns a role to it, it doesn't create accounts.
create or replace function public.admin_set_judge(
  p_admin_secret text,
  p_email text,
  p_is_judge boolean,
  p_default_division_id text default null
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare v_uid uuid;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  if p_is_judge then
    insert into account_roles (account_id, role, default_division_id)
    values (v_uid, 'judge', p_default_division_id)
    on conflict (account_id) do update
      set default_division_id = excluded.default_division_id;
  else
    delete from account_roles where account_id = v_uid;
  end if;
end; $$;

-- ── Admin: list current judges (email + Thai first name + default รุ่น) ───────
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
    order by u.email;
end; $$;

-- ── Judge: read the shared live_token, gated by holding the role (not a secret)
-- Lets the home-page button build the /judge/<token> link without exposing the
-- admin-only live_get_token RPC to non-admins.
create or replace function public.judge_get_token()
returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v_token text;
begin
  if not exists (select 1 from account_roles where account_id = auth.uid()) then
    raise exception 'UNAUTHORIZED';
  end if;
  select value into v_token from app_config where key = 'live_token';
  return v_token;
end; $$;

grant execute on function
  public.admin_set_judge(text, text, boolean, text),
  public.admin_list_judges(text)
to anon, authenticated;

grant execute on function public.judge_get_token() to authenticated;
