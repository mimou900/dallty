-- Hardening for the Business Slugs system (20260814070000_business_slugs.sql),
-- addressing three review findings:
--
-- 1. business_slug_redirects.business_id was ON DELETE CASCADE, which
--    contradicts "redirect history is permanent" -- deleting a business
--    would silently wipe its redirect history. No code path currently
--    hard-deletes a business, but the constraint should say what's actually
--    intended: deleting a business with redirect history must be an
--    explicit, blocked operation, not a silent cascade.
--
-- 2. business_slug_redirects_old_slug_idx was case-sensitive, unlike
--    businesses.slug (which has both an exact-match UNIQUE constraint and a
--    lower(slug) index). Two case-variant retirements of the same slug
--    could otherwise coexist even though the app treats slugs as
--    case-insensitive throughout (ilike checks, case-insensitive redirect
--    resolution).
--
-- 3. The two cross-table uniqueness triggers (a slug can't be simultaneously
--    live in businesses.slug and retired in business_slug_redirects.old_slug)
--    each do a plain SELECT against the other table. Under concurrent
--    transactions this is a classic TOCTOU race: two transactions can both
--    pass the check before either commits. A per-slug advisory lock, taken
--    at the top of both trigger functions and keyed by the same value
--    (lower of the slug being written), serializes any two transactions
--    contending for the same slug string -- pg_advisory_xact_lock
--    auto-releases at COMMIT/ROLLBACK, so there's no separate unlock step
--    to forget. Different slugs never contend with each other.

ALTER TABLE public.business_slug_redirects
  DROP CONSTRAINT business_slug_redirects_business_id_fkey,
  ADD CONSTRAINT business_slug_redirects_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX business_slug_redirects_old_slug_lower_idx
  ON public.business_slug_redirects (lower(old_slug));

CREATE OR REPLACE FUNCTION public.check_business_slug_not_retired() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(lower(NEW.slug)));
    IF EXISTS (
      SELECT 1 FROM public.business_slug_redirects WHERE lower(old_slug) = lower(NEW.slug)
    ) THEN
      RAISE EXCEPTION 'slug "%" is retired and cannot be reused', NEW.slug;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_redirect_slug_not_live() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(lower(NEW.old_slug)));
  IF EXISTS (SELECT 1 FROM public.businesses WHERE lower(slug) = lower(NEW.old_slug)) THEN
    RAISE EXCEPTION 'slug "%" is currently live and cannot be retired under a different business', NEW.old_slug;
  END IF;
  RETURN NEW;
END;
$$;
