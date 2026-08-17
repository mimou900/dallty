-- Project 03: security foundation — idempotency, risk-scored security events, and
-- bot-challenge configuration. No booking/payment/coupon/affiliate system exists yet, so
-- none of this is wired into a specific business mutation in this migration — it's the
-- reusable infrastructure those future systems will consume, matching the brief's own
-- instruction not to implement them yet.

-- ============================================================
-- Idempotency foundation (brief §24)
-- ============================================================
-- Generic, reusable across any future "must not execute twice" mutation (booking, payment,
-- refund, balance transaction, subscription change, coupon redemption, affiliate reward,
-- payout — none of which exist yet). Scoped to actor + operation + a caller-supplied key,
-- never a timestamp. `response` caches the original result so a legitimate retry (e.g. a
-- flaky connection) returns the same outcome instead of re-executing the mutation.
CREATE TABLE public.idempotency_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  operation     text NOT NULL,
  idempotency_key text NOT NULL,
  status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  response      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  UNIQUE (actor_id, operation, idempotency_key)
);
CREATE INDEX idempotency_keys_created_at_idx ON public.idempotency_keys (created_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies -- every access goes through server functions using the
-- service-role client, same convention as auth_otp_codes/auth_login_attempts.
GRANT ALL ON public.idempotency_keys TO service_role;

-- ============================================================
-- Risk-scored security events (brief §21-23) — extends admin_audit_log, does not
-- duplicate it. `ip`/`risk_level`/`outcome` are broadly useful across many future event
-- types and worth real (indexable) columns rather than burying them in `details` jsonb.
-- ============================================================
ALTER TABLE public.admin_audit_log ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.admin_audit_log ADD COLUMN IF NOT EXISTS risk_level text
  CHECK (risk_level IN ('low', 'medium', 'high', 'critical'));
ALTER TABLE public.admin_audit_log ADD COLUMN IF NOT EXISTS outcome text;
CREATE INDEX IF NOT EXISTS admin_audit_log_risk_level_idx ON public.admin_audit_log (risk_level) WHERE risk_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx ON public.admin_audit_log (action);

-- ============================================================
-- Bot-challenge & security threshold configuration (brief §19-20, §59)
-- ============================================================
-- Provider-agnostic: no Turnstile/hCaptcha site or secret key exists in this environment,
-- so no actual challenge widget is wired up here (would be pure theater without a real
-- provider). This table holds the deterministic-rule thresholds a future provider
-- integration reads, and is Super-Admin editable without a code deploy — see
-- src/lib/bot-challenge.server.ts for the (currently rule-based, non-ML, per §22) resolver
-- that consumes it today for risk-event logging.
CREATE TABLE public.platform_security_settings (
  id                          boolean PRIMARY KEY DEFAULT true CHECK (id),
  bot_challenge_provider      text NOT NULL DEFAULT 'none' CHECK (bot_challenge_provider IN ('none', 'turnstile', 'hcaptcha')),
  risk_challenge_threshold    smallint NOT NULL DEFAULT 60,
  required_challenge_threshold smallint NOT NULL DEFAULT 90,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_security_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TRIGGER platform_security_settings_touch_updated_at BEFORE UPDATE ON public.platform_security_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.platform_security_settings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.platform_security_settings TO service_role;
GRANT SELECT, UPDATE ON public.platform_security_settings TO authenticated;
-- Same two-layer pattern as auth_settings: table grant permits the operation type, RLS
-- restricts it to super_admin only.
CREATE POLICY "platform_security_settings_super_admin_all" ON public.platform_security_settings FOR ALL TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
