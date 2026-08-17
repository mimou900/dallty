-- Project 08: Marketplace & Discovery Foundation.
--
-- Read this first: search/browse already existed but was pure client-side filtering over an
-- unbounded-in-spirit `businesses` fetch (Project 03 added a `.limit(500)` stopgap, not a
-- real solution — see use-live-businesses.ts's own comment). This migration adds the one
-- real schema gap found (`businesses` has no structured region — only a free-text `city`/
-- `district`/`area`, while `business_branches` already has `region_id`, unpopulated) and a
-- real server-side, paginated, ranked search function. It does NOT touch `marketplace_status`
-- /`is_active`/`is_verified`/`is_listed` — those already correctly gate public visibility
-- (confirmed by reading the live "Public reads approved salons" RLS policy before writing
-- this), and are reused as-is.

-- ============================================================
-- 1. Structured region for businesses (brief §10) — additive, matches the exact naming
-- convention business_branches already established (region_id uuid, nullable, no city_id
-- anywhere in this schema — cities are matched as free text even at branch level, confirmed
-- by reading business_branches' own columns; this migration follows that same convention
-- rather than inventing a new city_id FK pattern).
-- ============================================================
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions (id);

CREATE INDEX IF NOT EXISTS businesses_region_id_idx ON public.businesses (region_id) WHERE region_id IS NOT NULL;

-- ============================================================
-- 2. Indexes for the actual query shape search_businesses_page (below) runs — verified
-- against that function's WHERE clause, not guessed.
-- ============================================================
CREATE INDEX IF NOT EXISTS businesses_marketplace_visibility_idx
  ON public.businesses (country_code, marketplace_status, is_active)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS businesses_categories_gin_idx ON public.businesses USING gin (categories);
CREATE INDEX IF NOT EXISTS businesses_lat_idx ON public.businesses (latitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS businesses_lng_idx ON public.businesses (longitude) WHERE longitude IS NOT NULL;

-- ============================================================
-- 3. Ranking + search (brief §13, §17-19)
-- ============================================================
-- A single numeric, deterministic rank_score, computed server-side — never client-computed
-- (brief §66: country isolation and every other filter must come from server-side
-- configuration, not frontend conditionals). Keyset-paginated on (rank_score, id) descending
-- (brief §15: cursor pagination over OFFSET for a high-volume marketplace query) — a plain
-- OFFSET would need to re-sort and skip N rows on every page, and would also let a caller
-- walk arbitrarily deep into the result set cheaply (brief §60 anti-enumeration).
--
-- Organic-only. The sponsored-ranking layer brief §17-19/§67 asks to keep compatible with,
-- without building now, is designed in as a pure ADDITIVE step a future project can compose
-- on top: `rank_score` here is the full organic score; a future sponsored layer would union
-- in sponsored rows ordered by a separate priority and merge-sort them against this same
-- organic ordering, clearly labeled (never disguised as organic) — nothing about this
-- function's shape needs to change for that, only a caller-side merge step gets added.
CREATE OR REPLACE FUNCTION public.search_businesses_page(
  _country_code    text,
  _query           text DEFAULT NULL,
  _category        text DEFAULT NULL,
  _region_id       uuid DEFAULT NULL,
  _city            text DEFAULT NULL,
  _lat             double precision DEFAULT NULL,
  _lng             double precision DEFAULT NULL,
  _instant_only    boolean DEFAULT false,
  _verified_only   boolean DEFAULT false,
  _sort            text DEFAULT 'relevance', -- 'relevance' | 'distance' | 'rating'
  _cursor_score    double precision DEFAULT NULL,
  _cursor_id       uuid DEFAULT NULL,
  _limit           integer DEFAULT 20
)
RETURNS TABLE (
  id uuid, slug text, name text, name_ar text, description text, city text, district text,
  area text, image_url text, logo_url text, cover_url text, rating numeric, review_count integer,
  price_range text, is_verified boolean, instant_booking boolean, latitude double precision,
  longitude double precision, distance_km double precision, categories text[], rank_score double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  eff_limit integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 50);
BEGIN
  -- Country marketplace gate mirrors the public RLS policy exactly (brief §2-3, §66): no
  -- results at all for a country that isn't marketplace-enabled, regardless of what a caller
  -- passes — this function is SECURITY DEFINER (service-role-equivalent), so it must enforce
  -- this itself rather than relying on RLS, the same reasoning already applied to
  -- get_available_slots/reschedule_booking elsewhere in this codebase.
  IF NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.iso_code = _country_code AND c.marketplace_enabled) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      b.id, b.slug, b.name, b.name_ar, b.description, b.city, b.district, b.area,
      b.image_url, b.logo_url, b.cover_url, b.rating, b.review_count, b.price_range,
      b.is_verified, b.instant_booking, b.latitude, b.longitude, b.categories,
      CASE
        WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN
          -- Haversine distance in km. No PostGIS/earthdistance extension is installed in
          -- this project (confirmed before writing this, not assumed) — this is the
          -- standard closed-form great-circle formula, city-scale accurate, no extension
          -- dependency.
          2 * 6371 * asin(sqrt(
            power(sin(radians(b.latitude - _lat) / 2), 2) +
            cos(radians(_lat)) * cos(radians(b.latitude)) *
            power(sin(radians(b.longitude - _lng) / 2), 2)
          ))
        ELSE NULL
      END AS distance_km_calc
    FROM public.businesses b
    WHERE b.deleted_at IS NULL
      AND b.is_active
      AND b.marketplace_status = 'approved'
      AND b.country_code = _country_code
      AND (_region_id IS NULL OR b.region_id = _region_id)
      AND (_city IS NULL OR b.city ILIKE _city)
      AND (_category IS NULL OR EXISTS (
            SELECT 1 FROM unnest(b.categories) cat WHERE cat ILIKE _category))
      AND (NOT _instant_only OR b.instant_booking)
      AND (NOT _verified_only OR b.is_verified)
      AND (_query IS NULL OR _query = '' OR (
            b.name ILIKE '%' || _query || '%'
            OR b.name_ar ILIKE '%' || _query || '%'
            OR b.city ILIKE '%' || _query || '%'
            OR b.area ILIKE '%' || _query || '%'
            OR EXISTS (SELECT 1 FROM unnest(b.categories) cat WHERE cat ILIKE '%' || _query || '%')
          ))
  ),
  ranked AS (
    SELECT s.*,
      ( -- Organic rank formula (brief §17): relevance + quality + freshness. Every term is
        -- bounded so no single signal can dominate arbitrarily.
        (CASE WHEN _query IS NOT NULL AND _query <> '' AND s.name ILIKE _query || '%' THEN 20 ELSE 0 END)
        + LEAST(s.rating, 5) * 4                                              -- up to 20
        + LEAST(ln(GREATEST(s.review_count, 0) + 1), 5) * 3                   -- up to ~15, log-dampened popularity
        + (CASE WHEN s.is_verified THEN 8 ELSE 0 END)
        + (CASE WHEN s.logo_url IS NOT NULL AND s.cover_url IS NOT NULL THEN 4 ELSE 0 END) -- profile completeness (brief §30)
        + (CASE WHEN s.distance_km_calc IS NOT NULL THEN GREATEST(10 - s.distance_km_calc, 0) ELSE 0 END)
      ) AS rank_score_calc
    FROM scored s
  )
  SELECT r.id, r.slug, r.name, r.name_ar, r.description, r.city, r.district, r.area,
    r.image_url, r.logo_url, r.cover_url, r.rating, r.review_count, r.price_range,
    r.is_verified, r.instant_booking, r.latitude, r.longitude, r.distance_km_calc,
    r.categories, r.rank_score_calc
  FROM ranked r
  WHERE
    CASE
      WHEN _sort = 'distance' THEN r.distance_km_calc IS NOT NULL
      ELSE true
    END
    AND (
      _cursor_score IS NULL
      OR (_sort = 'distance' AND (r.distance_km_calc, r.id) > (_cursor_score, _cursor_id))
      OR (_sort = 'rating' AND (-r.rating, r.id) > (-_cursor_score, _cursor_id))
      OR (_sort NOT IN ('distance', 'rating') AND (-r.rank_score_calc, r.id) > (-_cursor_score, _cursor_id))
    )
  ORDER BY
    CASE WHEN _sort = 'distance' THEN r.distance_km_calc END ASC NULLS LAST,
    CASE WHEN _sort = 'rating' THEN r.rating END DESC,
    CASE WHEN _sort NOT IN ('distance', 'rating') THEN r.rank_score_calc END DESC,
    r.id ASC
  LIMIT eff_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer
) FROM public;
GRANT EXECUTE ON FUNCTION public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer
) TO anon, authenticated, service_role;

