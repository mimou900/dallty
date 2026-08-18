-- Project 09: Booking Engine & Availability Foundation — Phase 1 (schema only).
--
-- Makes branches (business_branches, already real since Project 01 but with zero consumers)
-- a first-class dimension of hours, staff assignment, service availability/pricing, buffers,
-- holidays, temporary blocks, and bookings themselves.
--
-- SAFE-ROLLOUT STRATEGY: this migration is purely additive. It does NOT touch or drop the
-- existing single-interval-per-day tables (business_hours, staff_schedules, staff_day_hours) —
-- those stay exactly as they are, still read by the current (not-yet-branch-aware)
-- get_available_slots() etc. The new branch-scoped tables are populated from them so both can
-- coexist. Once the availability engine and dashboard UI are migrated onto the new tables
-- (later phases of this project) the old ones will be dropped in a follow-up migration — never
-- before every real consumer has moved off them. This keeps the live app working at every
-- point during rollout, matching the project's own "no false success / no broken window" rule
-- applied to schema changes, not just runtime behavior.
--
-- staff_breaks and staff_time_off are extended in place (branch_id added) rather than
-- duplicated, since their existing shape already tolerates the change: staff_breaks already
-- allows multiple rows/weekday (no unique constraint), and staff_time_off's meaning only
-- narrows (branch_id nullable = "off everywhere", matching today's actual behavior exactly).

-- ============================================================
-- 0. Close a real gap found while writing this migration: the one-time backfill in
--    20260817140000_business_branches.sql only covered businesses that existed at the time it
--    ran. Any business created since (confirmed: 2 real rows, both created 2026-08-17 after
--    that migration) has zero rows in business_branches at all -- which would have made the
--    branch_id backfill below silently skip their bookings. Fixed two ways: backfill the gap
--    now, and add a trigger so no future business can ever be created without a Main branch.
-- ============================================================
INSERT INTO public.business_branches (business_id, name, is_main, address, city, phone, latitude, longitude, timezone, status)
SELECT b.id, 'Main', true, b.address, b.city, b.phone, b.latitude, b.longitude, b.timezone,
       CASE WHEN b.is_active THEN 'active' ELSE 'inactive' END
FROM public.businesses b
WHERE NOT EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.business_id = b.id AND bb.is_main)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_main_branch_for_new_business()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.business_branches (business_id, name, is_main, address, city, phone, latitude, longitude, timezone, status)
  VALUES (NEW.id, 'Main', true, NEW.address, NEW.city, NEW.phone, NEW.latitude, NEW.longitude, NEW.timezone,
          CASE WHEN NEW.is_active THEN 'active' ELSE 'inactive' END);
  RETURN NEW;
END;
$$;
CREATE TRIGGER businesses_create_main_branch AFTER INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.create_main_branch_for_new_business();

-- ============================================================
-- 1. Country-tier and branch-tier buffer defaults
-- ============================================================
-- Buffer hierarchy becomes: COUNTRY DEFAULT -> BUSINESS OVERRIDE -> BRANCH OVERRIDE ->
-- SERVICE OVERRIDE (brief's own 3-tier request, plus a branch tier since branches are now
-- first-class). resolve_buffer_minutes() is extended in Phase 3 to read from all four; this
-- migration only adds the columns.
ALTER TABLE public.countries ADD COLUMN default_buffer_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.business_branches ADD COLUMN buffer_minutes integer;

-- ============================================================
-- 2. staff_branches — a specialist can work at multiple branches of the same business
-- ============================================================
CREATE TABLE public.staff_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.business_branches(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, branch_id)
);
CREATE INDEX staff_branches_branch_id_idx ON public.staff_branches (branch_id);
CREATE UNIQUE INDEX staff_branches_one_primary_idx
  ON public.staff_branches (staff_id) WHERE is_primary;

GRANT SELECT ON public.staff_branches TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.staff_branches TO authenticated;
GRANT ALL ON public.staff_branches TO service_role;
ALTER TABLE public.staff_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_branches_select" ON public.staff_branches FOR SELECT USING (true);
CREATE POLICY "staff_branches_manage" ON public.staff_branches FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id
      AND (public.owns_business(auth.uid(), s.business_id) OR s.user_id = auth.uid()))
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id
      AND (public.owns_business(auth.uid(), s.business_id) OR s.user_id = auth.uid()))
    OR public.is_platform_admin(auth.uid())
  );

