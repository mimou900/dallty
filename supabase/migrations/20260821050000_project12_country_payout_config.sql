-- Project 12 Phase 6: country-specific payout field requirements (brief §45, §65). Confirmed
-- genuinely missing before this project: countries has no payout-requirement columns, and
-- the only existing country-scoping for money is payment_methods.country_id/
-- commission_rules.country_id, which scope WHICH methods/rates apply, not the richer
-- "what fields does a payout in this country need" (IBAN vs. a local bank/CCP number vs.
-- something else entirely). Shared by both staff payouts and affiliate payouts -- one table,
-- not a near-duplicate per feature, per the brief's own instruction not to invent redundant
-- config tables.
--
-- Reference data only: no UI or server function collects/stores an actual filled-in payout
-- profile in this project (no consumer yet -- staff/affiliate payouts today record a method
-- code, not per-country structured account details). This is deliberately capability
-- config only, not a KYC/payout-collection flow, matching the brief's own restraint
-- elsewhere ("prepare architecture... don't invent ahead of a consumer").
CREATE TABLE public.country_payout_requirements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id   uuid NOT NULL REFERENCES public.countries (id) ON DELETE CASCADE,
  field_key    text NOT NULL,
  field_label  text NOT NULL,
  required     boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX country_payout_requirements_country_field_idx
  ON public.country_payout_requirements (country_id, field_key);

ALTER TABLE public.country_payout_requirements ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.country_payout_requirements TO anon, authenticated;
GRANT ALL ON public.country_payout_requirements TO service_role;
CREATE POLICY "country_payout_requirements_select" ON public.country_payout_requirements
  FOR SELECT USING (true);
CREATE POLICY "country_payout_requirements_write" ON public.country_payout_requirements
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- Seed Algeria's real requirements (the brief's own worked example: CCP/RIB, not an
-- Algeria-only IBAN assumption) as the one concrete instance this table needs to prove out
-- the general shape -- any future country adds rows here, no code change required.
INSERT INTO public.country_payout_requirements (country_id, field_key, field_label, required, sort_order)
SELECT c.id, x.field_key, x.field_label, x.required, x.sort_order
FROM public.countries c
CROSS JOIN (VALUES
  ('ccp_account', 'CCP account number', true, 1),
  ('ccp_key', 'CCP key (clé)', true, 2),
  ('rib', 'RIB (bank account)', false, 3),
  ('account_holder_name', 'Account holder name', true, 4)
) AS x(field_key, field_label, required, sort_order)
WHERE c.iso_code = 'DZ'
ON CONFLICT DO NOTHING;
