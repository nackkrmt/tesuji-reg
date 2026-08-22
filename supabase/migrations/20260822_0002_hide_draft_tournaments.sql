-- ── Hide draft tournaments from the public ──────────────────────────────────
-- The multi-tournament home page lists every row the client can read, which
-- made the old `using (true)` read policies an actual leak: a draft's name,
-- banner, PromptPay target, schedule/rules JSON and its categories' fees were
-- readable by any anonymous visitor (the UI only hid them cosmetically).
--
-- Admins keep seeing drafts everywhere: is_admin_me() (SECURITY DEFINER,
-- 20260705_0001) checks account_roles for the CALLING session, and admin
-- pages query through the user's authenticated Supabase client.
-- Edge functions use the service role and bypass RLS entirely.

drop policy if exists tournament_public_read on tournament;
create policy tournament_public_read on tournament
  for select to anon, authenticated
  using (status <> 'draft' or is_admin_me());

-- Categories inherit their tournament's visibility: the subquery runs under
-- the caller's own RLS, so a draft tournament (invisible above) makes its
-- categories invisible too.
drop policy if exists category_public_read on category;
create policy category_public_read on category
  for select to anon, authenticated
  using (
    exists (select 1 from tournament t where t.id = category.tournament_id)
  );
