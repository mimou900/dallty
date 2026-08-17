-- Project 05: Booking Engine core, part 2 (the enum values from 20260817250000 are now
-- committed and safe to reference).

-- ============================================================
-- 1. THE concurrency-safety mechanism (brief §7-8, §36, §39, §75, §78)
-- ============================================================
-- Replaces the old bookings_no_double_booking UNIQUE INDEX on (staff_id, starts_at) --
-- which only caught two bookings sharing the exact same start timestamp -- with a real
-- interval-exclusion constraint: no two rows for the same staff_id may have overlapping
-- [starts_at, ends_at) ranges while in a "live" status. This is enforced by Postgres itself
-- at INSERT/UPDATE time, atomically, for every concurrent transaction -- not an app-level
-- check-then-insert (vulnerable to TOCTOU), and not something application code could get
-- wrong. This is stress-tested with real concurrent requests later in this project, not
-- assumed correct from reading the SQL.
--
-- A "hold" is a bookings row with status='held' -- not a second table -- so the SAME
-- constraint that protects confirmed bookings from each other also protects them from
-- holds, and holds from each other, with zero extra code.
DROP INDEX IF EXISTS public.bookings_no_double_booking;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status IN ('held', 'pending', 'confirmed'));

CREATE INDEX IF NOT EXISTS bookings_hold_expires_at_idx ON public.bookings (hold_expires_at)
  WHERE status = 'held';

-- Held rows past their expiry are treated as non-blocking by every read (get_available_slots
-- below) even before this runs, but a hold that's never converted or re-checked would
-- otherwise sit at status='held' forever. No pg_cron/scheduled-job infrastructure exists in
-- this project (confirmed absent) -- this is called opportunistically (lazy expiration) at
-- the start of hold creation instead, a well-established pattern that needs no external
-- scheduler. A future proactive sweep (pg_cron, if enabled on the project) is documented as
-- a nice-to-have, not required for correctness.
CREATE OR REPLACE FUNCTION public.sweep_expired_holds()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.bookings SET status = 'expired', updated_at = now()
  WHERE status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= now();
$$;
GRANT EXECUTE ON FUNCTION public.sweep_expired_holds() TO service_role;

-- ============================================================
-- 2. Booking items — historical snapshot, multi-service support (brief §13, §40-41)
-- ============================================================
-- bookings.service_id/duration/total_price continue to represent the booking's primary
-- service and overall span/total (unchanged shape, so every existing consumer — staff
-- desk, admin dashboards, reports — keeps working against the same columns). booking_items
-- is the itemized breakdown for bookings with more than one selected service, and for
-- every booking (single or multi-service) it's the immutable historical record: service
-- name/price/duration/currency exactly as they were AT BOOKING TIME, so a later service
-- price change never rewrites a past booking's numbers.
CREATE TABLE public.booking_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  service_id        uuid REFERENCES public.services (id) ON DELETE SET NULL,
  service_name      text NOT NULL,
  service_name_ar   text,
  duration_minutes  integer NOT NULL,
  price             numeric(10,2) NOT NULL,
  currency          text NOT NULL,
  staff_id          uuid REFERENCES public.staff (id) ON DELETE SET NULL,
  business_id       uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  sort_order        smallint NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_items_booking_id_idx ON public.booking_items (booking_id);
CREATE INDEX booking_items_business_id_idx ON public.booking_items (business_id);

ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.booking_items TO authenticated;
GRANT ALL ON public.booking_items TO service_role;
-- Same visibility as the parent booking: the booking's own customer, or the business
-- owner/staff/platform admin. No direct INSERT/UPDATE policy for anon/authenticated —
-- items are written only by the server-side booking-creation path (service-role client),
-- same convention as auth_otp_codes/rate_limit_hits/idempotency_keys.
CREATE POLICY "booking_items_select" ON public.booking_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_items.booking_id
        AND (
          b.customer_id = auth.uid()
          OR public.owns_business(auth.uid(), b.business_id)
          OR public.is_business_staff(auth.uid(), b.staff_id)
          OR public.is_platform_admin(auth.uid())
        )
    )
  );

-- ============================================================
-- 3. Buffer hierarchy (brief §24-25): global default (0) -> business -> service.
-- No specialist-level override, per the brief's explicit instruction to keep this simple
-- for V1. After-service buffer only (not before/both) — same reasoning.
-- ============================================================
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS buffer_minutes integer;

CREATE OR REPLACE FUNCTION public.resolve_buffer_minutes(_business_id uuid, _service_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT buffer_minutes FROM public.services WHERE id = _service_id),
    (SELECT buffer_minutes FROM public.businesses WHERE id = _business_id),
    0
  )
$$;
GRANT EXECUTE ON FUNCTION public.resolve_buffer_minutes(uuid, uuid) TO service_role, authenticated, anon;

