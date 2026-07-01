-- Pre-deploy hardening #6 — admin single-batch read path.
-- get_batch_public is now owner-only (migration 0001), which is correct for the
-- registrant's payment screen but breaks the admin RegistrationDetail view (the
-- admin is not the batch owner). Give admins their own secret-gated getter that
-- returns the full batch JSON, matching the other admin RPCs.
create or replace function public.admin_get_batch(p_admin_secret text, p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return _batch_json(p_batch_id);
end; $function$;

grant execute on function public.admin_get_batch(text, uuid) to anon, authenticated;
