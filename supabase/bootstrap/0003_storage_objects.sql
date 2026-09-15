-- Storage buckets and their policies, recovered from production.
--
-- The public 'tesuji' bucket and every storage.objects policy on it were
-- created through the Supabase dashboard and live in no migration.
-- schema-baseline.sql claims to capture the RLS posture but contains no
-- `storage` at all, and 20260701_0005 only *updates* bucket 'tesuji' (a no-op
-- on a project where it does not exist). So a fresh environment came up with
-- no public bucket: every banner and venue-map upload failed, and the audit
-- could not see from the repo that the real policy let anyone upload.
--
-- Captured from project ytgbimtjayecaxfyssta on 2026-09-15, stated as the
-- posture AFTER 20260915_0001_storage_and_grant_hardening.sql — not the open
-- policy prod ran until then. Part of the fresh-environment bootstrap:
-- schema-baseline → bootstrap → migrations. Production already has all of
-- this; do not apply it there.
--
-- Ownership note: storage.objects belongs to supabase_storage_admin, so the
-- policy statements below must be run by a role that can create policies on
-- it — the dashboard SQL editor, or the migration runner (both do, verified:
-- 20260701_0005 created tesuji_slips_insert this way).

-- ── buckets ──────────────────────────────────────────────────────────────────
-- 'tesuji' is PUBLIC on purpose: banners, venue maps and the rules PDF are
-- served straight from its public URL, and lib/data/SupabaseDataLayer.ts
-- stores that URL on the tournament row. The caps are 20260701_0005's — 10 MB,
-- images + PDF, deliberately no SVG (it executes script when served inline).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tesuji', 'tesuji', true,
  10485760,  -- 10 MB
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 'tesuji-slips' is created by 20260701_0005 and re-stated here so the two
-- buckets can be reviewed side by side. PRIVATE: no SELECT policy for the
-- anon/authenticated key at all — verify-slip reads slips with the service
-- role and admins view them through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tesuji-slips', 'tesuji-slips', false,
  5242880,   -- 5 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── policies on the public bucket ────────────────────────────────────────────
-- Reads need no policy: a public bucket is served without RLS. The only
-- legitimate writer is an admin in upsertTournament (banners/, venue-maps/),
-- which is the whole condition — see 20260915_0001 §1 for what the dashboard
-- policy allowed instead.
drop policy if exists tesuji_admin_insert on storage.objects;
create policy tesuji_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tesuji' and public.is_admin_me());

drop policy if exists tesuji_admin_delete on storage.objects;
create policy tesuji_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tesuji' and public.is_admin_me());

-- ── policies on the private slip bucket ──────────────────────────────────────
-- One folder per uploader: an account may only write under `<its own uid>/`.
-- Nothing else may write, and nothing at all may read with the publishable
-- key except an admin.
drop policy if exists tesuji_slips_insert on storage.objects;
create policy tesuji_slips_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tesuji-slips'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists tesuji_slips_admin_select on storage.objects;
create policy tesuji_slips_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'tesuji-slips' and public.is_admin_me());

drop policy if exists tesuji_slips_admin_delete on storage.objects;
create policy tesuji_slips_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tesuji-slips' and public.is_admin_me());

-- ── what is still NOT in this repo ───────────────────────────────────────────
-- A rebuilt environment also needs these, and none of them is SQL:
--   • Auth: 'Confirm email' off, site_url + redirect URLs, leaked-password
--     protection (README line 172 already says the first is manual).
--   • Edge function verify_jwt flags — supabase/config.toml has no
--     [functions.*] sections, so the CLI deploys them with the default.
--   • Secrets: SLIPOK_* for verify-slip.
--   • supabase/config.toml has [db.migrations] enabled = false, so
--     `supabase db push` / `db reset` applies nothing at all.
-- They are listed here because this file is where somebody rebuilding will
-- look for "what else is only in the dashboard"; the fixes belong in
-- config.toml and docs/DEV-SETUP.md.
