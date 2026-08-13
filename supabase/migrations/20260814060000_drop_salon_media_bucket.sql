-- Business/Salon Terminology Rename: remove the old salon-media Storage
-- policies now that Task 7's verification confirmed every object was
-- copied and every stored URL rewritten to point at business-media.
--
-- The bucket and its objects are NOT dropped here — Supabase blocks direct
-- SQL DELETE against storage.objects/storage.buckets ("Direct deletion
-- from storage tables is not allowed. Use the Storage API instead."),
-- discovered live while writing this migration. That part of the cleanup
-- was done with a one-off Storage-API script (admin.storage.from(...).
-- remove(paths) + admin.storage.deleteBucket("salon-media")), run once and
-- not committed — the same way the original salon-media bucket's creation
-- was never migration-tracked either (confirmed: no CREATE/INSERT for it
-- exists anywhere in this migrations directory). By the time this file
-- runs on a fresh environment, the bucket won't exist there in the first
-- place, so there is nothing to delete.

DROP POLICY IF EXISTS "Read salon media" ON storage.objects;
DROP POLICY IF EXISTS "Owners upload salon media" ON storage.objects;
DROP POLICY IF EXISTS "Owners update salon media" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete salon media" ON storage.objects;
