-- Project 09 Phase 2: branch-aware availability engine.
--
-- Rewrites the four availability RPCs (get_available_slots, get_staff_day_availability,
-- get_business_availability_summary, get_business_next_available) to consume the
-- branch-scoped tables added in Phase 1 (branch_hours, staff_branch_schedules,
-- staff_branch_day_hours, staff_breaks.branch_id, staff_time_off.branch_id, holidays,
-- temporary_blocks) instead of the old single-branch tables (business_hours,
-- staff_schedules, staff_day_hours), which are superseded and left in place only because
-- they are currently empty in production — dropping them is a separate, deliberate cleanup,
-- not bundled into a schema migration.
--
-- A booking must always resolve to a specific branch, so every one of these functions now
-- requires a _branch_id (get_business_next_available's is optional, since it is used as a
-- business-wide "next available anywhere" discovery hint on search cards, before a branch is
-- picked). Available time = branch hours ∩ staff hours at that branch, minus breaks,
-- time-off, holiday closures and temporary blocks — computed with tstzrange/tstzmultirange
-- so multi-interval days (split shifts) are handled correctly without ad-hoc loops.
--
-- Booking-conflict checks stay staff-wide (not branch-scoped): a specialist physically
-- cannot be double-booked across two branches at once.

-- ============================================================
-- 1. Buffer hierarchy: service -> branch -> business -> country default -> 0
-- ============================================================
DROP FUNCTION IF EXISTS public.resolve_buffer_minutes(uuid, uuid);

CREATE FUNCTION public.resolve_buffer_minutes(_business_id uuid, _branch_id uuid, _service_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT buffer_minutes FROM public.services WHERE id = _service_id),
    (SELECT buffer_minutes FROM public.business_branches WHERE id = _branch_id),
    (SELECT buffer_minutes FROM public.businesses WHERE id = _business_id),
    (SELECT c.default_buffer_minutes
       FROM public.countries c
       WHERE c.id = (SELECT bb.country_id FROM public.business_branches bb WHERE bb.id = _branch_id)
          OR c.iso_code = (SELECT b.country_code FROM public.businesses b WHERE b.id = _business_id)
       LIMIT 1),
    0
  )
$function$;

