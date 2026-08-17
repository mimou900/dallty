-- Project 02: server-side OTP step-up enforcement.
--
-- Before this migration, login OTP step-up (auth_role_policies.otp_enabled) was enforced
-- only by a client-side redirect (dallty:otp-pending in localStorage, checked in
-- /_authenticated's beforeLoad). The access token issued by supabase.auth.signInWithPassword
-- is already fully valid at that point -- requireSupabaseAuth (the middleware every server
-- function uses) validates the JWT's signature/claims but has no notion of "step-up still
-- owed", so a caller who never navigates to /verify-otp (or calls a server function
-- directly) could invoke privileged server functions, including super_admin-gated ones,
-- without ever completing the OTP step. Flagged in the Project 00 security audit.
--
-- This table correlates a *specific auth session* (Supabase JWTs always carry a
-- `session_id` claim -- stable across token refreshes within one login) with a completed
-- login_step_up OTP verification. Server-side authorization helpers
-- (assertSuperAdmin/assertCanManageBusiness) now check this table before allowing a
-- privileged action, for any user whose role requires step-up.

CREATE TABLE public.auth_step_up_sessions (
  session_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_step_up_sessions_user_id_idx ON public.auth_step_up_sessions (user_id);

ALTER TABLE public.auth_step_up_sessions ENABLE ROW LEVEL SECURITY;
-- No policies beyond service_role, matching the auth_otp_codes/auth_login_attempts
-- convention: every access goes through server functions using the service-role client.
GRANT ALL ON public.auth_step_up_sessions TO service_role;
