-- Email Trust & Disposable Email Protection foundation.
--
-- Database/configuration-driven domain classification, NOT a hardcoded blacklist scattered
-- through application code. Two enforcement layers, matching this session's established
-- defense-in-depth pattern (client pre-check for UX + server-side hard backstop for actual
-- security, same shape as the OTP step-up and rate-limiting work):
--   1. is_email_domain_allowed() — callable by anon/authenticated, used by a pre-signup
--      check server function so the UI can show a friendly error before ever calling
--      supabase.auth.signUp(). Returns only a boolean — never the specific category, per
--      the "don't expose the internal blocked-domain list" requirement.
--   2. handle_new_user() — hard block. Raises inside the AFTER INSERT trigger on
--      auth.users, which aborts the whole triggering transaction (the row never commits),
--      so a caller that bypasses the pre-check (modified client, direct API call) still
--      cannot create an account with a disposable/blocked email.

CREATE TYPE public.email_domain_category AS ENUM (
  'trusted_free_provider',
  'business_domain',
  'unknown_domain',
  'disposable_email',
  'blocked_domain',
  'high_risk_domain'
);

CREATE TABLE public.email_domain_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      text NOT NULL UNIQUE,
  category    public.email_domain_category NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  reason      text,
  source      text NOT NULL DEFAULT 'seed',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_domain_rules_domain_active_idx ON public.email_domain_rules (domain) WHERE active;
CREATE INDEX email_domain_rules_category_idx ON public.email_domain_rules (category);

CREATE TRIGGER email_domain_rules_touch_updated_at BEFORE UPDATE ON public.email_domain_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.email_domain_rules ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.email_domain_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_domain_rules TO authenticated;

