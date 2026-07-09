-- Fix: the tesuji_slips_admin_select storage policy (20260709_0001) called
-- _is_admin(null), but this project revokes default EXECUTE on functions —
-- `authenticated` cannot execute _is_admin (it is only ever called from inside
-- SECURITY DEFINER RPCs, where the executor is postgres). Evaluated directly in
-- a storage RLS policy it raises permission-denied, so every
-- /object/sign/tesuji-slips request returned 400 and admins could not view
-- refund slips.
--
-- Swap the policy to is_admin_me() — same account_roles check, SECURITY
-- DEFINER, and already granted to anon/authenticated (it gates the /admin UI).

drop policy if exists tesuji_slips_admin_select on storage.objects;
create policy tesuji_slips_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tesuji-slips' and public.is_admin_me());
