-- Country-scoped search + map architecture.
--
-- Two things, both additive:
--
-- 1. Viewport-bounded search: search_businesses_page() gets four new trailing
--    optional params (_min_lat/_max_lat/_min_lng/_max_lng) so the map's
--    "Search this area" can query businesses inside the current pan/zoom
--    instead of only ever re-clustering whatever page(s) the list view
--    already fetched. Plain indexed range predicates -- no PostGIS/
--    earthdistance extension installed (confirmed, same reasoning the
--    Haversine distance calc below this already documents), and at this
--    marketplace's scale a composite (country_code, latitude, longitude)
--    index is exactly the query shape this needs, matching the indexing
--    philosophy already established in 20260817330000's own comment.
--    Country + marketplace_enabled gating is unchanged and still first.
--
-- 2. Defense-in-depth composite index also backs the existing single-column
--    businesses_lat_idx/businesses_lng_idx use case; those stay (still used
--    by the plain lat-IS-NOT-NULL / lng-IS-NOT-NULL predicates elsewhere).

CREATE INDEX IF NOT EXISTS businesses_country_latlng_idx
  ON public.businesses (country_code, latitude, longitude)
  WHERE deleted_at IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- CREATE OR REPLACE cannot add parameters -- drop first, same pattern every
-- prior extension of this function has used (20260822110000, 20260823200000).
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
  _limit           integer DEFAULT 20,
  _min_lat         double precision DEFAULT NULL,
  _max_lat         double precision DEFAULT NULL,
  _min_lng         double precision DEFAULT NULL,
  _max_lng         double precision DEFAULT NULL
)
RETURNS TABLE (
  id uuid, slug text, name text, name_ar text, description text, city text, district text,
  area text, area_ar text, image_url text, logo_url text, cover_url text, rating numeric,
  review_count integer, price_range text, is_verified boolean, instant_booking boolean,
  is_active boolean, open_now boolean, country_code text, business_type text,
  latitude double precision, longitude double precision, distance_km double precision,
  categories text[], rank_score double precision
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  eff_limit integer := LEAST(GREATEST(COALESCE(_limit, 20), 1), 50);
  -- All four or none -- a caller sending only some of them almost certainly has a
  -- client bug, and applying a half-formed box would silently narrow/broaden the
  -- query in a way nothing validated. Treat "not all four present" as "no bbox".
  use_bbox boolean := _min_lat IS NOT NULL AND _max_lat IS NOT NULL
                   AND _min_lng IS NOT NULL AND _max_lng IS NOT NULL;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.iso_code = _country_code AND c.marketplace_enabled) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      b.id, b.slug, b.name, b.name_ar, b.description, b.city, b.district, b.area, b.area_ar,
      b.image_url, b.logo_url, b.cover_url, b.rating, b.review_count, b.price_range,
      b.is_verified, b.instant_booking, b.is_active,
      COALESCE(
        EXISTS (
          SELECT 1 FROM public.branch_hours bh
          WHERE bh.branch_id = mb.id
            AND bh.weekday = EXTRACT(dow FROM (now() AT TIME ZONE COALESCE(mb.timezone, 'UTC')))::smallint
            AND (now() AT TIME ZONE COALESCE(mb.timezone, 'UTC'))::time BETWEEN bh.opens_at AND bh.closes_at
        ),
        false
      ) AS open_now_calc,
      b.country_code, b.business_type,
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
    LEFT JOIN LATERAL (
      SELECT bb.id, bb.timezone
      FROM public.business_branches bb
      WHERE bb.business_id = b.id AND bb.is_main
      LIMIT 1
    ) mb ON true
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
      AND (NOT use_bbox OR (
            b.latitude IS NOT NULL AND b.longitude IS NOT NULL
            AND b.latitude BETWEEN _min_lat AND _max_lat
            AND b.longitude BETWEEN _min_lng AND _max_lng
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
    r.is_verified, r.instant_booking, r.is_active, r.open_now_calc, r.country_code, r.business_type,
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

REVOKE ALL ON FUNCTION public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer, double precision, double precision, double precision, double precision
) FROM public;
GRANT EXECUTE ON FUNCTION public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer, double precision, double precision, double precision, double precision
) TO service_role;
