-- Project 13 Phase 1-3: subscription plan/pricing/billing architecture. Confirmed genuinely
-- missing before this project: businesses.plan is a bare, unconsumed subscription_plan enum
-- column (only ever displayed as a read-only badge in the Super Admin directory and,
-- oddly, directly self-editable by a business owner via settings -- fixed below, since
-- letting a business self-assign its own paid tier defeats the entire point of this
-- project), and no plan/pricing/subscription/billing table of any kind exists anywhere.
--
-- Editable reference-table configuration (brief's explicit requirement): subscription_plans
-- holds every commercial attribute Super Admin needs to tune -- price, currency, trial,
-- grace period, every limit, feature entitlements, advertising eligibility -- as DATA, not
-- code. plan_key is deliberately text, not the businesses.plan enum, so a 4th/5th plan can
-- be added later with a plain INSERT, no enum-extension migration required. The 3 seeded
-- rows (starter/professional/enterprise) are PROVISIONAL placeholder values only
-- (is_provisional=true) -- not final commercial pricing, per explicit instruction.

-- ============================================================
-- 1. subscription_plans -- the reference-table configuration itself.
-- ============================================================
CREATE TABLE public.subscription_plans (
  plan_key               text PRIMARY KEY,
  name                    text NOT NULL,
  name_ar                 text,
  description              text,
  description_ar           text,
  monthly_price            numeric(10,2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  yearly_price              numeric(10,2) NOT NULL DEFAULT 0 CHECK (yearly_price >= 0),
  currency                  text NOT NULL DEFAULT 'DZD' REFERENCES public.currencies (code),
  trial_duration_days       integer NOT NULL DEFAULT 14 CHECK (trial_duration_days >= 0),
  grace_period_days         integer NOT NULL DEFAULT 3 CHECK (grace_period_days >= 0),
  staff_limit               integer CHECK (staff_limit IS NULL OR staff_limit > 0),
  branch_limit               integer CHECK (branch_limit IS NULL OR branch_limit > 0),
  monthly_booking_limit      integer CHECK (monthly_booking_limit IS NULL OR monthly_booking_limit > 0),
  customer_limit             integer CHECK (customer_limit IS NULL OR customer_limit > 0),
  -- NULL on any limit column = unlimited on that dimension -- an explicit, queryable "no cap"
  -- rather than a magic number like 0 or -1.
  feature_entitlements       jsonb NOT NULL DEFAULT '{}',
  advertising_eligible       boolean NOT NULL DEFAULT false,
  is_active                  boolean NOT NULL DEFAULT true,
  is_provisional              boolean NOT NULL DEFAULT true,
  sort_order                  integer NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER subscription_plans_touch_updated_at BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
CREATE POLICY "subscription_plans_select" ON public.subscription_plans
  FOR SELECT USING (true);
CREATE POLICY "subscription_plans_write" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.subscription_plans
  (plan_key, name, description, monthly_price, yearly_price, currency, trial_duration_days,
   grace_period_days, staff_limit, branch_limit, monthly_booking_limit, customer_limit,
   feature_entitlements, advertising_eligible, sort_order, is_provisional)
VALUES
  ('starter', 'Starter', 'Provisional placeholder plan for a single-branch business getting started.',
   0, 0, 'DZD', 14, 3, 3, 1, 100, 200,
   '{"confirmation_center": false, "reconciliation_export": false}'::jsonb, false, 1, true),
  ('professional', 'Professional', 'Provisional placeholder plan for a growing multi-specialist business.',
   2500, 25000, 'DZD', 14, 5, 10, 3, 1000, 2000,
   '{"confirmation_center": true, "reconciliation_export": false}'::jsonb, true, 2, true),
  ('enterprise', 'Enterprise', 'Provisional placeholder plan for a multi-branch operation with no hard caps.',
   6000, 60000, 'DZD', 14, 7, NULL, NULL, NULL, NULL,
   '{"confirmation_center": true, "reconciliation_export": true}'::jsonb, true, 3, true);

-- ============================================================
-- 2. business_subscriptions -- one current-state row per business. History of transitions
-- lives in subscription_events (append-only), not as multiple rows here, matching
-- staff_payouts' own "one current status row, immutable ledger for the money" split.
-- ============================================================
CREATE TABLE public.business_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id               uuid NOT NULL UNIQUE REFERENCES public.businesses (id) ON DELETE CASCADE,
  plan_key                  text NOT NULL REFERENCES public.subscription_plans (plan_key),
  billing_interval           text NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
  status                     text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_ends_at               timestamptz,
  current_period_start        timestamptz NOT NULL DEFAULT now(),
  current_period_end          timestamptz,
  grace_period_ends_at         timestamptz,
  cancel_at_period_end         boolean NOT NULL DEFAULT false,
  canceled_at                   timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER business_subscriptions_touch_updated_at BEFORE UPDATE ON public.business_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX business_subscriptions_status_idx ON public.business_subscriptions (status);

ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.business_subscriptions TO authenticated;
GRANT ALL ON public.business_subscriptions TO service_role;
CREATE POLICY "business_subscriptions_select" ON public.business_subscriptions FOR SELECT TO authenticated
  USING (
    public.owns_business(auth.uid(), business_id)
    OR public.has_permission(auth.uid(), business_id, 'subscription.view')
    OR public.is_platform_admin(auth.uid())
  );
-- No direct INSERT/UPDATE policy -- every write goes through server functions using the
-- service-role client, same convention as payments/idempotency_keys/staff_payouts.

-- ============================================================
-- 3. subscription_events -- immutable audit trail of every transition (brief's explicit
-- chain: upgrade/downgrade/cancellation/renewal/expiration all need real history, not just
-- a mutated status column). Append-only via REVOKE, matching admin_audit_log/
-- booking_status_history's convention (not ledger_transactions' stronger trigger-enforced
-- immutability -- this table holds no money itself, the ledger already does that part).
-- ============================================================
CREATE TABLE public.subscription_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  subscription_id     uuid NOT NULL REFERENCES public.business_subscriptions (id) ON DELETE CASCADE,
  event_type           text NOT NULL CHECK (event_type IN (
    'created', 'trial_started', 'upgraded', 'downgraded', 'renewed', 'canceled',
    'reactivated', 'expired', 'payment_recorded', 'grace_period_entered', 'entitlement_denied'
  )),
  from_plan_key         text REFERENCES public.subscription_plans (plan_key),
  to_plan_key            text REFERENCES public.subscription_plans (plan_key),
  actor_id                uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  details                 jsonb NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_events_business_id_idx ON public.subscription_events (business_id);
CREATE INDEX subscription_events_subscription_id_idx ON public.subscription_events (subscription_id);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;
REVOKE UPDATE, DELETE ON public.subscription_events FROM authenticated, service_role;
CREATE POLICY "subscription_events_select" ON public.subscription_events FOR SELECT TO authenticated
  USING (
    public.owns_business(auth.uid(), business_id)
    OR public.has_permission(auth.uid(), business_id, 'subscription.view')
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- 4. subscription_payments -- manual/admin-recorded payment record, TEMPORARY mechanism
-- (brief's explicit instruction: no real payment gateway is configured for Dallty
-- subscriptions today, and this must never pretend otherwise). Mirrors the existing
-- `payments` table's relationship to `ledger_transactions` for bookings: this is the
-- domain-specific record of "this payment happened"; the ledger (reused, not duplicated)
-- records the actual accounting effect. payment_method defaults to a value that is
-- unambiguously not a real gateway; provider_reference stays NULL until a real one exists,
-- keeping the shape ready for a gateway to slot in later without a schema rebuild.
-- ============================================================
CREATE TABLE public.subscription_payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  subscription_id      uuid NOT NULL REFERENCES public.business_subscriptions (id) ON DELETE CASCADE,
  plan_key              text NOT NULL REFERENCES public.subscription_plans (plan_key),
  billing_interval       text NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  amount                  numeric(10,2) NOT NULL CHECK (amount > 0),
  currency                 text NOT NULL REFERENCES public.currencies (code),
  period_start              timestamptz NOT NULL,
  period_end                 timestamptz NOT NULL,
  payment_method              text NOT NULL DEFAULT 'manual_admin_recorded',
  provider_reference           text,
  recorded_by                   uuid NOT NULL REFERENCES auth.users (id),
  notes                          text,
  ledger_group_id                 uuid,
  created_at                       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_payments_business_id_idx ON public.subscription_payments (business_id);
CREATE INDEX subscription_payments_subscription_id_idx ON public.subscription_payments (subscription_id);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.subscription_payments TO authenticated;
GRANT ALL ON public.subscription_payments TO service_role;
REVOKE UPDATE, DELETE ON public.subscription_payments FROM authenticated, service_role;
CREATE POLICY "subscription_payments_select" ON public.subscription_payments FOR SELECT TO authenticated
  USING (
    public.owns_business(auth.uid(), business_id)
    OR public.has_permission(auth.uid(), business_id, 'subscription.view')
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- 5. businesses.plan is kept as a denormalized display mirror (existing UI reads it directly
-- -- platform/businesses.tsx's badge, settings.tsx) rather than rewritten, but it must stop
-- being directly self-editable: a business owner freely relabeling their own paid tier via
-- a settings PATCH would let them bypass this entire project's entitlement/billing model.
-- Server functions below (not this migration) are the only path that writes it from now on.
-- ============================================================
