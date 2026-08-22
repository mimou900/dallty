-- Project 14 Phase 1: two critical, audit-confirmed fixes, done together since they touch
-- the same policy.
--
-- FINDING 1 (RLS OR-gap, previously undocumented): `businesses` had two permissive SELECT
-- policies -- "Public reads approved businesses" (older, no deleted_at check, no country
-- marketplace_enabled gate) and "Public reads approved salons" (newer, correctly stricter).
-- Postgres RLS combines multiple permissive policies with OR, so the newer, stricter-looking
-- policy provided NO additional protection: a soft-deleted business, or a business in a
-- country where marketplace_enabled=false, that was is_active AND marketplace_status=
-- 'approved' remained publicly readable via the older policy alone. Confirmed live before
-- this fix (both policies' exact qual text read directly via pg_get_expr). Fixed by dropping
-- the older, redundant, looser policy entirely -- the newer one already covers every case the
-- older one did (owner/platform-admin escape hatches included) while adding the missing
-- deleted_at and country gates.
--
-- FINDING 2 (is_test never excluded from any public query, brief's own permanent rule):
-- confirmed via exhaustive grep that no public-facing query -- not the homepage, not
-- /search's client-side query, not the business detail page, not even search_businesses_page()
-- itself -- checks businesses.is_test. Currently zero live impact (no business is
-- simultaneously is_test=true AND is_listed=true AND is_active=true, verified live), but
-- structural, not guaranteed. Fixed here at the RLS layer specifically (not just the RPC)
-- because the audit found the ACTUAL live UI (src/routes/index.tsx,
-- src/hooks/use-live-businesses.ts) queries the businesses table DIRECTLY, bypassing
-- search_businesses_page() entirely -- an RPC-only fix would not have protected the code
-- path real users hit today. This makes is_test exclusion unconditional and unbypassable by
-- any current or future public query, matching the same defense-in-depth reasoning already
-- applied to is_test in Project 13's platformOverview fix.
DROP POLICY IF EXISTS "Public reads approved businesses" ON public.businesses;

DROP POLICY IF EXISTS "Public reads approved salons" ON public.businesses;
CREATE POLICY "Public reads approved salons" ON public.businesses FOR SELECT TO authenticated, anon
  USING (
    deleted_at IS NULL
    AND (
      (
        is_active
        AND marketplace_status = 'approved'::marketplace_status
        AND NOT is_test
        AND EXISTS (
          SELECT 1 FROM public.countries c
          WHERE c.iso_code = businesses.country_code AND c.marketplace_enabled
        )
      )
      OR owner_id = auth.uid()
      OR is_platform_admin(auth.uid())
    )
  );
