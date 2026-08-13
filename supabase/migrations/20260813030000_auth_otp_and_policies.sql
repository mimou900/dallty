-- Custom email-OTP engine + Super-Admin-configurable per-role login policy.
-- Codes are stored as HMAC-SHA256(OTP_HMAC_SECRET, code), never plaintext or
-- a bare hash, since a bare hash of a 6-digit code is trivially
-- rainbow-tableable if the table ever leaks.

CREATE TABLE public.auth_otp_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose        text NOT NULL CHECK (purpose IN ('login_step_up', 'change_email', 'change_password')),
  code_hash      text NOT NULL,
  target         text,
  metadata       jsonb NOT NULL DEFAULT '{}',
  expires_at     timestamptz NOT NULL,
  attempts_used  int NOT NULL DEFAULT 0,
  max_attempts   int NOT NULL DEFAULT 5,
  consumed_at    timestamptz,
  last_sent_at   timestamptz NOT NULL DEFAULT now(),
  resend_count   int NOT NULL DEFAULT 0,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_otp_codes_user_purpose_idx ON public.auth_otp_codes(user_id, purpose);

-- Service-role only: every access goes through server functions, so there
-- are no anon/authenticated grants or policies at all here.
GRANT ALL ON public.auth_otp_codes TO service_role;
ALTER TABLE public.auth_otp_codes ENABLE ROW LEVEL SECURITY;

-- Global OTP settings, a single-row table.
CREATE TABLE public.auth_settings (
  id                          boolean PRIMARY KEY DEFAULT true CHECK (id),
  otp_master_enabled          boolean NOT NULL DEFAULT true,
  otp_expiry_minutes          int NOT NULL DEFAULT 10,
  otp_resend_cooldown_seconds int NOT NULL DEFAULT 60,
  otp_max_attempts            int NOT NULL DEFAULT 5,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.auth_settings (id) VALUES (true);

-- Per-role login OTP policy. is_locked prevents a Super Admin from
-- accidentally turning step-up off for admin/super_admin roles.
CREATE TABLE public.auth_role_policies (
  role        public.app_role PRIMARY KEY,
  otp_enabled boolean NOT NULL DEFAULT false,
  is_locked   boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.auth_role_policies (role, otp_enabled, is_locked) VALUES
  ('client', false, false),
  ('specialist', false, false),
  ('salon_owner', true, false),
  ('admin', true, true),
  ('super_admin', true, true);

GRANT SELECT, UPDATE ON public.auth_settings TO authenticated;
GRANT ALL ON public.auth_settings TO service_role;
ALTER TABLE public.auth_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_settings_super_admin" ON public.auth_settings FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

GRANT SELECT, UPDATE ON public.auth_role_policies TO authenticated;
GRANT ALL ON public.auth_role_policies TO service_role;
ALTER TABLE public.auth_role_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_role_policies_super_admin" ON public.auth_role_policies FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
