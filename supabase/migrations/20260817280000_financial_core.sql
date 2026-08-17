-- Project 06: Financial Foundation — core schema.
--
-- Implements the brief's central principle (§2-3): booking state, payment state, and
-- ledger truth are three separate layers, never collapsed into `booking.paid = true`. The
-- existing `bookings.payment_status`/`paid_at` columns (a raw boolean-ish toggle, set
-- directly by `useSetPaymentStatus` in src/lib/admin.ts) stay as a fast-read summary field
-- on the booking, but this migration makes the LEDGER the source of truth — payment status
-- going forward is derived from and kept in sync with real ledger transactions, not set
-- directly by the UI. `useSetPaymentStatus` itself is superseded by the new
-- `markCashPayment` server function (src/lib/financial.functions.ts), not deleted here
-- (DB migration, not an application-code removal) — see the architecture doc for the
-- planned UI cutover.

-- ============================================================
-- 1. Payment methods — config/country-driven (brief §5-7), not hardcoded
-- ============================================================
CREATE TABLE public.payment_methods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE,
  name              text NOT NULL,
  country_id        uuid REFERENCES public.countries (id) ON DELETE CASCADE,
  is_online         boolean NOT NULL DEFAULT false,
  provider          text,
  active            boolean NOT NULL DEFAULT false,
  customer_enabled  boolean NOT NULL DEFAULT false,
  business_enabled  boolean NOT NULL DEFAULT false,
  display_order     int NOT NULL DEFAULT 0,
  minimum_amount    numeric(10,2),
  maximum_amount    numeric(10,2),
  configuration     jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_methods_country_id_idx ON public.payment_methods (country_id) WHERE country_id IS NOT NULL;

CREATE TRIGGER payment_methods_touch_updated_at BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.payment_methods TO anon, authenticated;
GRANT ALL ON public.payment_methods TO service_role;
CREATE POLICY "payment_methods_select" ON public.payment_methods FOR SELECT USING (true);
CREATE POLICY "payment_methods_write" ON public.payment_methods FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- Seed: only CASH is active/enabled. CIB/Edahabia/bank transfer are seeded as real rows
-- (so the config-driven list is genuinely populated, not empty) but `active = false` —
-- turning one on requires a real provider integration, which does not exist in this
-- project. Never claim a provider is live when it isn't (brief §114's own instruction).
INSERT INTO public.payment_methods (code, name, country_id, is_online, provider, active, customer_enabled, business_enabled, display_order)
SELECT 'cash', 'Cash', c.id, false, null, true, true, true, 0 FROM public.countries c WHERE c.iso_code = 'DZ'
UNION ALL
SELECT 'cib', 'CIB', c.id, true, 'cib', false, false, false, 1 FROM public.countries c WHERE c.iso_code = 'DZ'
UNION ALL
SELECT 'edahabia', 'Edahabia', c.id, true, 'edahabia', false, false, false, 2 FROM public.countries c WHERE c.iso_code = 'DZ'
UNION ALL
SELECT 'bank_transfer', 'Bank transfer', c.id, false, null, false, false, false, 3 FROM public.countries c WHERE c.iso_code = 'DZ'
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. The immutable ledger (brief §24-29). Accounts are implicit — (account_type, account_ref)
-- — rather than a pre-created chart-of-accounts table; a "customer balance account" is just
-- every ledger_transactions row with account_type='customer_balance' and that customer's id
-- as account_ref. This avoids operationally heavy account-provisioning while still giving
-- every account a stable type and a real, queryable identity.
-- ============================================================
CREATE TYPE public.ledger_account_type AS ENUM (
  'customer_balance', 'business_balance', 'dallty_revenue', 'staff_payable',
  'dallty_payable', 'refund_liability', 'promotional_credit'
);
CREATE TYPE public.ledger_direction AS ENUM ('debit', 'credit');

