-- 06_print_inventory: the PRIVATE `print-photos` Storage bucket + access policies
-- (R4). Version-controlled so the repo — not the Supabase dashboard — is the source
-- of truth for Storage configuration.
--
-- The bucket is PRIVATE (public = false): objects are never served via a public
-- URL. The application reads photos only through server-generated signed URLs
-- (lib/storage.ts createSignedUrl, TTL 3600s). Object keys are unguessable
-- (cuid-based), so even a leaked key is scoped to one print.
--
-- Access policies on storage.objects gate every operation on this bucket to the
-- `authenticated` role (defense-in-depth alongside the server-layer requireUser/
-- requireAdmin guards). Unauthenticated callers match no policy and therefore
-- cannot read, upload, replace, or delete photos (R4).
--
-- Idempotent: the bucket insert uses ON CONFLICT DO NOTHING, and each policy is
-- dropped-if-exists before (re)creation, so re-applying this migration against a
-- project that already has the bucket/policies is a no-op.

-- 1. Create the private bucket (idempotent).
INSERT INTO storage.buckets (id, name, public)
VALUES ('print-photos', 'print-photos', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Access policies on storage.objects scoped to this bucket, authenticated only.

DROP POLICY IF EXISTS "print_photos_select_authenticated" ON storage.objects;
CREATE POLICY "print_photos_select_authenticated"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'print-photos');

DROP POLICY IF EXISTS "print_photos_insert_authenticated" ON storage.objects;
CREATE POLICY "print_photos_insert_authenticated"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'print-photos');

DROP POLICY IF EXISTS "print_photos_update_authenticated" ON storage.objects;
CREATE POLICY "print_photos_update_authenticated"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'print-photos')
  WITH CHECK (bucket_id = 'print-photos');

DROP POLICY IF EXISTS "print_photos_delete_authenticated" ON storage.objects;
CREATE POLICY "print_photos_delete_authenticated"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'print-photos');
