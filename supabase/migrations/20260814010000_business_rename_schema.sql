-- Business/Salon Terminology Rename, migration 1 of 4: table, column,
-- constraint, and index renames.
--
-- Postgres auto-propagates ALTER TABLE RENAME TO / RENAME COLUMN into every
-- dependent RLS policy's stored qual/with_check (policies are compiled
-- expression trees keyed by relid/attnum, not text) and into every
-- dependent index/constraint expression. Verified empirically against this
-- database before writing this migration: a scratch table+policy+function
-- was renamed and pg_policies showed the new names with no DROP/CREATE
-- POLICY needed. Only raw function bodies (stored as text) need a manual
-- rewrite — that happens in migration 3.
--
-- Order matters for the later migrations in this set, not this one: this
-- file must land before migration 3 (function body rewrites reference the
-- new table/column names) and before migration 4 (cosmetic policy renames
-- read the post-rename catalog).

ALTER TABLE public.salons RENAME TO businesses;
ALTER TABLE public.salon_gallery RENAME TO business_gallery;
ALTER TABLE public.salon_hours RENAME TO business_hours;

ALTER TABLE public.services RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.staff RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.bookings RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.reviews RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.business_gallery RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.business_hours RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.recently_viewed RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.waitlist_entries RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.promotions RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.staff_join_requests RENAME COLUMN salon_id TO business_id;

-- Constraints (cosmetic from here down — the renames above already made
-- every policy/index functionally correct; this just keeps \d+ output and
-- error messages readable for whoever reads the schema next). Renaming a
-- PRIMARY KEY/UNIQUE/FOREIGN KEY constraint also renames its backing index
-- in the same statement.
ALTER TABLE public.businesses RENAME CONSTRAINT salons_pkey TO businesses_pkey;
ALTER TABLE public.business_gallery RENAME CONSTRAINT salon_gallery_pkey TO business_gallery_pkey;
ALTER TABLE public.business_hours RENAME CONSTRAINT salon_hours_pkey TO business_hours_pkey;
ALTER TABLE public.bookings RENAME CONSTRAINT bookings_salon_id_fkey TO bookings_business_id_fkey;
ALTER TABLE public.promotions RENAME CONSTRAINT promotions_salon_id_fkey TO promotions_business_id_fkey;
ALTER TABLE public.recently_viewed RENAME CONSTRAINT recently_viewed_salon_id_fkey TO recently_viewed_business_id_fkey;
ALTER TABLE public.recently_viewed RENAME CONSTRAINT recently_viewed_user_id_salon_id_key TO recently_viewed_user_id_business_id_key;
ALTER TABLE public.reviews RENAME CONSTRAINT reviews_salon_id_fkey TO reviews_business_id_fkey;
ALTER TABLE public.business_gallery RENAME CONSTRAINT salon_gallery_salon_id_fkey TO business_gallery_business_id_fkey;
ALTER TABLE public.business_hours RENAME CONSTRAINT salon_hours_salon_id_fkey TO business_hours_business_id_fkey;
ALTER TABLE public.business_hours RENAME CONSTRAINT salon_hours_salon_id_weekday_key TO business_hours_business_id_weekday_key;
ALTER TABLE public.services RENAME CONSTRAINT services_salon_id_fkey TO services_business_id_fkey;
ALTER TABLE public.staff RENAME CONSTRAINT staff_salon_id_fkey TO staff_business_id_fkey;
ALTER TABLE public.staff_join_requests RENAME CONSTRAINT staff_join_requests_salon_id_fkey TO staff_join_requests_business_id_fkey;
ALTER TABLE public.waitlist_entries RENAME CONSTRAINT waitlist_entries_salon_id_fkey TO waitlist_entries_business_id_fkey;

-- Bare indexes (not backed by a table constraint, so they need their own
-- ALTER INDEX rather than being covered by a constraint rename above).
ALTER INDEX public.idx_reviews_salon RENAME TO idx_reviews_business;
ALTER INDEX public.idx_salon_gallery_salon RENAME TO idx_business_gallery_business;
ALTER INDEX public.promotions_salon_code_key RENAME TO promotions_business_code_key;
ALTER INDEX public.staff_join_requests_salon_idx RENAME TO staff_join_requests_business_idx;
