-- Reference Data Foundation: Currencies, Countries, Categories, and
-- Algeria's administrative divisions (Wilaya -> Commune), all
-- Super-Admin-managed instead of hardcoded in the frontend.

CREATE TABLE public.currencies (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  symbol          text NOT NULL,
  decimal_digits  smallint NOT NULL DEFAULT 2,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.countries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_code       text NOT NULL UNIQUE,
  name           text NOT NULL,
  name_fr        text NOT NULL,
  name_ar        text NOT NULL,
  currency_code  text NOT NULL REFERENCES public.currencies(code),
  calling_code   text NOT NULL,
  timezone       text NOT NULL,
  flag           text NOT NULL,
  display_order  int NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  name_fr        text NOT NULL,
  name_ar        text NOT NULL,
  icon           text NOT NULL,
  image_url      text,
  description    text,
  display_order  int NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wilayas (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code    text NOT NULL UNIQUE,
  name    text NOT NULL,
  name_ar text NOT NULL,
  active  boolean NOT NULL DEFAULT true
);

CREATE TABLE public.communes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wilaya_id    uuid NOT NULL REFERENCES public.wilayas(id),
  name         text NOT NULL,
  name_ar      text NOT NULL,
  postal_code  text,
  active       boolean NOT NULL DEFAULT true
);
CREATE INDEX communes_wilaya_id_idx ON public.communes(wilaya_id);

-- Grants: public reference data, readable by anyone (signed in or not).
GRANT SELECT ON public.currencies, public.countries, public.categories, public.wilayas, public.communes TO anon, authenticated;
GRANT ALL ON public.currencies, public.countries, public.categories, public.wilayas, public.communes TO service_role;

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wilayas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "currencies_select" ON public.currencies FOR SELECT USING (true);
CREATE POLICY "currencies_write" ON public.currencies FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "countries_select" ON public.countries FOR SELECT USING (true);
CREATE POLICY "countries_write" ON public.countries FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_write" ON public.categories FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "wilayas_select" ON public.wilayas FOR SELECT USING (true);
CREATE POLICY "communes_select" ON public.communes FOR SELECT USING (true);
-- No write policy for wilayas/communes beyond service_role: seeded once, not edited via the app.
