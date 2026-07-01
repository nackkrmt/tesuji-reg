-- Pre-deploy hardening #5 — payment slips out of the world-readable bucket.
-- Slips (payer name + partial bank details) were uploaded to the PUBLIC 'tesuji'
-- bucket and stored as permanent credential-free public URLs. Banners/rules PDFs
-- legitimately live in that public bucket, so slips move to a dedicated PRIVATE
-- bucket; the app stores only the object path and mints short-lived signed URLs
-- (admin viewing) / reads via the service role (verify-slip).

-- ── private bucket for slips ─────────────────────────────────────────────────
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

-- Uploaders are always signed in (submit flow). Insert only — NO select policy,
-- so objects are unreadable with the anon/authenticated key; only the service role
-- (verify-slip) and signed URLs (admin view) can read them.
drop policy if exists tesuji_slips_insert on storage.objects;
create policy tesuji_slips_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tesuji-slips');

-- ── size + type caps on the existing public bucket (banners / rules) ─────────
-- Was unlimited + any-mime (arbitrary large-file upload vector). Restrict to the
-- content actually served publicly: images (banners) + PDF (rules). No SVG (XSS).
update storage.buckets
  set file_size_limit = 10485760,   -- 10 MB
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
  where id = 'tesuji';
