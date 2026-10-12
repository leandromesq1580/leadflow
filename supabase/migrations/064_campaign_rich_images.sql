-- Only campaign artwork is public. Lead documents/recordings remain untouched.
-- Apply only with production authorization; no campaign/email/contact writes.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('campaign-images','campaign-images',true,3145728,ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='campaign-images' AND public=true AND file_size_limit=3145728 AND allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','image/gif']) THEN
  RAISE EXCEPTION 'campaign_images_bucket_configuration_conflict';
 END IF;
END $$;
-- Restrictive rules survive any existing broad permissive policy. Only the server's
-- service_role (BYPASSRLS) may write via the authenticated admin upload endpoint.
CREATE POLICY campaign_images_server_insert ON storage.objects AS RESTRICTIVE
 FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'campaign-images');
CREATE POLICY campaign_images_server_update ON storage.objects AS RESTRICTIVE
 FOR UPDATE TO anon,authenticated USING(bucket_id<>'campaign-images') WITH CHECK(bucket_id<>'campaign-images');
CREATE POLICY campaign_images_server_delete ON storage.objects AS RESTRICTIVE
 FOR DELETE TO anon,authenticated USING(bucket_id<>'campaign-images');
COMMIT;