-- Backfill: every staff member gets a primary assignment to their business's main branch.
INSERT INTO public.staff_branches (staff_id, branch_id, is_primary)
SELECT s.id, bb.id, true
FROM public.staff s
JOIN public.business_branches bb ON bb.business_id = s.business_id AND bb.is_main
ON CONFLICT (staff_id, branch_id) DO NOTHING;

-- ============================================================
-- 3. Branch-scoped, multi-interval-per-day hours
-- ============================================================
-- No UNIQUE(branch_id, weekday) / UNIQUE(staff_id, branch_id, weekday) here, unlike the old
-- tables -- that's the actual fix for "must not assume one continuous interval" (brief).
CREATE TABLE public.branch_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.business_branches(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);
CREATE INDEX branch_hours_branch_weekday_idx ON public.branch_hours (branch_id, weekday);

CREATE TABLE public.staff_branch_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.business_branches(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX staff_branch_schedules_lookup_idx
  ON public.staff_branch_schedules (staff_id, branch_id, weekday);

CREATE TABLE public.staff_branch_day_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.business_branches(id) ON DELETE CASCADE,
  day date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX staff_branch_day_hours_lookup_idx
  ON public.staff_branch_day_hours (staff_id, branch_id, day);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branch_hours', 'staff_branch_schedules', 'staff_branch_day_hours']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT USING (true)', t, t);
  END LOOP;
END $$;

CREATE POLICY "branch_hours_manage" ON public.branch_hours FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id
      AND public.owns_business(auth.uid(), bb.business_id))
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id
      AND public.owns_business(auth.uid(), bb.business_id))
    OR public.is_platform_admin(auth.uid())
  );

CREATE POLICY "staff_branch_schedules_manage" ON public.staff_branch_schedules FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id
      AND (public.owns_business(auth.uid(), s.business_id) OR s.user_id = auth.uid()))
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id
      AND (public.owns_business(auth.uid(), s.business_id) OR s.user_id = auth.uid()))
    OR public.is_platform_admin(auth.uid())
  );

CREATE POLICY "staff_branch_day_hours_manage" ON public.staff_branch_day_hours FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id
      AND (public.owns_business(auth.uid(), s.business_id) OR s.user_id = auth.uid()))
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id
      AND (public.owns_business(auth.uid(), s.business_id) OR s.user_id = auth.uid()))
    OR public.is_platform_admin(auth.uid())
  );

