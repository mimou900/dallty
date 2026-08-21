-- Project 13: the business-referral reward trigger needs a reward AMOUNT to post when it
-- fires automatically (on a referred business's first subscription payment) -- unlike the
-- affiliate commission trigger, which already resolves a real, Super-Admin-configurable
-- rule table (affiliate_commission_rules) from Project 12, business_referrals' reward_amount
-- was deliberately left as a Super-Admin-typed-in-manually value with no automatic source.
-- Rather than inventing a hardcoded percentage in application code, this is one more small
-- Super-Admin-editable reference value, matching auth_settings' own established
-- single-row-config pattern. Default is an explicitly provisional placeholder, not a
-- commercial decision.
CREATE TABLE public.subscription_settings (
  id                                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  business_referral_reward_percent     numeric(5,2) NOT NULL DEFAULT 10.00
    CHECK (business_referral_reward_percent >= 0 AND business_referral_reward_percent <= 100),
  is_provisional                        boolean NOT NULL DEFAULT true,
  updated_at                             timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER subscription_settings_touch_updated_at BEFORE UPDATE ON public.subscription_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.subscription_settings (id) VALUES (true);

ALTER TABLE public.subscription_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.subscription_settings TO authenticated;
GRANT ALL ON public.subscription_settings TO service_role;
CREATE POLICY "subscription_settings_select" ON public.subscription_settings FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "subscription_settings_write" ON public.subscription_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
