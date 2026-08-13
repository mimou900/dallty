DROP POLICY IF EXISTS "Read salon media" ON storage.objects;

CREATE POLICY "Read salon media"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'salon-media'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.salons s
      WHERE s.owner_id::text = (storage.foldername(name))[1]
        AND s.status = 'approved'
        AND s.is_active
    )
  )
);