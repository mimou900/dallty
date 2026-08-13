-- Business/Salon Terminology Rename: business-media Storage bucket.
-- The old salon-media bucket was created outside migration tracking
-- (confirmed: no CREATE/INSERT for it exists anywhere in supabase/migrations)
-- — creating the replacement via a tracked migration is a small improvement,
-- not just parity. Policies mirror the current salon-media ones exactly
-- (read-public-with-ownership-and-approval, owner-write), swapped to the new
-- bucket_id and to the businesses table.

INSERT INTO storage.buckets (id, name, public)
VALUES ('business-media', 'business-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Read business media"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'business-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE (b.owner_id)::text = (storage.foldername(objects.name))[1]
        AND b.marketplace_status = 'approved'
        AND b.is_active
    )
  )
);

CREATE POLICY "Owners upload business media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'business-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners update business media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'business-media' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'business-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners delete business media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'business-media' AND (storage.foldername(name))[1] = auth.uid()::text);