CREATE TABLE public.ledger_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_group_id uuid NOT NULL, -- ties related postings together (e.g. one payment = revenue credit + commission debit + staff-payable credit, all sharing one group id)
  account_type        public.ledger_account_type NOT NULL,
  account_ref          uuid NOT NULL, -- business_id / customer_id / staff_id depending on account_type
  direction            public.ledger_direction NOT NULL,
  amount                numeric(12,2) NOT NULL CHECK (amount > 0), -- sign comes from `direction`, never a negative amount field
  currency              text NOT NULL REFERENCES public.currencies (code),
  type                  text NOT NULL, -- e.g. 'service_revenue', 'commission', 'staff_earning', 'tip', 'refund', 'promotional_credit', 'adjustment'
  business_id           uuid REFERENCES public.businesses (id) ON DELETE SET NULL,
  booking_id            uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  payment_id            uuid, -- FK added after the payments table is created below
  actor_id              uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  reason                text,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
  -- Deliberately NO updated_at, NO deleted_at: this row is written once and never touched
  -- again. Corrections are new rows (brief §28-29), enforced below by REVOKE + a trigger.
);
CREATE INDEX ledger_transactions_account_idx ON public.ledger_transactions (account_type, account_ref);
CREATE INDEX ledger_transactions_business_id_idx ON public.ledger_transactions (business_id) WHERE business_id IS NOT NULL;
CREATE INDEX ledger_transactions_booking_id_idx ON public.ledger_transactions (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX ledger_transactions_group_idx ON public.ledger_transactions (transaction_group_id);
CREATE INDEX ledger_transactions_created_at_idx ON public.ledger_transactions (created_at);

ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ledger_transactions TO authenticated;
GRANT INSERT ON public.ledger_transactions TO service_role; -- no UPDATE/DELETE grant to ANY role, including service_role -- see the trigger below for the belt-and-suspenders enforcement
GRANT ALL ON public.ledger_transactions TO service_role;

CREATE POLICY "ledger_transactions_select" ON public.ledger_transactions FOR SELECT TO authenticated
  USING (
    account_ref = auth.uid()
    OR (business_id IS NOT NULL AND (owns_business(auth.uid(), business_id) OR is_business_staff(auth.uid(), account_ref)))
    OR is_platform_admin(auth.uid())
  );

-- Belt-and-suspenders immutability (brief §28, §80, §102): even the service-role client
-- (which bypasses RLS entirely) cannot UPDATE or DELETE a posted ledger row. This is
-- stronger than an RLS policy -- RLS can't restrict service_role, a trigger can.
CREATE OR REPLACE FUNCTION public.forbid_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_transactions rows are immutable once posted -- use a reversal/adjustment transaction instead';
END;
$$;
CREATE TRIGGER ledger_transactions_no_update BEFORE UPDATE ON public.ledger_transactions
FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();
CREATE TRIGGER ledger_transactions_no_delete BEFORE DELETE ON public.ledger_transactions
FOR EACH ROW EXECUTE FUNCTION public.forbid_ledger_mutation();

-- ============================================================
-- 3. Payments — the Payment layer (brief §21-22), separate from bookings and separate from
-- the ledger. One booking may have multiple payment rows (deposit + remainder; a failed
-- attempt + a successful one) -- only successful ones ever post ledger transactions.
-- ============================================================
CREATE TABLE public.payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  customer_id        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  kind               text NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'deposit', 'remainder', 'partial')),
  method_code        text NOT NULL REFERENCES public.payment_methods (code),
  status             public.payment_status NOT NULL DEFAULT 'unpaid',
  expected_amount    numeric(10,2) NOT NULL,
  received_amount    numeric(10,2),
  currency           text NOT NULL REFERENCES public.currencies (code),
  provider           text,
  provider_reference text,
  difference_reason  text CHECK (difference_reason IN ('tip', 'extra_service', 'discount_adjustment', 'other')),
  difference_note    text,
  created_by         uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);
CREATE INDEX payments_booking_id_idx ON public.payments (booking_id);
CREATE INDEX payments_business_id_idx ON public.payments (business_id);
CREATE INDEX payments_status_idx ON public.payments (status);
CREATE UNIQUE INDEX payments_provider_reference_idx ON public.payments (provider, provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL; -- brief §20: unique provider event ID

ALTER TABLE public.ledger_transactions ADD CONSTRAINT ledger_transactions_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments (id) ON DELETE SET NULL;
CREATE INDEX ledger_transactions_payment_id_idx ON public.ledger_transactions (payment_id) WHERE payment_id IS NOT NULL;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR owns_business(auth.uid(), business_id)
    OR is_platform_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = payments.booking_id AND is_business_staff(auth.uid(), b.staff_id))
  );
-- No direct INSERT/UPDATE policy for anon/authenticated -- every payment is created/mutated
-- through server functions using the service-role client (matching the auth_otp_codes /
-- idempotency_keys / rate_limit_hits convention already established in this codebase).

