-- Project 14 Phase 2: additive column extension to search_businesses_page() so
-- use-live-businesses.ts (the actual, live consumer this project is about to wire onto this
-- function) can be swapped onto it with its exact existing output contract unchanged --
-- area_ar, is_active, country_code, business_type are the only fields its mapping reads that
-- the RPC didn't already return. A full rewrite of the search UX onto the RPC's own
-- cursor-pagination/ranking/filter shape is deliberately NOT done in this migration --
-- closing the real security/correctness gap (raw unbounded/unfiltered table access) with the
-- minimal change that achieves it, not bundling in an unrelated UX redesign.
--
-- CREATE OR REPLACE cannot change a function's RETURNS TABLE column list (Postgres error:
-- "cannot change return type of existing function") -- same lesson as has_permission()'s
-- signature change in Project 13, drop first.
DROP FUNCTION IF EXISTS public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer
);

CREATE FUNCTION public.search_businesses_page(
  _country_code    text,
  _query           text DEFAULT NULL,
  _category        text DEFAULT NULL,
  _region_id       uuid DEFAULT NULL,
  _city            text DEFAULT NULL,
  _lat             double precision DEFAULT NULL,
  _lng             double precision DEFAULT NULL,
  _instant_only    boolean DEFAULT false,
  _verified_only   boolean DEFAULT false,
  _sort            text DEFAULT 'relevance',
  _cursor_score    double precision DEFAULT NULL,
  _cursor_id       uuid DEFAULT NULL,
  _limit           integer DEFAULT 20
)
RETURNS TABLE (
  id uuid, slug text, name text, name_ar text, description text, city text, district text,
  area text, area_ar text, image_url text, logo_url text, cover_url text, rating numeric,
  review_count integer, price_range text, is_verified boolean, instant_booking boolean,
  is_active boolean, country_code text, business_type text, latitude double precision,
  longitude double precision, distance_km double precision, categories text[], rank_score double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  eff_limit integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 50);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.iso_code = _country_code AND c.marketplace_enabled) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      b.id, b.slug, b.name, b.name_ar, b.description, b.city, b.district, b.area, b.area_ar,
      b.image_url, b.logo_url, b.cover_url, b.rating, b.review_count, b.price_range,
      b.is_verified, b.instant_booking, b.is_active, b.country_code, b.business_type,
      -- businesses.latitude/longitude are `numeric`, not `double precision` -- confirmed via
      -- information_schema after a live test caught the mismatch ("structure of query does
      -- not match function result type... Returned type numeric does not match expected type
      -- double precision"). This bug already existed in the pre-Project-14 version of this
      -- function too (identical RETURNS TABLE declaration) -- it had simply never been
      -- executed against real matching rows before, confirming the RPC was dead code in
      -- practice, not just unimported. Explicit cast here rather than changing the RETURNS
      -- TABLE type, since the haversine distance math below already assumes double precision
      -- throughout.
      b.latitude::double precision, b.longitude::double precision, b.categories,
      CASE
        WHEN _lat IS NOT NULL AND _lng IS NOT NULL AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL THEN
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
      AND NOT b.is_test
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
      (
        (CASE WHEN _query IS NOT NULL AND _query <> '' AND s.name ILIKE _query || '%' THEN 20 ELSE 0 END)
        + LEAST(s.rating, 5) * 4
        + LEAST(ln(GREATEST(s.review_count, 0) + 1), 5) * 3
        + (CASE WHEN s.is_verified THEN 8 ELSE 0 END)
        + (CASE WHEN s.logo_url IS NOT NULL AND s.cover_url IS NOT NULL THEN 4 ELSE 0 END)
        + (CASE WHEN s.distance_km_calc IS NOT NULL THEN GREATEST(10 - s.distance_km_calc, 0) ELSE 0 END)
      ) AS rank_score_calc
    FROM scored s
  )
  SELECT r.id, r.slug, r.name, r.name_ar, r.description, r.city, r.district, r.area, r.area_ar,
    r.image_url, r.logo_url, r.cover_url, r.rating, r.review_count, r.price_range,
    r.is_verified, r.instant_booking, r.is_active, r.country_code, r.business_type,
    r.latitude, r.longitude, r.distance_km_calc, r.categories, r.rank_score_calc
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

-- A fresh CREATE FUNCTION (after the DROP above) starts with no grants at all -- re-issuing
-- the exact same posture as the original migration: anon/authenticated cannot call this
-- directly (must go through the rate-limited searchBusinesses() server function), only
-- service_role can.
REVOKE ALL ON FUNCTION public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer
) FROM public;
GRANT EXECUTE ON FUNCTION public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer
) TO service_role;
