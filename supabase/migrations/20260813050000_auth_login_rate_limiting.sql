-- Login brute-force protection: a sliding-window count of failed attempts
-- per email, gating /auth's sign-in handler client-side. No RLS policies —
-- every access goes through the two SECURITY DEFINER RPCs below, matching
-- the check_promo_code convention.

CREATE TABLE public.auth_login_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_login_attempts_email_idx ON public.auth_login_attempts(email, attempted_at);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.auth_login_attempts TO service_role;

-- Read-only throttle check: is this email over the failure threshold within
-- the trailing window, and if so, how many seconds until the oldest
-- attempt in that window ages out?
CREATE OR REPLACE FUNCTION public.check_login_throttle(_email text)
RETURNS TABLE(throttled boolean, retry_after_seconds integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  window_minutes constant int := 15;
  max_attempts constant int := 5;
  oldest_in_window timestamptz;
  attempt_count int;
BEGIN
  SELECT count(*), min(attempted_at) INTO attempt_count, oldest_in_window
  FROM public.auth_login_attempts
  WHERE lower(email) = lower(trim(_email))
    AND attempted_at > now() - (window_minutes || ' minutes')::interval;

  IF attempt_count >= max_attempts THEN
    RETURN QUERY SELECT
      true,
      GREATEST(0, EXTRACT(EPOCH FROM (oldest_in_window + (window_minutes || ' minutes')::interval - now()))::int);
  ELSE
    RETURN QUERY SELECT false, 0;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.check_login_throttle(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_throttle(text) TO anon, authenticated;

-- Records one failed attempt, self-purging attempts older than a day for
-- that email so the table never needs a separate cleanup job.
CREATE OR REPLACE FUNCTION public.record_login_attempt(_email text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.auth_login_attempts
  WHERE lower(email) = lower(trim(_email)) AND attempted_at < now() - interval '1 day';

  INSERT INTO public.auth_login_attempts (email) VALUES (lower(trim(_email)));
END; $$;

REVOKE ALL ON FUNCTION public.record_login_attempt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text) TO anon, authenticated;