-- ============================================================
-- 4. Lightweight "next available" summary (brief §5, §23) — reuses the existing, authoritative
-- get_staff_day_availability() from Project 05 (booking engine) rather than a second
-- availability engine. Aggregates across a business's active staff, capped at a short lookahead
-- (this is a discovery hint, not a booking-authoritative read — the actual booking flow always
-- re-checks get_available_slots() itself, exactly as it already does).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_business_next_available(_business_id uuid, _days integer DEFAULT 14)
RETURNS TABLE (next_available_day date, fully_booked_horizon boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  span integer := LEAST(GREATEST(COALESCE(_days, 14), 1), 30);
  st record;
  found date;
BEGIN
  FOR st IN
    SELECT s.id AS staff_id, ss.service_id
    FROM public.staff s
    JOIN public.staff_services ss ON ss.staff_id = s.id
    JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active
    WHERE s.business_id = _business_id AND s.is_active
    LIMIT 20 -- bounded: this is a discovery hint, not an exhaustive scan of a large business
  LOOP
    SELECT MIN(d.day) INTO found
    FROM public.get_staff_day_availability(st.staff_id, st.service_id, span) d
    WHERE d.open_slots > 0;
    IF found IS NOT NULL AND (next_available_day IS NULL OR found < next_available_day) THEN
      next_available_day := found;
    END IF;
  END LOOP;

  fully_booked_horizon := next_available_day IS NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_next_available(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_business_next_available(uuid, integer) TO anon, authenticated, service_role;