-- Backfill from the old single-interval tables into the new branch-scoped ones, scoped to
-- each business's/staff's main branch (today's only branch for every existing business).
INSERT INTO public.branch_hours (branch_id, weekday, opens_at, closes_at)
SELECT bb.id, bh.weekday, bh.opens_at, bh.closes_at
FROM public.business_hours bh
JOIN public.business_branches bb ON bb.business_id = bh.business_id AND bb.is_main
WHERE NOT bh.is_closed;

INSERT INTO public.staff_branch_schedules (staff_id, branch_id, weekday, starts_at, ends_at)
SELECT ss.staff_id, bb.id, ss.weekday, ss.starts_at, ss.ends_at
FROM public.staff_schedules ss
JOIN public.staff s ON s.id = ss.staff_id
JOIN public.business_branches bb ON bb.business_id = s.business_id AND bb.is_main;

INSERT INTO public.staff_branch_day_hours (staff_id, branch_id, day, starts_at, ends_at)
SELECT sdh.staff_id, bb.id, sdh.day, sdh.starts_at, sdh.ends_at
FROM public.staff_day_hours sdh
JOIN public.staff s ON s.id = sdh.staff_id
JOIN public.business_branches bb ON bb.business_id = s.business_id AND bb.is_main;

-- ============================================================
-- 4. Extend staff_breaks / staff_time_off with branch scope (in place, not duplicated)
-- ============================================================
ALTER TABLE public.staff_breaks ADD COLUMN branch_id uuid REFERENCES public.business_branches(id) ON DELETE CASCADE;
UPDATE public.staff_breaks sb
SET branch_id = bb.id
FROM public.staff s
JOIN public.business_branches bb ON bb.business_id = s.business_id AND bb.is_main
WHERE s.id = sb.staff_id;
ALTER TABLE public.staff_breaks ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX staff_breaks_branch_idx ON public.staff_breaks (branch_id);

-- branch_id nullable here on purpose: NULL = staff is off at every branch they work (today's
-- only real-world meaning, and still the default going forward); a specific branch_id narrows
-- the time-off to just that branch (e.g. only their Tuesday branch is affected).
-- starts_at/ends_at nullable: both NULL = whole-day off (unchanged behavior); both set = a
-- partial-day absence (brief's explicit "partial-day time off" requirement).
ALTER TABLE public.staff_time_off ADD COLUMN branch_id uuid REFERENCES public.business_branches(id) ON DELETE CASCADE;
ALTER TABLE public.staff_time_off ADD COLUMN starts_at time;
ALTER TABLE public.staff_time_off ADD COLUMN ends_at time;
ALTER TABLE public.staff_time_off ADD CONSTRAINT staff_time_off_partial_range_chk
  CHECK ((starts_at IS NULL) = (ends_at IS NULL) AND (ends_at IS NULL OR ends_at > starts_at));
-- The old UNIQUE(staff_id, day) is dropped: a staff member may now have more than one
-- partial-day time-off row on the same date (e.g. two separate branch-specific absences).
ALTER TABLE public.staff_time_off DROP CONSTRAINT IF EXISTS staff_time_off_staff_id_day_key;
CREATE INDEX staff_time_off_branch_idx ON public.staff_time_off (branch_id) WHERE branch_id IS NOT NULL;

-- ============================================================
-- 5. Branch-specific service availability + pricing
-- ============================================================
-- NULL price/duration_minutes = inherit the base services row unchanged. is_active=false is
-- an explicit "not offered at this branch" override (default: every business service is
-- available at every one of its branches unless a row here says otherwise).
CREATE TABLE public.branch_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.business_branches(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  price numeric(10,2),
  duration_minutes integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, service_id)
);
CREATE INDEX branch_services_service_idx ON public.branch_services (service_id);

GRANT SELECT ON public.branch_services TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branch_services TO authenticated;
GRANT ALL ON public.branch_services TO service_role;
ALTER TABLE public.branch_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branch_services_select" ON public.branch_services FOR SELECT USING (true);
CREATE POLICY "branch_services_manage" ON public.branch_services FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id
      AND public.owns_business(auth.uid(), bb.business_id))
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id
      AND public.owns_business(auth.uid(), bb.business_id))
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- 6. Branch-specific specialist pricing (extends the existing, previously-dead
--    staff_services custom price/duration override, rather than a new parallel table)
-- ============================================================
-- branch_id NULL = the existing behavior: staff's custom price/duration applies wherever they
-- work. A specific branch_id narrows the override to just that branch.
ALTER TABLE public.staff_services ADD COLUMN branch_id uuid REFERENCES public.business_branches(id) ON DELETE CASCADE;
ALTER TABLE public.staff_services DROP CONSTRAINT IF EXISTS staff_services_staff_id_service_id_key;
CREATE UNIQUE INDEX staff_services_default_unique_idx
  ON public.staff_services (staff_id, service_id) WHERE branch_id IS NULL;
CREATE UNIQUE INDEX staff_services_branch_unique_idx
  ON public.staff_services (staff_id, service_id, branch_id) WHERE branch_id IS NOT NULL;

-- ============================================================
-- 7. Holidays — country / business / branch scoped, supports exceptional opening too
-- ============================================================
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('country', 'business', 'branch')),
  country_id uuid REFERENCES public.countries(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.business_branches(id) ON DELETE CASCADE,
  date date NOT NULL,
  name text NOT NULL,
  -- is_closed=false + opens_at/closes_at set = an exceptional OPENING override (e.g. open on
  -- a normally-closed public holiday with special hours). is_closed=true = a normal closure;
  -- opens_at/closes_at are then irrelevant and left null.
  is_closed boolean NOT NULL DEFAULT true,
  opens_at time,
  closes_at time,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'country' AND country_id IS NOT NULL AND business_id IS NULL AND branch_id IS NULL)
    OR (scope = 'business' AND business_id IS NOT NULL AND branch_id IS NULL)
    OR (scope = 'branch' AND branch_id IS NOT NULL)
  ),
  CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at))
);
CREATE INDEX holidays_country_date_idx ON public.holidays (country_id, date) WHERE country_id IS NOT NULL;
CREATE INDEX holidays_business_date_idx ON public.holidays (business_id, date) WHERE business_id IS NOT NULL;
CREATE INDEX holidays_branch_date_idx ON public.holidays (branch_id, date) WHERE branch_id IS NOT NULL;

