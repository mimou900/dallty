-- Project 03: enforce upload size/type limits at the Supabase Storage bucket level.
--
-- Found in this project's security audit: every upload path in the app (src/lib/storage.ts,
-- called directly from the browser with the user's own session -- there is no server-side
-- upload proxy) validates file size/type in client-side JS only, and two upload surfaces
-- (specialist portfolio, business gallery raw <input> pickers) have no size check at all.
-- Client-side validation is trivially bypassed (a modified client, or calling the Supabase
-- Storage REST API directly with a valid JWT, skips it completely) -- `file.type` itself is
-- browser-reported and spoofable.
--
-- Setting `file_size_limit`/`allowed_mime_types` on the bucket is enforced by Supabase
-- Storage itself server-side, on every upload regardless of how the request was made. This
-- is the most robust fix available without adding an image-processing dependency (no
-- sharp/jimp/etc. exists in this project, and the Master Architecture explicitly says not
-- to add unnecessary dependencies) -- it doesn't validate pixel dimensions or magic bytes,
-- but it closes the "completely unbounded" gap that mattered most.
--
-- `avatars` and `review-photos` were created outside migration tracking (confirmed in the
-- Project 00 audit -- no CREATE/INSERT for them exists in this migration history), but
-- their bucket rows already exist, so UPDATE reaches them the same as any other bucket.

UPDATE storage.buckets
SET file_size_limit = 10485760, -- 10 MB, matching this app's existing 5MB client-side
                                 -- soft check with headroom rather than a hard cliff
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id IN ('business-media', 'avatars', 'review-photos');
