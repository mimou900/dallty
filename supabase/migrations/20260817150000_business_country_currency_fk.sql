-- Project 01: close the gap flagged in the Project 00 audit -- businesses.country_code
-- and businesses.currency were plain free-text columns, not foreign keys into the
-- countries/currencies reference-data tables built specifically to be their source of
-- truth (Project "Reference Data Foundation", 2026-08-13). This adds the missing FKs.
-- No backfill/validation UPDATE is needed: the live businesses table is currently empty
-- (Project 00 cleared test data), and both existing default values ('AE'/'AED', a
-- leftover from an earlier Gulf-market iteration) resolve to real rows in countries/
-- currencies, so the constraint addition itself cannot fail even if it ran against
-- pre-existing data.

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_country_code_fkey FOREIGN KEY (country_code) REFERENCES public.countries (iso_code),
  ADD CONSTRAINT businesses_currency_fkey FOREIGN KEY (currency) REFERENCES public.currencies (code);

CREATE INDEX IF NOT EXISTS businesses_country_code_idx ON public.businesses (country_code);
CREATE INDEX IF NOT EXISTS businesses_currency_idx ON public.businesses (currency);

-- Align the defaults with the actual launch market (Algeria) and with the fallback
-- already hardcoded in src/lib/reference-data.tsx (FALLBACK_COUNTRY). Only affects future
-- inserts -- no existing row is touched.
ALTER TABLE public.businesses ALTER COLUMN country_code SET DEFAULT 'DZ';
ALTER TABLE public.businesses ALTER COLUMN currency SET DEFAULT 'DZD';
ALTER TABLE public.businesses ALTER COLUMN timezone SET DEFAULT 'Africa/Algiers';
