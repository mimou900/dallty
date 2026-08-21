-- Test-account isolation (requested alongside Project 12's test-account creation task).
-- Confirmed genuinely missing before this: `businesses.is_listed` (default false) already
-- keeps a freshly-created test business out of every PUBLIC surface (the homepage/search
-- query filters `.eq("is_listed", true)` -- src/routes/index.tsx), so no code change was
-- needed there. But `platformOverview` (the Super Admin platform-wide KPI dashboard,
-- src/lib/platform.functions.ts) queries every business/booking/user with NO filter at
-- all -- test businesses and test bookings/revenue would silently inflate real platform
-- totals. This adds the minimal flag needed to exclude test data from that one aggregate
-- surface, without touching the many *business-scoped* admin surfaces (reports.tsx,
-- reconciliation.tsx, platform-directory.server.ts's full business list) where showing a
-- clearly-named test business to the admin managing it is expected, not contamination.
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