-- ============================================================
-- 4. get_available_slots rewrite (brief §17-20, §28-32, §36, §60)
-- ============================================================
-- Fixes three real, previously-dead-column gaps found while auditing this function:
--   - businesses.slot_interval_minutes existed but was never read; the function hardcoded
--     a 30-minute step regardless of what a business configured.
--   - businesses.min_notice_hours existed but was never enforced; a slot 2 minutes in the
--     future was offered as bookable even if the business required e.g. 1 hour's notice.
--   - buffer_minutes (business/service) existed but slot generation didn't reserve it,
--     so back-to-back bookings could be offered with zero cleanup/prep time between them.
-- Also: a 'held' row with an unexpired hold now blocks a slot the same as a real booking
-- (the whole point of the hold system); an expired-but-not-yet-swept 'held' row does not.
CREATE OR REPLACE FUNCTION public.get_available_slots(_staff_id uuid, _service_id uuid, _day date)
RETURNS TABLE (slot timestamptz, available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dur integer;
  buf integer;
  business_id_v uuid;
  interval_minutes integer;
  min_notice interval;
  win_start time;
  win_end time;
  cur timestamptz;
  win_end_ts timestamptz;
  tz text;
BEGIN
  SELECT s.duration_minutes, s.business_id INTO dur, business_id_v
  FROM public.services s WHERE s.id = _service_id;
  IF dur IS NULL THEN RETURN; END IF;

  buf := public.resolve_buffer_minutes(business_id_v, _service_id);

  SELECT b.timezone, COALESCE(b.slot_interval_minutes, 15), make_interval(hours => COALESCE(b.min_notice_hours, 0))
    INTO tz, interval_minutes, min_notice
  FROM public.staff st JOIN public.businesses b ON b.id = st.business_id
  WHERE st.id = _staff_id;
  tz := COALESCE(tz, 'UTC');
  interval_minutes := GREATEST(COALESCE(interval_minutes, 15), 5);

  IF EXISTS (SELECT 1 FROM public.staff_time_off t WHERE t.staff_id = _staff_id AND t.day = _day) THEN
    RETURN;
  END IF;

  SELECT dh.starts_at, dh.ends_at INTO win_start, win_end
  FROM public.staff_day_hours dh
  WHERE dh.staff_id = _staff_id AND dh.day = _day;

  IF win_start IS NULL THEN
    SELECT ss.starts_at, ss.ends_at INTO win_start, win_end
    FROM public.staff_schedules ss
    WHERE ss.staff_id = _staff_id AND ss.weekday = EXTRACT(dow FROM _day)::smallint;
  END IF;

  IF win_start IS NULL THEN RETURN; END IF;

  cur := (_day + win_start) AT TIME ZONE tz;
  win_end_ts := (_day + win_end) AT TIME ZONE tz;

  WHILE cur + make_interval(mins => dur) <= win_end_ts LOOP
    slot := cur;
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
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_breaks br
        WHERE br.staff_id = _staff_id
          AND br.weekday = EXTRACT(dow FROM _day)::smallint
          AND tstzrange((_day + br.starts_at) AT TIME ZONE tz, (_day + br.ends_at) AT TIME ZONE tz, '[)')
              && tstzrange(cur, cur + make_interval(mins => dur + buf), '[)')
      );
    RETURN NEXT;
    cur := cur + make_interval(mins => interval_minutes);
  END LOOP;
END;
$$;

-- ============================================================
-- 5. Atomic reschedule (brief §42-43): never release the old slot before the new one is
-- secured. A Postgres function body IS a single transaction — if the INSERT for the new
-- hold fails (exclusion violation = slot unavailable), the exception propagates out and
-- NOTHING in this function commits, so the old booking is untouched. Only on success does
-- the old row get cancelled, in the same transaction as the new row's creation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reschedule_booking(
  _booking_id uuid,
  _new_starts_at timestamptz,
  _new_ends_at timestamptz,
  _actor_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old public.bookings;
  new_row public.bookings;
BEGIN
  SELECT * INTO old FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF old IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF old.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'BOOKING_NOT_MODIFIABLE';
  END IF;
  IF NOT (
    old.customer_id = _actor_id
    OR public.owns_business(_actor_id, old.business_id)
    OR public.is_business_staff(_actor_id, old.staff_id)
    OR public.is_platform_admin(_actor_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Secure the new slot FIRST. The exclusion constraint makes this atomic and safe against
  -- a concurrent booking for the same staff/time; if it fails, the RAISE inside the INSERT
  -- (via the constraint violation) aborts this whole function, old row untouched.
  INSERT INTO public.bookings (
    customer_id, business_id, service_id, staff_id, starts_at, ends_at, status,
    total_price, notes, customer_name, customer_phone, customer_email
  )
  VALUES (
    old.customer_id, old.business_id, old.service_id, old.staff_id, _new_starts_at, _new_ends_at,
    old.status, old.total_price, old.notes, old.customer_name, old.customer_phone, old.customer_email
  )
  RETURNING * INTO new_row;

  -- Copy the itemized snapshot across so a multi-service booking's breakdown survives the
  -- reschedule unchanged (still historically accurate — same services, same prices).
  INSERT INTO public.booking_items (booking_id, service_id, service_name, service_name_ar,
    duration_minutes, price, currency, staff_id, business_id, sort_order)
  SELECT new_row.id, service_id, service_name, service_name_ar, duration_minutes, price,
    currency, staff_id, business_id, sort_order
  FROM public.booking_items WHERE booking_id = old.id;

  UPDATE public.bookings SET status = 'cancelled', updated_at = now() WHERE id = old.id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, business_id, details)
  VALUES (_actor_id, 'booking.rescheduled', 'booking', new_row.id, old.business_id,
    jsonb_build_object(
      'old_booking_id', old.id, 'old_starts_at', old.starts_at, 'old_ends_at', old.ends_at,
      'new_starts_at', _new_starts_at, 'new_ends_at', _new_ends_at, 'reason', _reason
    ));

  RETURN new_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz, timestamptz, uuid, text) TO service_role;

-- ============================================================
-- 6. Waitlist default (brief §57: "DEFAULT = DISABLED") — the live schema had
-- allow_waitlist defaulting to true (20260805215924). Changing the default only affects
-- future businesses; no existing business data exists to touch (confirmed empty table).
-- ============================================================
ALTER TABLE public.businesses ALTER COLUMN allow_waitlist SET DEFAULT false;
