-- Redesign per feedback on the initial Reference Data Foundation:
--   1) Replace fixed name_fr/name_ar columns with default_name + a
--      translations jsonb bag, so the Super Admin can add ANY language
--      later without a schema migration (matches the parent spec's own
--      "adding a language requires no code changes" goal).
--   2) Replace Algeria-specific wilayas/communes with a generic,
--      country-scoped Region -> City model. Algeria populates it as
--      Region=Wilaya, City=Commune; a future country (Spain, Canada,
--      Germany, ...) reuses the same two tables with its own hierarchy,
--      instead of a new table pair per country.

-- Countries: name -> default_name + translations
ALTER TABLE public.countries RENAME COLUMN name TO default_name;
ALTER TABLE public.countries ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';
UPDATE public.countries
  SET translations = jsonb_strip_nulls(jsonb_build_object('fr', name_fr, 'ar', name_ar));
ALTER TABLE public.countries DROP COLUMN name_fr;
ALTER TABLE public.countries DROP COLUMN name_ar;

-- Categories: same shape change
ALTER TABLE public.categories RENAME COLUMN name TO default_name;
ALTER TABLE public.categories ADD COLUMN translations jsonb NOT NULL DEFAULT '{}';
UPDATE public.categories
  SET translations = jsonb_strip_nulls(jsonb_build_object('fr', name_fr, 'ar', name_ar));
ALTER TABLE public.categories DROP COLUMN name_fr;
ALTER TABLE public.categories DROP COLUMN name_ar;

-- Drop the Algeria-specific administrative-division tables (child first).
DROP TABLE public.communes;
DROP TABLE public.wilayas;

-- Generic administrative divisions, scoped per country.
CREATE TABLE public.regions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id     uuid NOT NULL REFERENCES public.countries(id),
  code           text,
  default_name   text NOT NULL,
  translations   jsonb NOT NULL DEFAULT '{}',
  active         boolean NOT NULL DEFAULT true,
  UNIQUE (country_id, code)
);
CREATE INDEX regions_country_id_idx ON public.regions(country_id);

CREATE TABLE public.cities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id      uuid NOT NULL REFERENCES public.regions(id),
  default_name   text NOT NULL,
  translations   jsonb NOT NULL DEFAULT '{}',
  postal_code    text,
  active         boolean NOT NULL DEFAULT true
);
CREATE INDEX cities_region_id_idx ON public.cities(region_id);

GRANT SELECT ON public.regions, public.cities TO anon, authenticated;
GRANT ALL ON public.regions, public.cities TO service_role;

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regions_select" ON public.regions FOR SELECT USING (true);
CREATE POLICY "cities_select" ON public.cities FOR SELECT USING (true);
-- No write policy beyond service_role: seeded data, not edited via the app
-- (matches the wilayas/communes convention this replaces).
