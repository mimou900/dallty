-- Project 01: Business <-> Category many-to-many, plus category hierarchy support.
--
-- businesses.categories text[] stays exactly as-is (still read/written by existing
-- application code) -- this migration adds the relational join table alongside it as the
-- target model, backfilling what it can. Rewiring application code to read/write
-- business_categories instead of the text[] column is a follow-up task, not done here
-- (Project 01 is schema foundation, not a feature migration).

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON public.categories (parent_id) WHERE parent_id IS NOT NULL;

CREATE TABLE public.business_categories (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, category_id)
);
CREATE INDEX business_categories_category_id_idx ON public.business_categories (category_id);

ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.business_categories TO authenticated;
GRANT ALL ON public.business_categories TO service_role;

CREATE POLICY "business_categories_select" ON public.business_categories FOR SELECT USING (true);
CREATE POLICY "business_categories_manage" ON public.business_categories FOR ALL TO authenticated
  USING (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()));

-- Backfill from businesses.categories text[] (free-text values typed at onboarding --
-- see 20260805210502, which populated it from business_type), matched case-insensitively
-- against categories.default_name. No-op on the current (empty) businesses table.
-- Unmatched values are intentionally left unlinked (logged via NOTICE) rather than
-- auto-creating new categories -- category creation stays a Super-Admin action.
DO $$
DECLARE
  b record;
  cat_name text;
  matched_id uuid;
BEGIN
  FOR b IN SELECT id, categories FROM public.businesses WHERE categories IS NOT NULL AND cardinality(categories) > 0 LOOP
    FOREACH cat_name IN ARRAY b.categories LOOP
      SELECT id INTO matched_id FROM public.categories WHERE lower(default_name) = lower(trim(cat_name)) LIMIT 1;
      IF matched_id IS NOT NULL THEN
        INSERT INTO public.business_categories (business_id, category_id) VALUES (b.id, matched_id)
        ON CONFLICT DO NOTHING;
      ELSE
        RAISE NOTICE 'business_categories backfill: no category match for business % value %', b.id, cat_name;
      END IF;
    END LOOP;
  END LOOP;
END $$;
