-- Business Slugs (Project 1 of the Dallty Localization initiative).
-- Replaces UUID-based /business/<uuid> URLs with /business/<slug>, with
-- permanent redirect history and Super-Admin-managed reserved words.

ALTER TABLE public.businesses
  ADD COLUMN slug text,
  ADD COLUMN slug_source text NOT NULL DEFAULT 'auto'
    CHECK (slug_source IN ('auto', 'custom'));

CREATE TABLE public.reserved_slugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reserved_slugs TO service_role;
ALTER TABLE public.reserved_slugs ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: every access goes through server functions
-- using the service-role admin client (matches auth_role_policies' convention).

INSERT INTO public.reserved_slugs (slug, reason) VALUES
  ('admin', 'system route'), ('api', 'reserved namespace'), ('auth', 'system route'),
  ('login', 'system route'), ('logout', 'reserved namespace'), ('signup', 'reserved namespace'),
  ('register', 'reserved namespace'), ('oauth', 'reserved namespace'), ('verify-otp', 'system route'),
  ('reset-password', 'system route'), ('dashboard', 'system route'), ('settings', 'system route'),
  ('help', 'reserved namespace'), ('support', 'reserved namespace'), ('about', 'reserved namespace'),
  ('pricing', 'reserved namespace'), ('blog', 'reserved namespace'), ('book', 'system route'),
  ('search', 'system route'), ('categories', 'system route'), ('business', 'system route'),
  ('business-id', 'system route'), ('legacy', 'reserved namespace'), ('salon', 'legacy terminology'),
  ('staff', 'system route'), ('account', 'system route'), ('availability', 'system route'),
  ('bookings', 'system route'), ('favorites', 'system route'), ('profile', 'system route'),
  ('reschedule', 'system route'), ('appointments', 'system route'), ('calendar', 'system route'),
  ('customers', 'system route'), ('marketplace', 'system route'), ('notifications', 'system route'),
  ('payments', 'system route'), ('reports', 'system route'), ('reviews', 'system route'),
  ('services', 'system route'), ('terms', 'reserved namespace'), ('privacy', 'reserved namespace'),
  ('contact', 'reserved namespace'), ('www', 'reserved namespace'), ('static', 'reserved namespace'),
  ('assets', 'reserved namespace'), ('uploads', 'reserved namespace'), ('images', 'reserved namespace'),
  ('media', 'reserved namespace'), ('cdn', 'reserved namespace'), ('robots.txt', 'reserved namespace'),
  ('favicon.ico', 'reserved namespace'), ('sitemap.xml', 'reserved namespace'), ('feed', 'reserved namespace'),
  ('rss', 'reserved namespace'), ('graphql', 'reserved namespace'), ('health', 'reserved namespace'),
  ('status', 'reserved namespace');

CREATE TABLE public.business_slug_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  old_slug text NOT NULL,
  new_slug text NOT NULL,
  redirect_type text NOT NULL
    CHECK (redirect_type IN ('owner_rename', 'admin_correction', 'collision_resolved')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz
);
CREATE UNIQUE INDEX business_slug_redirects_old_slug_idx ON public.business_slug_redirects (old_slug);
CREATE INDEX business_slug_redirects_business_id_idx ON public.business_slug_redirects (business_id);

-- Anonymous visitors following an old link need to resolve it -- but not see
-- who changed it or why, matching the audit-log-style restriction used
-- elsewhere in this app.
GRANT SELECT (id, business_id, old_slug, new_slug, created_at)
  ON public.business_slug_redirects TO anon, authenticated;
GRANT ALL ON public.business_slug_redirects TO service_role;
ALTER TABLE public.business_slug_redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_slug_redirects_select" ON public.business_slug_redirects FOR SELECT USING (true);
-- No insert/update/delete policies: every mutation goes through
-- updateBusinessSlug (service-role admin client) or the
-- bump_slug_redirect_hit RPC below.

-- Cross-table uniqueness: a slug can never be both a live businesses.slug and
-- a retired old_slug at once.
CREATE OR REPLACE FUNCTION public.check_business_slug_not_retired() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.business_slug_redirects WHERE old_slug = NEW.slug
  ) THEN
    RAISE EXCEPTION 'slug "%" is retired and cannot be reused', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_slug_not_retired
  BEFORE INSERT OR UPDATE OF slug ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.check_business_slug_not_retired();

CREATE OR REPLACE FUNCTION public.check_redirect_slug_not_live() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.businesses WHERE slug = NEW.old_slug) THEN
    RAISE EXCEPTION 'slug "%" is currently live and cannot be retired under a different business', NEW.old_slug;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_slug_redirects_not_live
  BEFORE INSERT ON public.business_slug_redirects
  FOR EACH ROW EXECUTE FUNCTION public.check_redirect_slug_not_live();

-- Narrow, anonymous-callable counter bump for redirect analytics -- the table
-- grants no UPDATE to anon/authenticated, so this SECURITY DEFINER RPC is the
-- only way to record a hit (matches the check_promo_code convention).
CREATE OR REPLACE FUNCTION public.bump_slug_redirect_hit(_old_slug text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.business_slug_redirects
  SET hit_count = hit_count + 1, last_hit_at = now()
  WHERE old_slug = _old_slug;
$$;
REVOKE ALL ON FUNCTION public.bump_slug_redirect_hit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_slug_redirect_hit(text) TO anon, authenticated;

-- Atomic backfill: every existing business gets a slug before the column
-- becomes NOT NULL + UNIQUE below. Mirrors src/lib/slug-service.ts's
-- slugify() algorithm; dropped once the backfill is done -- one-off
-- migration logic doesn't stay as permanent DB surface.
CREATE OR REPLACE FUNCTION public._backfill_business_slug(p_name text, p_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  suffix int := 1;
BEGIN
  -- Basic Latin diacritic stripping (mirrors slugify()'s NFD-strip-combining-
  -- marks step for the common French/Spanish/Portuguese accented letters this
  -- app's markets realistically produce) so "Rosé" backfills to "rose", not
  -- a truncated "ros".
  base := translate(
    lower(p_name),
    'àáâãäåèéêëìíîïòóôõöùúûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy'
  );
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  IF base IS NULL OR length(base) < 3 OR base !~ '[a-z]' THEN
    base := 'business-' || substr(p_id::text, 1, 8);
  END IF;
  candidate := base;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.businesses WHERE slug = candidate
    ) AND NOT EXISTS (
      SELECT 1 FROM public.business_slug_redirects WHERE old_slug = candidate
    );
    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  END LOOP;
  RETURN candidate;
END;
$$;

UPDATE public.businesses
SET slug = public._backfill_business_slug(name, id)
WHERE slug IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.businesses WHERE slug IS NULL) > 0 THEN
    RAISE EXCEPTION 'business slug backfill left NULL rows -- aborting migration';
  END IF;
END;
$$;

DROP FUNCTION public._backfill_business_slug(text, uuid);

ALTER TABLE public.businesses
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT businesses_slug_unique UNIQUE (slug);
CREATE UNIQUE INDEX businesses_slug_lower_idx ON public.businesses (lower(slug));