-- Deliberately NO anon/authenticated SELECT policy at all: this table is the internal
-- domain-intelligence list, and the brief explicitly says never expose it through a public
-- API. Only a super admin (managing it) or a SECURITY DEFINER function (classifying an
-- email server-side) can read it.
CREATE POLICY "email_domain_rules_super_admin_all" ON public.email_domain_rules FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- Starter seed data. Explicitly NOT exhaustive -- disposable-email services appear
-- constantly; this is a maintainable table precisely so the list doesn't need a code
-- deploy to update (§60.2's own instruction: "do not assume today's list will remain
-- complete"). Trusted free providers matter for the business-account policy (§60.5): small
-- businesses without a custom domain must not be blocked.
INSERT INTO public.email_domain_rules (domain, category, source, reason) VALUES
  ('gmail.com', 'trusted_free_provider', 'seed', 'Major global free provider'),
  ('googlemail.com', 'trusted_free_provider', 'seed', 'Gmail alias domain'),
  ('outlook.com', 'trusted_free_provider', 'seed', 'Major global free provider'),
  ('hotmail.com', 'trusted_free_provider', 'seed', 'Major global free provider'),
  ('live.com', 'trusted_free_provider', 'seed', 'Microsoft free provider'),
  ('msn.com', 'trusted_free_provider', 'seed', 'Microsoft free provider'),
  ('yahoo.com', 'trusted_free_provider', 'seed', 'Major global free provider'),
  ('yahoo.fr', 'trusted_free_provider', 'seed', 'Yahoo France, common in Francophone markets'),
  ('icloud.com', 'trusted_free_provider', 'seed', 'Apple free provider'),
  ('me.com', 'trusted_free_provider', 'seed', 'Apple free provider'),
  ('mac.com', 'trusted_free_provider', 'seed', 'Apple free provider'),
  ('aol.com', 'trusted_free_provider', 'seed', 'Major global free provider'),
  ('protonmail.com', 'trusted_free_provider', 'seed', 'Privacy-focused mainstream provider'),
  ('proton.me', 'trusted_free_provider', 'seed', 'Privacy-focused mainstream provider'),
  ('gmx.com', 'trusted_free_provider', 'seed', 'Major global free provider'),

  ('mailinator.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('guerrillamail.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('guerrillamailblock.com', 'disposable_email', 'seed', 'Guerrilla Mail alias domain'),
  ('sharklasers.com', 'disposable_email', 'seed', 'Guerrilla Mail alias domain'),
  ('10minutemail.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('temp-mail.org', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('tempmail.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('throwawaymail.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('yopmail.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('trashmail.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('getnada.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('dispostable.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('fakeinbox.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('maildrop.cc', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('mohmal.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('mohmal.im', 'disposable_email', 'seed', 'Mohmal alias domain'),
  ('mintemail.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('emailondeck.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('mailnesia.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('moakt.com', 'disposable_email', 'seed', 'Well-known public disposable inbox'),
  ('spamgourmet.com', 'disposable_email', 'seed', 'Well-known public disposable inbox')
ON CONFLICT (domain) DO NOTHING;

-- Classifies a domain -- internal only (service_role), used by handle_new_user() and by
-- Super Admin tooling. Never exposed directly to anon/authenticated -- see
-- is_email_domain_allowed() below for the public-safe boolean wrapper.
CREATE OR REPLACE FUNCTION public.classify_email_domain(_email text)
RETURNS public.email_domain_category
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dom text;
  found public.email_domain_category;
BEGIN
  dom := lower(split_part(coalesce(_email, ''), '@', 2));
  IF dom = '' THEN
    RETURN 'unknown_domain';
  END IF;
  SELECT category INTO found FROM public.email_domain_rules WHERE domain = dom AND active LIMIT 1;
  RETURN COALESCE(found, 'unknown_domain');
END;
$$;

-- Public-safe check: true/false only, category never leaked. Customer + business policy is
-- identical at this layer (§60.4/§60.5 both reduce to "not disposable, not blocked") --
-- the harder business-verification tiers (§60.5/§60.6) are a separate, additive concept
-- layered on top later, not a stricter version of this check.
CREATE OR REPLACE FUNCTION public.is_email_domain_allowed(_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.classify_email_domain(_email) NOT IN ('disposable_email', 'blocked_domain')
$$;

GRANT EXECUTE ON FUNCTION public.classify_email_domain(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_email_domain_allowed(text) TO anon, authenticated, service_role;

-- Foundation only for §60.6/§60.7 (business domain verification). No DNS/website/email
-- verification method is implemented here -- this table exists so a future project can add
-- that logic without a schema redesign. Domain verification proves control of a domain; it
-- is explicitly NOT business ownership/verification (§60.7) -- kept as a separate concept
-- from businesses.is_verified (the existing "Verified by Dallty" marketplace badge).
CREATE TABLE public.business_domain_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  domain        text NOT NULL,
  method        text NOT NULL DEFAULT 'dns_txt' CHECK (method IN ('dns_txt', 'email', 'website')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
  token         text,
  verified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX business_domain_verifications_business_id_idx ON public.business_domain_verifications (business_id);

CREATE TRIGGER business_domain_verifications_touch_updated_at BEFORE UPDATE ON public.business_domain_verifications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.business_domain_verifications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.business_domain_verifications TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.business_domain_verifications TO authenticated;

CREATE POLICY "business_domain_verifications_select" ON public.business_domain_verifications FOR SELECT TO authenticated
  USING (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "business_domain_verifications_manage" ON public.business_domain_verifications FOR ALL TO authenticated
  USING (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()));

-- Widen admin_audit_log.actor_id to nullable so the pre-signup email-trust check (which
-- runs before any account/actor exists) can still log EMAIL_DOMAIN_BLOCKED /
-- DISPOSABLE_EMAIL_REJECTED events. Every existing call site already passes a real actor id
-- and is unaffected -- this only widens what's allowed, it doesn't change existing rows or
-- existing INSERT policy (service-role writes bypass RLS regardless; the existing
-- authenticated-actor INSERT policy is untouched).
ALTER TABLE public.admin_audit_log ALTER COLUMN actor_id DROP NOT NULL;

-- Hard block: rewrite handle_new_user() to reject disposable/blocked email domains before
-- any profile/role row is created. A RAISE EXCEPTION here aborts the whole trigering
-- transaction (the auth.users insert itself never commits), so this cannot be bypassed by
-- skipping the client-side pre-check. Every other line of this function is copied verbatim
-- from its current live definition (supabase/migrations/20260814030000) -- only the new
-- IF block at the top was added; nothing else about signup/role-assignment/guest-booking-
-- claiming behavior changes.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  requested text := COALESCE(NEW.raw_user_meta_data ->> 'role', 'client');
  assigned public.app_role;
BEGIN
  IF NEW.email IS NOT NULL AND public.classify_email_domain(NEW.email) IN ('disposable_email', 'blocked_domain') THEN
    RAISE EXCEPTION 'Please use a valid email address that you can keep access to.';
  END IF;

  IF lower(NEW.email) = 'mimou@devlly.net' THEN
    assigned := 'super_admin';
  ELSIF requested IN ('client', 'business_owner', 'specialist') THEN
    assigned := requested::public.app_role;
  ELSE
    assigned := 'client';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, locale, country_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    COALESCE(NEW.raw_user_meta_data ->> 'locale', 'en'),
    NEW.raw_user_meta_data ->> 'country_code'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Link any guest bookings placed under this email before the account existed.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.bookings
    SET customer_id = NEW.id, updated_at = now()
    WHERE customer_id IS NULL
      AND customer_email IS NOT NULL
      AND lower(customer_email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$function$;
