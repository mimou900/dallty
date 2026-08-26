-- Homepage footer "Stay in the loop" newsletter signup. Public, unauthenticated form, so
-- writes go through the service-role server function only -- RLS below denies all direct
-- client access, matching the rest of the public-facing write paths in this app.
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  lang text,
  created_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role client (supabaseAdmin, used by the subscribe server
-- function) can read or write this table.
