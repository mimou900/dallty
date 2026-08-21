-- Project 12 Phase 4-5: affiliate tables + business referrals. Both genuinely zero before
-- this project (confirmed by repo-wide grep). Business referrals (brief §46) intentionally
-- separate from affiliates (§42) -- one is a person referring businesses to Dallty on an
-- ongoing commission basis, the other is a business referring another business a single time
-- for a one-off Dallty-balance credit.

-- ============================================================
-- 1. Affiliates. Auto-approved on creation (brief §42 -- "automatically approved
-- initially"); Super Admin can suspend/ban afterward via status. One row per user_id.
-- ============================================================
CREATE TABLE public.affiliates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliates_user_id_idx ON public.affiliates (user_id);
CREATE INDEX affiliates_referral_code_idx ON public.affiliates (referral_code);

CREATE TRIGGER affiliates_touch_updated_at BEFORE UPDATE ON public.affiliates
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.affiliates TO authenticated;
GRANT ALL ON public.affiliates TO service_role;
CREATE POLICY "affiliates_select_own" ON public.affiliates FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

-- ============================================================
-- 2. Affiliate commission rules -- mirrors commission_rules' precedence shape (brief §34:
-- do not invent a conflicting hierarchy). affiliate_id NULL = a default rule; country_id
-- NULL = country-agnostic; plan_key/campaign_key NULL = applies to any plan/campaign.
-- Resolution order (most to least specific), implemented in application code rather than a
-- single SQL function since the "most specific of N optional dimensions" comparison reads
-- more clearly there: affiliate+country+plan+campaign -> affiliate-only -> country+plan ->
-- country-only -> global default.
-- ============================================================
CREATE TABLE public.affiliate_commission_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    uuid REFERENCES public.affiliates (id) ON DELETE CASCADE,
  country_id      uuid REFERENCES public.countries (id),
  plan_key        text,
  campaign_key    text,
  rate_type       text NOT NULL CHECK (rate_type IN ('fixed', 'percentage')),
  rate_value      numeric(10,2) NOT NULL CHECK (rate_value >= 0),
  duration_months integer NOT NULL DEFAULT 1 CHECK (duration_months > 0),
  active          boolean NOT NULL DEFAULT true,
  effective_from  timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_commission_rules_affiliate_id_idx ON public.affiliate_commission_rules (affiliate_id);
CREATE INDEX affiliate_commission_rules_country_id_idx ON public.affiliate_commission_rules (country_id);

ALTER TABLE public.affiliate_commission_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.affiliate_commission_rules TO authenticated;
GRANT ALL ON public.affiliate_commission_rules TO service_role;
CREATE POLICY "affiliate_commission_rules_select" ON public.affiliate_commission_rules FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.affiliates a WHERE a.id = affiliate_id AND a.user_id = auth.uid())
  );
CREATE POLICY "affiliate_commission_rules_write" ON public.affiliate_commission_rules FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- ============================================================
-- 3. Affiliate referrals -- attribution tracking (brief §44). A referral starts 'pending'
-- when a business signs up using an affiliate's code, and moves to 'converted' once that
-- business becomes a paying subscriber -- Project 13's job to define/trigger; until then,
-- Super Admin can convert manually (see activateAffiliateReferral's own doc comment for why).
-- ============================================================
CREATE TABLE public.affiliate_referrals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id           uuid NOT NULL REFERENCES public.affiliates (id) ON DELETE CASCADE,
  referred_business_id   uuid REFERENCES public.businesses (id) ON DELETE SET NULL,
  referral_code          text NOT NULL,
  attribution_window_days integer NOT NULL DEFAULT 30,
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'converted', 'expired', 'revoked')),
  attributed_at          timestamptz NOT NULL DEFAULT now(),
  converted_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_referrals_affiliate_id_idx ON public.affiliate_referrals (affiliate_id);
CREATE INDEX affiliate_referrals_business_id_idx ON public.affiliate_referrals (referred_business_id)
  WHERE referred_business_id IS NOT NULL;

ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.affiliate_referrals TO authenticated;
GRANT ALL ON public.affiliate_referrals TO service_role;
CREATE POLICY "affiliate_referrals_select" ON public.affiliate_referrals FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.affiliates a WHERE a.id = affiliate_id AND a.user_id = auth.uid())
  );

-- ============================================================
-- 4. Business referrals (brief §46) -- distinct from affiliates. A business refers another
-- business once; the reward activates only when the referred business becomes a paying
-- subscriber (same Project-13-dependency note as affiliate conversion) and is credited to
-- the REFERRING business's Dallty balance (promotional_credit, brief §47 -- explicitly not
-- the same account as business_balance's real cash revenue).
-- ============================================================
CREATE TABLE public.business_referrals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referring_business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  referred_business_id  uuid REFERENCES public.businesses (id) ON DELETE SET NULL,
  referral_code         text NOT NULL,
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'activated', 'expired', 'revoked')),
  reward_amount         numeric(10,2),
  reward_currency       text REFERENCES public.currencies (code),
  created_at            timestamptz NOT NULL DEFAULT now(),
  activated_at          timestamptz
);
CREATE INDEX business_referrals_referring_business_id_idx ON public.business_referrals (referring_business_id);
CREATE UNIQUE INDEX business_referrals_code_idx ON public.business_referrals (referral_code)
  WHERE referred_business_id IS NULL;

ALTER TABLE public.business_referrals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_referrals TO authenticated;
GRANT ALL ON public.business_referrals TO service_role;
CREATE POLICY "business_referrals_select" ON public.business_referrals FOR SELECT TO authenticated
  USING (
    public.owns_business(auth.uid(), referring_business_id)
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- 5. Extend ledger_transactions' existing SELECT policy so an affiliate can see their own
-- affiliate_payable accrual rows -- strictly additive (an OR'd new clause; every existing
-- condition preserved verbatim), same discipline Project 01/11 used extending owns_business().
-- ============================================================
DROP POLICY "ledger_transactions_select" ON public.ledger_transactions;
CREATE POLICY "ledger_transactions_select" ON public.ledger_transactions FOR SELECT TO authenticated
  USING (
    account_ref = auth.uid()
    OR (business_id IS NOT NULL AND (owns_business(auth.uid(), business_id) OR is_business_staff(auth.uid(), account_ref)))
    OR (account_type = 'affiliate_payable' AND EXISTS (
      SELECT 1 FROM public.affiliates a WHERE a.id = account_ref AND a.user_id = auth.uid()
    ))
    OR is_platform_admin(auth.uid())
  );