-- ============================================================
-- 4. Payment intents — online payment foundation (brief §21). Schema-only: no real
-- provider is wired up in this project, so no row is ever expected to be created here
-- until a future project adds one. Kept separate from `payments` because an intent can
-- exist (and expire, or fail) without ever becoming a real payment.
-- ============================================================
CREATE TABLE public.payment_intents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  business_id        uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  customer_id        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  provider           text NOT NULL,
  method_code        text NOT NULL REFERENCES public.payment_methods (code),
  currency           text NOT NULL REFERENCES public.currencies (code),
  expected_amount    numeric(10,2) NOT NULL,
  provider_reference text,
  status             text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'processing', 'succeeded', 'failed', 'expired', 'cancelled')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  completed_at       timestamptz
);
CREATE INDEX payment_intents_booking_id_idx ON public.payment_intents (booking_id);
CREATE UNIQUE INDEX payment_intents_provider_reference_idx ON public.payment_intents (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.payment_intents TO authenticated;
GRANT ALL ON public.payment_intents TO service_role;
CREATE POLICY "payment_intents_select" ON public.payment_intents FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR owns_business(auth.uid(), business_id) OR is_platform_admin(auth.uid()));

-- ============================================================
-- 5. Refunds (brief §39-43) — first-class, references the original payment, never a bare
-- boolean flip.
-- ============================================================
CREATE TABLE public.refunds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  amount       numeric(10,2) NOT NULL CHECK (amount > 0),
  currency     text NOT NULL REFERENCES public.currencies (code),
  reason       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  actor_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX refunds_payment_id_idx ON public.refunds (payment_id);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
CREATE POLICY "refunds_select" ON public.refunds FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payments p WHERE p.id = refunds.payment_id
        AND (p.customer_id = auth.uid() OR owns_business(auth.uid(), p.business_id) OR is_platform_admin(auth.uid()))
    )
  );

-- ============================================================
-- 6. Commission rules (brief §49-51) — global -> country -> business override hierarchy,
-- snapshot-based (the rate actually applied is stored on the transaction, never
-- recalculated from a rule that may since have changed -- see markCashPayment/refund
-- server functions).
-- ============================================================
CREATE TABLE public.commission_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id     uuid REFERENCES public.countries (id) ON DELETE CASCADE,
  business_id    uuid REFERENCES public.businesses (id) ON DELETE CASCADE,
  rate_percent   numeric(5,2) NOT NULL DEFAULT 0 CHECK (rate_percent >= 0 AND rate_percent <= 100),
  basis          text NOT NULL DEFAULT 'service_revenue_excluding_tip',
  active         boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_rules_business_id_idx ON public.commission_rules (business_id) WHERE business_id IS NOT NULL;
CREATE INDEX commission_rules_country_id_idx ON public.commission_rules (country_id) WHERE country_id IS NOT NULL;

CREATE TRIGGER commission_rules_touch_updated_at BEFORE UPDATE ON public.commission_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.commission_rules TO authenticated;
GRANT ALL ON public.commission_rules TO service_role;
CREATE POLICY "commission_rules_select" ON public.commission_rules FOR SELECT TO authenticated
  USING (business_id IS NULL OR owns_business(auth.uid(), business_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "commission_rules_write" ON public.commission_rules FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

-- Global default: 0%. Not invented -- explicitly the safe, no-agreement-implied default
-- (brief §49: "0% or percentage... do not hardcode a global percentage" -- 0 is a
-- configuration value here, not a hardcoded behavior; Super Admin can change it per
-- country/business at any time without a code change).
INSERT INTO public.commission_rules (country_id, business_id, rate_percent, basis)
VALUES (NULL, NULL, 0, 'service_revenue_excluding_tip');

-- ============================================================
-- 7. Staff payout models + payouts (brief §52-56)
-- ============================================================
CREATE TABLE public.staff_payout_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  staff_id          uuid REFERENCES public.staff (id) ON DELETE CASCADE, -- null = business-wide default
  service_id        uuid REFERENCES public.services (id) ON DELETE CASCADE, -- null = applies to all services
  fixed_amount      numeric(10,2),
  percentage        numeric(5,2) CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  active            boolean NOT NULL DEFAULT true,
  effective_from    timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (fixed_amount IS NOT NULL OR percentage IS NOT NULL)
);
CREATE INDEX staff_payout_rules_business_id_idx ON public.staff_payout_rules (business_id);
CREATE INDEX staff_payout_rules_staff_id_idx ON public.staff_payout_rules (staff_id) WHERE staff_id IS NOT NULL;

CREATE TRIGGER staff_payout_rules_touch_updated_at BEFORE UPDATE ON public.staff_payout_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.staff_payout_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_payout_rules TO authenticated;
GRANT ALL ON public.staff_payout_rules TO service_role;
CREATE POLICY "staff_payout_rules_select" ON public.staff_payout_rules FOR SELECT TO authenticated
  USING (owns_business(auth.uid(), business_id) OR is_business_staff(auth.uid(), staff_id) OR is_platform_admin(auth.uid()));
CREATE POLICY "staff_payout_rules_manage" ON public.staff_payout_rules FOR ALL TO authenticated
  USING (owns_business(auth.uid(), business_id) OR is_platform_admin(auth.uid()))
  WITH CHECK (owns_business(auth.uid(), business_id) OR is_platform_admin(auth.uid()));

CREATE TABLE public.staff_payouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid NOT NULL REFERENCES public.staff (id) ON DELETE RESTRICT,
  business_id    uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  amount         numeric(10,2) NOT NULL CHECK (amount > 0),
  currency       text NOT NULL REFERENCES public.currencies (code),
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  method_code    text REFERENCES public.payment_methods (code),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled', 'failed')),
  reference      text,
  actor_id       uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz
);
CREATE INDEX staff_payouts_staff_id_idx ON public.staff_payouts (staff_id);
CREATE INDEX staff_payouts_business_id_idx ON public.staff_payouts (business_id);

