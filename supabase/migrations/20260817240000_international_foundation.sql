-- Project 04: international foundation. Extends the existing reference-data system
-- (countries/currencies/regions/cities, all already generic and country-agnostic per
-- Project 00's audit) rather than recreating it — no countries_v2/regions_v2, no second
-- geography system.

-- ============================================================
-- 1. Marketplace visibility, distinct from reference-data existence (brief §2-3, §17, §53)
-- ============================================================
-- "Country exists in the reference system" and "country's marketplace is browsable" are
-- different facts today conflated into a single `active` column. Algeria is the only
-- marketplace-enabled country at launch; every other seeded country stays a valid
-- reference-data row (usable for e.g. a future business's billing country, or a customer's
-- phone country code) without appearing in marketplace search/browse.
ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS marketplace_enabled boolean NOT NULL DEFAULT false;
UPDATE public.countries SET marketplace_enabled = true WHERE iso_code = 'DZ';
CREATE INDEX IF NOT EXISTS countries_marketplace_enabled_idx ON public.countries (marketplace_enabled) WHERE marketplace_enabled;

-- ============================================================
-- 2. Administrative level labels (brief §12-13)
-- ============================================================
-- What a country calls its administrative levels varies (Algeria: Wilaya/Commune; France:
-- Région/Département/Commune) but the existing regions->cities model is a fixed 2-level
-- hierarchy (region = level 1, city = level 2) for every country using it today. This adds
-- the per-country LABEL for those two levels -- it does NOT restructure regions/cities into
-- an N-level tree, which would be a much larger migration touching the already-seeded 69
-- regions + 1541 cities and every consumer of those tables. Extending past 2 levels is
-- explicitly out of scope for this project (documented, not silently assumed solved).
CREATE TABLE public.administrative_levels (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id     uuid NOT NULL REFERENCES public.countries (id) ON DELETE CASCADE,
  level_number   smallint NOT NULL CHECK (level_number IN (1, 2)),
  default_name   text NOT NULL,
  translations   jsonb NOT NULL DEFAULT '{}',
  active         boolean NOT NULL DEFAULT true,
  UNIQUE (country_id, level_number)
);
CREATE INDEX administrative_levels_country_id_idx ON public.administrative_levels (country_id);

ALTER TABLE public.administrative_levels ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.administrative_levels TO anon, authenticated;
GRANT ALL ON public.administrative_levels TO service_role;
CREATE POLICY "administrative_levels_select" ON public.administrative_levels FOR SELECT USING (true);
CREATE POLICY "administrative_levels_write" ON public.administrative_levels FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- Seed Algeria's labels (the only marketplace-enabled country today).
INSERT INTO public.administrative_levels (country_id, level_number, default_name, translations)
SELECT id, 1, 'Wilaya', '{"fr": "Wilaya", "ar": "ولاية"}'::jsonb FROM public.countries WHERE iso_code = 'DZ'
UNION ALL
SELECT id, 2, 'Commune', '{"fr": "Commune", "ar": "بلدية"}'::jsonb FROM public.countries WHERE iso_code = 'DZ'
ON CONFLICT (country_id, level_number) DO NOTHING;

-- ============================================================
-- 3. Business country immutability (brief §33)
-- ============================================================
-- Extends the existing guard_business_marketplace() trigger (already blocks non-admin
-- edits to is_verified/marketplace_status/plan/status on businesses) rather than adding a
-- second trigger -- country_code joins the same "only Super Admin can change this,
-- ordinary owners cannot" list. Reproduces the function's exact current body (confirmed by
-- reading its live definition before editing) with one new IF block; no other behavior
-- changes.
CREATE OR REPLACE FUNCTION public.guard_business_marketplace()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_platform_admin(auth.uid()) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    RAISE EXCEPTION 'Only the Dallty team can change verification';
  END IF;
  IF NEW.marketplace_status IS DISTINCT FROM OLD.marketplace_status
     AND NEW.marketplace_status NOT IN ('draft','pending_review','hidden') THEN
    RAISE EXCEPTION 'Only the Dallty team can approve or reject a business';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only the Dallty team can change business status';
  END IF;
  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.marketplace_note IS DISTINCT FROM OLD.marketplace_note THEN
    RAISE EXCEPTION 'Only the Dallty team can change review fields';
  END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
    RAISE EXCEPTION 'Only the Dallty team can change plan/trial';
  END IF;
  IF NEW.country_code IS DISTINCT FROM OLD.country_code THEN
    RAISE EXCEPTION 'Only the Dallty team can change a business''s country';
  END IF;
  IF NEW.is_listed IS DISTINCT FROM OLD.is_listed AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'is_listed is computed automatically and cannot be set directly';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. Account country vs detected country vs marketplace country (brief §5-6)
-- ============================================================
-- profiles.country_code (added 20260731231556) is already the ACCOUNT country. This adds
-- DETECTED country as a genuinely separate, non-overwriting field -- foundation only, no IP
-- geolocation service is wired up anywhere in this codebase (none existed before this
-- project and none is added now; that's a real external-infrastructure dependency, not
-- something to fake). MARKETPLACE country is not a stored field at all -- for this project,
-- with exactly one marketplace-enabled country, it is definitionally Algeria; the schema
-- readiness for a future per-session/per-request marketplace-country selection is the
-- marketplace_enabled column above, not a new profiles column (nothing to store yet for a
-- guest with no session).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS detected_country_code text;

-- ============================================================
-- 5. Country isolation for the public marketplace (brief §32, §34)
-- ============================================================
-- The public business-read policy already existed (gates on marketplace_status='approved'
-- AND is_active AND deleted_at IS NULL) but never checked country marketplace-eligibility --
-- moot until this project, since only Algeria businesses have ever existed, but a real gap
-- now that marketplace_enabled exists as a concept. Exact current body confirmed by reading
-- the live policy (supabase/migrations/20260817160000_soft_deletion_foundation.sql) before
-- editing -- DROP+CREATE with the same name, one new AND clause added.
DROP POLICY IF EXISTS "Public reads approved salons" ON public.businesses;
CREATE POLICY "Public reads approved salons" ON public.businesses
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL AND (
      (
        is_active AND marketplace_status = 'approved'
        AND EXISTS (
          SELECT 1 FROM public.countries c
          WHERE c.iso_code = businesses.country_code AND c.marketplace_enabled
        )
      )
      OR owner_id = auth.uid()
      OR public.is_platform_admin(auth.uid())
    )
  );
