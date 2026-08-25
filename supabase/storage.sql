-- TaxHelper — proof attachment storage.
--
-- Split out of schema.sql because the storage section is the part most likely
-- to fail: on some projects the SQL editor's role does not own
-- `storage.objects`, and creating policies on it raises
--   ERROR: 42501: must be owner of table objects
-- If that happens, use the Dashboard fallback at the bottom of this file.
--
-- Run this in: SQL Editor → New query → paste → Run.

-- ─── 1. the bucket ─────────────────────────────────────────────────────────
-- Private. 10 MB per file. Only raster images and PDFs — SVG is deliberately
-- excluded because it is scriptable (see src/data/files.js).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proof', 'proof', false, 10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 2. access policies ────────────────────────────────────────────────────
-- Objects are stored at "<user_id>/<attachment_id>", so the first path segment
-- is the ownership check: you can only touch files under your own user id.
drop policy if exists "proof_own_select" on storage.objects;
drop policy if exists "proof_own_insert" on storage.objects;
drop policy if exists "proof_own_update" on storage.objects;
drop policy if exists "proof_own_delete" on storage.objects;

create policy "proof_own_select" on storage.objects for select to authenticated
  using (bucket_id = 'proof' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "proof_own_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'proof' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "proof_own_update" on storage.objects for update to authenticated
  using (bucket_id = 'proof' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'proof' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "proof_own_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'proof' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── 3. verify ─────────────────────────────────────────────────────────────
-- Expect one row: proof | public = false
select id, name, public, file_size_limit
from storage.buckets
where id = 'proof';

-- Expect four rows, all named proof_own_*
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'proof_%'
order by policyname;


-- ═══════════════════════════════════════════════════════════════════════════
-- FALLBACK — if step 1 or 2 above raised a permissions error
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Create the bucket through the Dashboard instead:
--
--   Storage → New bucket
--     Name:                    proof
--     Public bucket:           OFF  ← this matters most
--     Restrict file size:      10 MB
--     Allowed MIME types:      image/png, image/jpeg, image/webp, image/heic,
--                              image/heif, application/pdf
--
-- Then add the four policies through the Dashboard:
--
--   Storage → Policies → proof → New policy → "For full customization"
--
--   Repeat four times, once per operation (SELECT, INSERT, UPDATE, DELETE),
--   each targeting the `authenticated` role, using this expression:
--
--     bucket_id = 'proof' AND (storage.foldername(name))[1] = auth.uid()::text
--
--   For INSERT put it in the WITH CHECK box; for UPDATE put it in both boxes.
--
-- Run `npm run verify` afterwards to confirm the bucket exists and is private.
--
-- NOTE: the app works without this. Attachments fall back to local-only
-- storage — you keep your evidence on the device you logged it from, it just
-- does not follow you to another device.
