-- Bug fix, discovered during the Project 00/01 audit: four functions were missed by the
-- salon->business rename's function-rewrite migration (20260814030000), which rewrote 14
-- functions but not these. They still reference public.salons / *.salon_id, which no longer
-- exist. Three of the four are bound to live AFTER UPDATE triggers on public.bookings that
-- fire unconditionally on every status/time change, so cancelling or rescheduling any
-- booking currently raises "relation public.salons does not exist" and aborts the
-- transaction. This migration fixes the bodies in place; no signatures, grants, or trigger
-- bindings change, so no DROP/CREATE TRIGGER or re-GRANT is needed.

CREATE OR REPLACE FUNCTION public.notify_booking_audience(
  _booking_id uuid, _kind text, _title text, _body text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
BEGIN
  SELECT bk.customer_id, bk.staff_id, bk.business_id INTO b
  FROM public.bookings bk WHERE bk.id = _booking_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, booking_id)
  SELECT DISTINCT uid, _kind, _title, _body, _booking_id
  FROM (
    SELECT b.customer_id AS uid
    UNION SELECT s.user_id FROM public.staff s WHERE s.id = b.staff_id AND s.user_id IS NOT NULL
    UNION SELECT bu.owner_id FROM public.businesses bu WHERE bu.id = b.business_id AND bu.owner_id IS NOT NULL
  ) t
  WHERE uid IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.notify_in_app);
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  svc text;
BEGIN
  SELECT name INTO svc FROM public.services WHERE id = NEW.service_id;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    PERFORM public.notify_booking_audience(
      NEW.id, 'booking_cancelled', 'Booking cancelled',
      COALESCE(svc, 'Appointment') || ' on ' ||
      to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' was cancelled.');
  ELSIF NEW.starts_at <> OLD.starts_at THEN
    PERFORM public.notify_booking_audience(
      NEW.id, 'booking_rescheduled', 'Booking rescheduled',
      COALESCE(svc, 'Appointment') || ' moved to ' ||
      to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || '.');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_waitlist_on_free_slot()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w record;
  dur integer;
  price numeric;
  new_booking uuid;
  new_status public.booking_status;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  FOR w IN
    SELECT * FROM public.waitlist_entries
    WHERE status = 'waiting'
      AND staff_id = NEW.staff_id
      AND day = (NEW.starts_at AT TIME ZONE 'UTC')::date
    ORDER BY created_at
  LOOP
    SELECT duration_minutes, COALESCE(discount_price, price)
      INTO dur, price FROM public.services WHERE id = w.service_id;

    IF w.auto_book
       AND dur IS NOT NULL
       AND NEW.starts_at + make_interval(mins => dur) <= NEW.ends_at + interval '0 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM public.bookings b
         WHERE b.staff_id = NEW.staff_id
           AND b.status IN ('pending', 'confirmed')
           AND tstzrange(b.starts_at, b.ends_at, '[)')
               && tstzrange(NEW.starts_at, NEW.starts_at + make_interval(mins => dur), '[)')
       )
    THEN
      new_status := CASE WHEN w.require_confirmation THEN 'pending' ELSE 'confirmed' END;
      INSERT INTO public.bookings (customer_id, business_id, service_id, staff_id, starts_at, ends_at, status, total_price, notes)
      VALUES (w.customer_id, w.business_id, w.service_id, w.staff_id, NEW.starts_at,
              NEW.starts_at + make_interval(mins => dur), new_status, COALESCE(price, 0),
              'Auto-booked from waitlist')
      RETURNING id INTO new_booking;

      UPDATE public.waitlist_entries
      SET status = 'converted', notified_at = now(), booking_id = new_booking
      WHERE id = w.id;

      INSERT INTO public.notifications (user_id, kind, title, body, booking_id, waitlist_id)
      SELECT w.customer_id,
             CASE WHEN w.require_confirmation THEN 'waitlist_pending_confirmation' ELSE 'waitlist_auto_booked' END,
             CASE WHEN w.require_confirmation THEN 'Slot held for you' ELSE 'You are booked!' END,
             'A slot opened on ' || to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') ||
             CASE WHEN w.require_confirmation THEN ' — confirm within the app to keep it.' ELSE ' and was booked for you automatically.' END,
             new_booking, w.id
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = w.customer_id AND p.notify_in_app);

      EXIT;
    ELSE
      UPDATE public.waitlist_entries
      SET status = 'notified', notified_at = now()
      WHERE id = w.id;

      INSERT INTO public.notifications (user_id, kind, title, body, waitlist_id)
      SELECT w.customer_id, 'waitlist_slot_open', 'A slot just opened',
             'A slot opened on ' || to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' — book it before someone else does.',
             w.id
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = w.customer_id AND p.notify_in_app);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_day_availability(_staff_id uuid, _service_id uuid, _days integer DEFAULT 14)
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
  SELECT COALESCE(bu.timezone, 'UTC') INTO tz
  FROM public.staff st JOIN public.businesses bu ON bu.id = st.business_id
  WHERE st.id = _staff_id;
  tz := COALESCE(tz, 'UTC');
  today := (now() AT TIME ZONE tz)::date;

  d := today;
  WHILE d < today + span LOOP
    SELECT count(*)::int, count(*) FILTER (WHERE g.available)::int
      INTO tot, op
    FROM public.get_available_slots(_staff_id, _service_id, d) g;

    is_off := EXISTS (SELECT 1 FROM public.staff_time_off t WHERE t.staff_id = _staff_id AND t.day = d);
    has_hours := EXISTS (SELECT 1 FROM public.staff_day_hours dh WHERE dh.staff_id = _staff_id AND dh.day = d)
      OR EXISTS (SELECT 1 FROM public.staff_schedules ss WHERE ss.staff_id = _staff_id AND ss.weekday = EXTRACT(dow FROM d)::smallint);

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