GRANT SELECT ON public.holidays TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holidays_select" ON public.holidays FOR SELECT USING (true);
-- Country-scope holidays are Super-Admin-configured platform data (mirrors how other
-- country-level reference data in this app is managed); business/branch scope follow the
-- same owner-or-admin pattern as every other business-owned table here.
CREATE POLICY "holidays_manage" ON public.holidays FOR ALL TO authenticated
  USING (
    (scope = 'country' AND public.is_platform_admin(auth.uid()))
    OR (scope = 'business' AND (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())))
    OR (scope = 'branch' AND (
      EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id AND public.owns_business(auth.uid(), bb.business_id))
      OR public.is_platform_admin(auth.uid())
    ))
  )
  WITH CHECK (
    (scope = 'country' AND public.is_platform_admin(auth.uid()))
    OR (scope = 'business' AND (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())))
    OR (scope = 'branch' AND (
      EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id AND public.owns_business(auth.uid(), bb.business_id))
      OR public.is_platform_admin(auth.uid())
    ))
  );

-- ============================================================
-- 8. Temporary blocks — ad-hoc unavailability windows (brief §29), distinct from time-off
-- ============================================================
-- staff_id NULL = blocks the whole branch (e.g. private event); a specific staff_id blocks
-- only that specialist. "Internal reasons must not be exposed publicly" (brief) is enforced
-- at the application layer (Phase 2/3), not by hiding the row from staff/owners here.
CREATE TABLE public.temporary_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.business_branches(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX temporary_blocks_branch_time_idx ON public.temporary_blocks (branch_id, starts_at, ends_at);
CREATE INDEX temporary_blocks_staff_time_idx ON public.temporary_blocks (staff_id, starts_at, ends_at) WHERE staff_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.temporary_blocks TO authenticated;
GRANT ALL ON public.temporary_blocks TO service_role;
ALTER TABLE public.temporary_blocks ENABLE ROW LEVEL SECURITY;
-- Not public-readable (unlike hours/breaks) -- a temporary block's existence and reason are
-- operational business/staff information, not marketplace-facing data. The availability
-- engine (SECURITY DEFINER) consults this table server-side regardless of RLS.
CREATE POLICY "temporary_blocks_read" ON public.temporary_blocks FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id
      AND (public.owns_business(auth.uid(), bb.business_id)
           OR (staff_id IS NOT NULL AND public.is_business_staff(auth.uid(), staff_id))))
    OR public.is_platform_admin(auth.uid())
  );
CREATE POLICY "temporary_blocks_manage" ON public.temporary_blocks FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id
      AND public.owns_business(auth.uid(), bb.business_id))
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.business_branches bb WHERE bb.id = branch_id
      AND public.owns_business(auth.uid(), bb.business_id))
    OR public.is_platform_admin(auth.uid())
  );

-- ============================================================
-- 9. bookings.branch_id — a booking must always resolve to a specific branch
-- ============================================================
ALTER TABLE public.bookings ADD COLUMN branch_id uuid REFERENCES public.business_branches(id);
UPDATE public.bookings b
SET branch_id = bb.id
FROM public.business_branches bb
WHERE bb.business_id = b.business_id AND bb.is_main;
ALTER TABLE public.bookings ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX bookings_branch_id_idx ON public.bookings (branch_id);

-- Same treatment for booking_items, so a historical line item still shows which branch it
-- happened at even if the business later reconfigures its branches.
ALTER TABLE public.booking_items ADD COLUMN branch_id uuid REFERENCES public.business_branches(id);
UPDATE public.booking_items bi
SET branch_id = b.branch_id
FROM public.bookings b
WHERE b.id = bi.booking_id;
ALTER TABLE public.booking_items ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX booking_items_branch_id_idx ON public.booking_items (branch_id);

-- ============================================================
-- 10. waitlist_entries.branch_id — same reasoning as bookings
-- ============================================================
ALTER TABLE public.waitlist_entries ADD COLUMN branch_id uuid REFERENCES public.business_branches(id);
UPDATE public.waitlist_entries w
SET branch_id = bb.id
FROM public.business_branches bb
WHERE bb.business_id = w.business_id AND bb.is_main;
ALTER TABLE public.waitlist_entries ALTER COLUMN branch_id SET NOT NULL;
CREATE INDEX waitlist_entries_branch_id_idx ON public.waitlist_entries (branch_id);
