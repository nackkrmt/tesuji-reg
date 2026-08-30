-- Regenerate supabase/bootstrap/0001_dashboard_functions.sql.
--
-- Run against the production project (Supabase MCP `execute_sql`, or the SQL
-- editor). The CLI is blocked on the maintainer's machine, which is why this is
-- a query to paste rather than a pg_dump invocation.
--
-- 1. Which functions still live only in the database?
--    Compare this list against `grep -rhoiE 'create (or replace )?function
--    (public\.)?[a-z0-9_]+' supabase/migrations/`. Anything here but not there
--    belongs in bootstrap. (lib/rpc-coverage.test.ts enforces the same thing
--    from the other direction: every .rpc() the app calls must be defined
--    somewhere in the repo.)
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef                               as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname;

-- 2. The definitions themselves. Replace the name list with whatever step 1
--    showed as missing. Dump in batches if the result gets truncated — and
--    verify each batch: md5 of the text you saved must equal the md5 below.
--    That check is the difference between a bootstrap you can trust and one
--    that silently drifted a character during transcription.
with t as (
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.proname in ('...')  -- <- names from step 1
), agg as (
  select string_agg(def, E';\n\n' order by proname) as blob from t
)
select md5(blob) as md5, length(blob) as len, blob from agg;

-- 3. Grants, so the bootstrap reproduces the real privilege state rather than
--    whatever CREATE FUNCTION happens to default to.
select p.proname,
       coalesce(string_agg(g.grantee || ':' || g.privilege_type, ',' order by g.grantee), '(none)') as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join information_schema.routine_privileges g
       on g.specific_schema = 'public'
      and g.routine_name = p.proname
      and g.grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
where n.nspname = 'public' and p.prokind = 'f'
group by p.proname
order by p.proname;

-- 4. Whole-file check after reassembling. This must equal the md5 of the
--    concatenated definitions in the committed bootstrap file (see the
--    verification in lib/rpc-coverage.test.ts for the local half).
with t as (
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and p.proname in ('...')  -- <- same list as step 2
)
select count(*) as n, md5(string_agg(rtrim(def, E'\n'), E'\n' order by proname)) as md5_all
from t;
