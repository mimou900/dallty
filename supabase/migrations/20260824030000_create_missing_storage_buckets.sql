-- The `avatars` and `review-photos` storage.objects RLS policies (see the earlier project
-- that added them) were written against buckets that were never actually created in
-- storage.buckets — every upload to either has been failing with "Bucket not found" since
-- the day those features shipped (profile.tsx's avatar upload, business-reviews.tsx's
-- review-photo upload). Policies without the bucket are dead code; this creates the two
-- missing buckets so those policies finally apply to something.
--
-- Private (not public) like business-media, read only via signed URL — matches this app's
-- one established pattern for user-uploaded media. MIME allowlist covers what the client
-- can actually produce: profile.tsx re-encodes every avatar to image/webp client-side
-- before upload (see src/lib/image-upload.ts), and heic/heif is allowed for any path that
-- still hands over an original iPhone photo unprocessed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', false, 8388608,
   ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('review-photos', 'review-photos', false, 8388608,
   ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO NOTHING;