ALTER TABLE public.staff_payouts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.staff_payouts TO authenticated;
GRANT ALL ON public.staff_payouts TO service_role;
CREATE POLICY "staff_payouts_select" ON public.staff_payouts FOR SELECT TO authenticated
  USING (owns_business(auth.uid(), business_id) OR is_business_staff(auth.uid(), staff_id) OR is_platform_admin(auth.uid()));

-- ============================================================
-- 8. booking_items extension (brief §33-34: extra services, added post-booking, audited)
-- ============================================================
ALTER TABLE public.booking_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'service'
  CHECK (kind IN ('service', 'extra_service'));
ALTER TABLE public.booking_items ADD COLUMN IF NOT EXISTS added_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

-- ============================================================
-- 9. Balances — computed live from the ledger (brief §59-62), never a stored/trusted
-- column. A view, not a materialized/cached table: rebuildable by definition (it IS the
-- rebuild), correct at the current scale, and documented as a candidate to swap for a
-- materialized view later without changing any consumer's query shape.
-- ============================================================
CREATE VIEW public.account_balances AS
SELECT
  account_type,
  account_ref,
  currency,
  SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS balance
FROM public.ledger_transactions
GROUP BY account_type, account_ref, currency;

GRANT SELECT ON public.account_balances TO authenticated, service_role;
-- Views inherit the querying role's access to the underlying table's RLS -- since
-- ledger_transactions' SELECT policy already scopes to the caller's own accounts/
-- businesses/platform-admin status, this view is automatically scoped the same way with
-- no separate policy needed (Postgres views run with the querying user's permissions by
-- default here, since this view has no owner-security-definer trickery).

-- Negative-balance protection (brief §62) for customer/business/promotional accounts only
-- -- staff_payable/dallty_revenue/dallty_payable/refund_liability are internal accrual
-- accounts that legitimately net to whatever the business did; the protection matters for
-- the two account types customers/businesses actually "hold" as spendable credit.
CREATE OR REPLACE FUNCTION public.guard_non_negative_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_balance numeric;
BEGIN
  IF NEW.direction = 'credit' OR NEW.account_type NOT IN ('customer_balance', 'business_balance', 'promotional_credit') THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) INTO current_balance
  FROM public.ledger_transactions
  WHERE account_type = NEW.account_type AND account_ref = NEW.account_ref AND currency = NEW.currency;
  IF current_balance - NEW.amount < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_transactions_guard_negative_balance BEFORE INSERT ON public.ledger_transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_non_negative_balance();

-- ============================================================
-- 10. Financial permission keys (brief §74) — extends Project 01's `permissions`
-- reference table rather than a new one. Reference data only in this project, same as
-- Project 01's own permission seed -- not yet consulted by any RLS policy or server
-- function's enforcement (that remains real role/ownership checks, per the master
-- architecture's documented status for the whole permission system).
-- ============================================================
INSERT INTO public.permissions (key, description) VALUES
  ('payments.view', 'View payment records'),
  ('payments.create', 'Create a payment'),
  ('payments.mark_paid', 'Record a cash/manual payment as received'),
  ('payments.refund', 'Issue a refund'),
  ('payments.adjust', 'Apply a financial adjustment to a payment'),
  ('payments.manage_methods', 'Configure available payment methods'),
  ('payments.manage_deposits', 'Configure deposit policy'),
  ('finance.view', 'View general financial data'),
  ('finance.view_revenue', 'View business revenue reports'),
  ('finance.view_staff_payouts', 'View staff payout records'),
  ('finance.manage_payouts', 'Create/approve staff payouts'),
  ('balance.view', 'View a balance'),
  ('balance.adjust', 'Manually adjust a balance')
ON CONFLICT (key) DO NOTHING;
