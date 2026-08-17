-- Project 02: generic rate limiting for unauthenticated endpoints that had none.
--
-- Project 00's audit flagged checkEmailHasAccount/checkPhoneHasAccount (account-existence
-- enumeration at unlimited volume), checkSignupPassword, and createGuestBooking (booking
-- spam) as having zero abuse protection. The existing check_login_throttle/
-- record_login_attempt pair (20260813050000) is purpose-built for one thing (login by
-- email) — rather than bolting on more single-purpose tables, this is a small generic
-- sliding-window limiter keyed by an arbitrary bucket string, reusable by any endpoint.

CREATE TABLE public.rate_limit_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_limit_hits_bucket_created_idx ON public.rate_limit_hits (bucket, created_at DESC);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No policies beyond service_role -- same convention as auth_login_attempts: every access
-- goes through the check_rate_limit() RPC, never a direct table read/write from the client.
GRANT ALL ON public.rate_limit_hits TO service_role;

-- Returns true (allowed, and records this hit) or false (throttled, hit not recorded).
-- Self-purges its own bucket's expired rows on every call, matching
-- record_login_attempt's self-purging convention -- no separate cleanup job needed.
CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket text, _max_hits int, _window_minutes int)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  hits int;
BEGIN
  DELETE FROM public.rate_limit_hits
    WHERE bucket = _bucket AND created_at < now() - (_window_minutes || ' minutes')::interval;

  SELECT count(*) INTO hits FROM public.rate_limit_hits WHERE bucket = _bucket;

  IF hits >= _max_hits THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (bucket) VALUES (_bucket);
  RETURN true;
END;
$$;

-- service_role only: this is called from server functions using the admin client, never
-- directly from the browser (unlike check_login_throttle, which anon/authenticated call
-- directly from /auth's own page code — this one has no equivalent direct caller).
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;
