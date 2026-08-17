-- Project 01: Branch foundation. A business can have multiple physical locations; today
-- the schema has no such entity (branch_count on businesses is cosmetic onboarding
-- metadata only). This adds business_branches as a standalone entity -- it is NOT wired
-- into services/staff/bookings/availability in this project (that requires touching the
-- booking/availability engine, explicitly out of scope for Project 01 -- see
-- DALLTY_IMPLEMENTATION_ROADMAP.md). Every existing business gets one auto-created "Main"
-- branch carrying over its current location fields, so the model is populated from day one
-- even before anything reads it.

CREATE TABLE public.business_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_main boolean NOT NULL DEFAULT false,
  address text,
  city text,
  region_id uuid REFERENCES public.regions(id),
  country_id uuid REFERENCES public.countries(id),
  phone text,
  latitude numeric,
  longitude numeric,
  timezone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX business_branches_business_id_idx ON public.business_branches (business_id);
CREATE INDEX business_branches_region_id_idx ON public.business_branches (region_id) WHERE region_id IS NOT NULL;
CREATE INDEX business_branches_country_id_idx ON public.business_branches (country_id) WHERE country_id IS NOT NULL;
CREATE UNIQUE INDEX business_branches_one_main_idx
  ON public.business_branches (business_id) WHERE is_main AND deleted_at IS NULL;

CREATE TRIGGER business_branches_touch_updated_at BEFORE UPDATE ON public.business_branches
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.business_branches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_branches TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.business_branches TO authenticated;
GRANT ALL ON public.business_branches TO service_role;

CREATE POLICY "business_branches_select" ON public.business_branches FOR SELECT
  USING (
    deleted_at IS NULL AND (
      status = 'active'
      OR public.owns_business(auth.uid(), business_id)
      OR public.is_platform_admin(auth.uid())
    )
  );
CREATE POLICY "business_branches_manage" ON public.business_branches FOR ALL TO authenticated
  USING (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()));

-- No-op on the current (empty) businesses table; correct for whenever it isn't.
INSERT INTO public.business_branches (business_id, name, is_main, address, city, phone, latitude, longitude, timezone, status)
SELECT b.id, 'Main', true, b.address, b.city, b.phone, b.latitude, b.longitude, b.timezone,
       CASE WHEN b.is_active THEN 'active' ELSE 'inactive' END
FROM public.businesses b
ON CONFLICT DO NOTHING;