REVOKE ALL ON FUNCTION public.resolve_buffer_minutes(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_buffer_minutes(uuid, uuid, uuid) TO service_role;

-- ============================================================
-- 2. get_available_slots — the core slot generator, now branch-aware
-- ============================================================
DROP FUNCTION IF EXISTS public.get_available_slots(uuid, uuid, date);

CREATE FUNCTION public.get_available_slots(_staff_id uuid, _branch_id uuid, _service_id uuid, _day date)
RETURNS TABLE(slot timestamp with time zone, available boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  dur integer;
  buf integer;
  business_id_v uuid;
  country_id_v uuid;
  interval_minutes integer;
  min_notice interval;
  tz text;
  branch_ranges tstzmultirange := '{}';
  staff_ranges tstzmultirange := '{}';
  working tstzmultirange;
  r record;
  win tstzrange;
  cur timestamptz;
  has_day_override boolean;
  holiday_found boolean;
  holiday_is_closed boolean;
  holiday_opens_at time;
  holiday_closes_at time;
BEGIN
  SELECT s.duration_minutes, s.business_id INTO dur, business_id_v
  FROM public.services s WHERE s.id = _service_id;
  IF dur IS NULL THEN RETURN; END IF;

  -- A staff member only produces slots at a branch they are actually assigned to, and only
  -- at a branch that is currently active.
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_branches sb
    JOIN public.business_branches bb ON bb.id = sb.branch_id AND bb.status = 'active'
    WHERE sb.staff_id = _staff_id AND sb.branch_id = _branch_id
  ) THEN
    RETURN;
  END IF;

  buf := public.resolve_buffer_minutes(business_id_v, _branch_id, _service_id);

  SELECT COALESCE(bb.timezone, bu.timezone, 'UTC'), COALESCE(bb.country_id, (
           SELECT c.id FROM public.countries c WHERE c.iso_code = bu.country_code
         )),
         GREATEST(COALESCE(bu.slot_interval_minutes, 15), 5),
         make_interval(hours => COALESCE(bu.min_notice_hours, 0))
    INTO tz, country_id_v, interval_minutes, min_notice
  FROM public.business_branches bb
  JOIN public.businesses bu ON bu.id = bb.business_id
  WHERE bb.id = _branch_id;
  IF tz IS NULL THEN RETURN; END IF;

  -- Staff full-day time off (branch-specific, or NULL branch_id = off everywhere).
  IF EXISTS (
    SELECT 1 FROM public.staff_time_off t
    WHERE t.staff_id = _staff_id AND t.day = _day
      AND (t.branch_id IS NULL OR t.branch_id = _branch_id)
      AND t.starts_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Most specific applicable holiday for this branch + date wins: branch > business > country.
  SELECT true, h.is_closed, h.opens_at, h.closes_at
    INTO holiday_found, holiday_is_closed, holiday_opens_at, holiday_closes_at
  FROM public.holidays h
  WHERE h.date = _day
    AND (
      (h.scope = 'branch' AND h.branch_id = _branch_id)
      OR (h.scope = 'business' AND h.business_id = business_id_v)
      OR (h.scope = 'country' AND h.country_id = country_id_v)
    )
  ORDER BY CASE h.scope WHEN 'branch' THEN 1 WHEN 'business' THEN 2 ELSE 3 END
  LIMIT 1;
  IF NOT FOUND THEN
    holiday_found := false;
  END IF;

  IF holiday_found AND holiday_is_closed THEN
    RETURN; -- whole branch closed this date, no slots for anyone
  END IF;

  IF holiday_found AND NOT holiday_is_closed AND holiday_opens_at IS NOT NULL THEN
    -- Exceptional opening: replaces the normal weekly branch hours for this one date.
    branch_ranges := branch_ranges + tstzmultirange(tstzrange(
      (_day + holiday_opens_at) AT TIME ZONE tz, (_day + holiday_closes_at) AT TIME ZONE tz, '[)'));
  ELSE
    FOR r IN
      SELECT opens_at, closes_at FROM public.branch_hours
      WHERE branch_id = _branch_id AND weekday = EXTRACT(dow FROM _day)::smallint
    LOOP
      branch_ranges := branch_ranges + tstzmultirange(tstzrange(
        (_day + r.opens_at) AT TIME ZONE tz, (_day + r.closes_at) AT TIME ZONE tz, '[)'));
    END LOOP;
  END IF;
  IF branch_ranges = '{}'::tstzmultirange THEN RETURN; END IF;

  -- Staff working windows: a date-specific override fully replaces the weekly schedule.
  has_day_override := EXISTS (
    SELECT 1 FROM public.staff_branch_day_hours
    WHERE staff_id = _staff_id AND branch_id = _branch_id AND day = _day
  );
  IF has_day_override THEN
    FOR r IN
      SELECT starts_at, ends_at FROM public.staff_branch_day_hours
      WHERE staff_id = _staff_id AND branch_id = _branch_id AND day = _day
    LOOP
      staff_ranges := staff_ranges + tstzmultirange(tstzrange(
        (_day + r.starts_at) AT TIME ZONE tz, (_day + r.ends_at) AT TIME ZONE tz, '[)'));
    END LOOP;
  ELSE
    FOR r IN
      SELECT starts_at, ends_at FROM public.staff_branch_schedules
      WHERE staff_id = _staff_id AND branch_id = _branch_id AND weekday = EXTRACT(dow FROM _day)::smallint
    LOOP
      staff_ranges := staff_ranges + tstzmultirange(tstzrange(
        (_day + r.starts_at) AT TIME ZONE tz, (_day + r.ends_at) AT TIME ZONE tz, '[)'));
    END LOOP;
  END IF;
  IF staff_ranges = '{}'::tstzmultirange THEN RETURN; END IF;

  working := branch_ranges * staff_ranges;

  -- Partial-day time off.
  FOR r IN
    SELECT starts_at, ends_at FROM public.staff_time_off
    WHERE staff_id = _staff_id AND day = _day
      AND (branch_id IS NULL OR branch_id = _branch_id) AND starts_at IS NOT NULL
  LOOP
    working := working - tstzmultirange(tstzrange(
      (_day + r.starts_at) AT TIME ZONE tz, (_day + r.ends_at) AT TIME ZONE tz, '[)'));
  END LOOP;

  -- Recurring breaks, scoped to this branch.
  FOR r IN
    SELECT starts_at, ends_at FROM public.staff_breaks
    WHERE staff_id = _staff_id AND branch_id = _branch_id AND weekday = EXTRACT(dow FROM _day)::smallint
  LOOP
    working := working - tstzmultirange(tstzrange(
      (_day + r.starts_at) AT TIME ZONE tz, (_day + r.ends_at) AT TIME ZONE tz, '[)'));
  END LOOP;

  -- Short-notice blocks: branch-wide (staff_id IS NULL) or targeted at this specialist.
  FOR r IN
    SELECT starts_at, ends_at FROM public.temporary_blocks
    WHERE branch_id = _branch_id AND (staff_id IS NULL OR staff_id = _staff_id)
      AND starts_at < ((_day + 1) AT TIME ZONE tz) AND ends_at > (_day AT TIME ZONE tz)
  LOOP
    working := working - tstzmultirange(tstzrange(r.starts_at, r.ends_at, '[)'));
  END LOOP;

  IF working = '{}'::tstzmultirange THEN RETURN; END IF;

  FOR win IN SELECT unnest(working) LOOP
    cur := lower(win);
    WHILE cur + make_interval(mins => dur) <= upper(win) LOOP
      slot := cur;
      -- Deliberately staff-wide, not branch-scoped: one person cannot be double-booked
      -- across two branches at the same time.
      available := cur > now() + min_notice
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.staff_id = _staff_id
            AND (
              b.status IN ('pending', 'confirmed')
              OR (b.status = 'held' AND b.hold_expires_at > now())
            )
            AND tstzrange(b.starts_at, b.ends_at, '[)')
                && tstzrange(cur, cur + make_interval(mins => dur + buf), '[)')
        );
      RETURN NEXT;
      cur := cur + make_interval(mins => interval_minutes);
    END LOOP;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_available_slots(uuid, uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, uuid, date) TO service_role;

-- ============================================================
-- 3. get_staff_day_availability — per-day rollup, now branch-aware
-- ============================================================
DROP FUNCTION IF EXISTS public.get_staff_day_availability(uuid, uuid, integer);

CREATE FUNCTION public.get_staff_day_availability(
  _staff_id uuid, _branch_id uuid, _service_id uuid, _days integer DEFAULT 14
)
RETURNS TABLE(day date, total_slots integer, open_slots integer, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d date;
  span integer := LEAST(GREATEST(COALESCE(_days, 14), 1), 60);
  tz text;
  today date;
  tot integer;
  op integer;
  has_hours boolean;
  is_off boolean;
BEGIN
  SELECT COALESCE(bb.timezone, bu.timezone, 'UTC') INTO tz
  FROM public.business_branches bb JOIN public.businesses bu ON bu.id = bb.business_id
  WHERE bb.id = _branch_id;
  tz := COALESCE(tz, 'UTC');
  today := (now() AT TIME ZONE tz)::date;

  d := today;
  WHILE d < today + span LOOP
    SELECT count(*)::int, count(*) FILTER (WHERE g.available)::int
      INTO tot, op
    FROM public.get_available_slots(_staff_id, _branch_id, _service_id, d) g;

    is_off := EXISTS (
      SELECT 1 FROM public.staff_time_off t
      WHERE t.staff_id = _staff_id AND t.day = d
        AND (t.branch_id IS NULL OR t.branch_id = _branch_id) AND t.starts_at IS NULL
    );
    has_hours := EXISTS (
        SELECT 1 FROM public.staff_branch_day_hours dh
        WHERE dh.staff_id = _staff_id AND dh.branch_id = _branch_id AND dh.day = d
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_branch_schedules ss
        WHERE ss.staff_id = _staff_id AND ss.branch_id = _branch_id
          AND ss.weekday = EXTRACT(dow FROM d)::smallint
      );

    day := d;
    total_slots := COALESCE(tot, 0);
    open_slots := COALESCE(op, 0);
    status := CASE
      WHEN is_off THEN 'timeoff'
      WHEN NOT has_hours OR COALESCE(tot, 0) = 0 THEN 'closed'
      WHEN COALESCE(op, 0) = 0 THEN 'full'
      WHEN op <= 2 OR op::numeric / GREATEST(tot, 1) <= 0.25 THEN 'limited'
      ELSE 'open'
    END;
    RETURN NEXT;
    d := d + 1;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_staff_day_availability(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_day_availability(uuid, uuid, uuid, integer) TO service_role;

-- ============================================================
-- 4. get_business_availability_summary — per (staff, service) rollup at one branch
-- ============================================================
DROP FUNCTION IF EXISTS public.get_business_availability_summary(uuid, integer);

CREATE FUNCTION public.get_business_availability_summary(
  _salon_id uuid, _branch_id uuid, _days integer DEFAULT 14
)
RETURNS TABLE(staff_id uuid, service_id uuid, has_schedule boolean, open_slots integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  d date;
  cnt integer;
  span integer := LEAST(GREATEST(COALESCE(_days, 14), 1), 30);
  tz text;
  today date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_branches WHERE id = _branch_id AND business_id = _salon_id
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(bb.timezone, bu.timezone, 'UTC') INTO tz
  FROM public.business_branches bb JOIN public.businesses bu ON bu.id = bb.business_id
  WHERE bb.id = _branch_id;
  tz := COALESCE(tz, 'UTC');
  today := (now() AT TIME ZONE tz)::date;

  -- A (staff, service) pair counts at this branch when the staff member is assigned to the
  -- branch, the service is active there (no branch_services row = inherited/visible by
  -- default), and the staff offers the service (a branch-specific staff_services row, or the
  -- default branch_id IS NULL row).
  FOR r IN
    SELECT st.id AS sid, sv.id AS svid
    FROM public.staff st
    JOIN public.staff_branches sb ON sb.staff_id = st.id AND sb.branch_id = _branch_id
    JOIN public.services sv ON sv.business_id = _salon_id AND sv.is_active
    LEFT JOIN public.branch_services bs ON bs.service_id = sv.id AND bs.branch_id = _branch_id
    WHERE st.business_id = _salon_id AND st.is_active
      AND COALESCE(bs.is_active, true)
      AND EXISTS (
        SELECT 1 FROM public.staff_services x
        WHERE x.staff_id = st.id AND x.service_id = sv.id
          AND (x.branch_id = _branch_id OR x.branch_id IS NULL)
      )
  LOOP
    cnt := 0;
    d := today;
    WHILE d < today + span LOOP
      cnt := cnt + (
        SELECT count(*) FROM public.get_available_slots(r.sid, _branch_id, r.svid, d) g WHERE g.available
      );
      d := d + 1;
    END LOOP;

    staff_id := r.sid;
    service_id := r.svid;
    has_schedule := EXISTS (
        SELECT 1 FROM public.staff_branch_schedules x WHERE x.staff_id = r.sid AND x.branch_id = _branch_id
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_branch_day_hours dh
        WHERE dh.staff_id = r.sid AND dh.branch_id = _branch_id AND dh.day >= today AND dh.day < today + span
      );
    open_slots := cnt;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_business_availability_summary(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_availability_summary(uuid, uuid, integer) TO service_role;

-- ============================================================
-- 5. get_business_next_available — discovery hint, branch optional (aggregates across all
--    active branches of the business when none is given, since search cards show this before
--    a branch is picked; Phase 6's branch-aware UI can pass a specific branch instead).
-- ============================================================
DROP FUNCTION IF EXISTS public.get_business_next_available(uuid, integer);

CREATE FUNCTION public.get_business_next_available(
  _business_id uuid, _branch_id uuid DEFAULT NULL, _days integer DEFAULT 14
)
RETURNS TABLE(next_available_day date, fully_booked_horizon boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  span integer := LEAST(GREATEST(COALESCE(_days, 14), 1), 30);
  st record;
  found date;
BEGIN
  FOR st IN
    SELECT sb.staff_id AS staff_id, sb.branch_id AS branch_id, sv.id AS service_id
    FROM public.staff_branches sb
    JOIN public.staff s ON s.id = sb.staff_id AND s.is_active AND s.business_id = _business_id
    JOIN public.business_branches bb ON bb.id = sb.branch_id AND bb.status = 'active'
    JOIN public.services sv ON sv.business_id = _business_id AND sv.is_active
    LEFT JOIN public.branch_services bs ON bs.service_id = sv.id AND bs.branch_id = sb.branch_id
    WHERE (_branch_id IS NULL OR sb.branch_id = _branch_id)
      AND COALESCE(bs.is_active, true)
      AND EXISTS (
        SELECT 1 FROM public.staff_services x
        WHERE x.staff_id = sb.staff_id AND x.service_id = sv.id
          AND (x.branch_id = sb.branch_id OR x.branch_id IS NULL)
      )
    LIMIT 20 -- bounded: this is a discovery hint, not an exhaustive scan of a large business
  LOOP
    SELECT MIN(d.day) INTO found
    FROM public.get_staff_day_availability(st.staff_id, st.branch_id, st.service_id, span) d
    WHERE d.open_slots > 0;
    IF found IS NOT NULL AND (next_available_day IS NULL OR found < next_available_day) THEN
      next_available_day := found;
    END IF;
  END LOOP;

  fully_booked_horizon := next_available_day IS NULL;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_business_next_available(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_next_available(uuid, uuid, integer) TO service_role;
