-- Project 07: populate the deep_link/business_id columns added in the core migration for
-- every in-app notification write path — otherwise those columns exist but stay null
-- forever, which is a dead column, not a real feature (brief §16: notifications should link
-- to the relevant resource, via a route helper the client already has — '/bookings/:id' is
-- the existing customer route for a single booking).

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

  INSERT INTO public.notifications (user_id, kind, title, body, booking_id, business_id, deep_link, category)
  SELECT DISTINCT uid, _kind, _title, _body, _booking_id, b.business_id,
    '/bookings/' || _booking_id, 'booking_lifecycle'
  FROM (
    SELECT b.customer_id AS uid
    UNION SELECT s.user_id FROM public.staff s WHERE s.id = b.staff_id AND s.user_id IS NOT NULL
    UNION SELECT bu.owner_id FROM public.businesses bu WHERE bu.id = b.business_id AND bu.owner_id IS NOT NULL
  ) t
  WHERE uid IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.notify_in_app);
END;
$$;

-- Waitlist notifications: same treatment, business_id/deep_link now populated instead of
-- left null. Logic is otherwise byte-for-byte identical to the version shipped in the core
-- migration (only the two INSERT statements' column lists changed).
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

      INSERT INTO public.notifications (user_id, kind, title, body, booking_id, waitlist_id, business_id, deep_link, category)
      SELECT w.customer_id,
             CASE WHEN w.require_confirmation THEN 'waitlist_pending_confirmation' ELSE 'waitlist_auto_booked' END,
             CASE WHEN w.require_confirmation THEN 'Slot held for you' ELSE 'You are booked!' END,
             'A slot opened on ' || to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') ||
             CASE WHEN w.require_confirmation THEN ' — confirm within the app to keep it.' ELSE ' and was booked for you automatically.' END,
             new_booking, w.id, w.business_id, '/bookings/' || new_booking, 'waitlist'
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = w.customer_id AND p.notify_in_app);

      PERFORM public.emit_notification_event(
        CASE WHEN w.require_confirmation THEN 'waitlist_pending_confirmation' ELSE 'waitlist_auto_booked' END,
        w.business_id, new_booking, NULL, w.customer_id,
        jsonb_build_object('startsAt', NEW.starts_at));

      EXIT;
    ELSE
      UPDATE public.waitlist_entries
      SET status = 'notified', notified_at = now()
      WHERE id = w.id;

      INSERT INTO public.notifications (user_id, kind, title, body, waitlist_id, business_id, category)
      SELECT w.customer_id, 'waitlist_slot_open', 'A slot just opened',
             'A slot opened on ' || to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' — book it before someone else does.',
             w.id, w.business_id, 'waitlist'
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = w.customer_id AND p.notify_in_app);

      PERFORM public.emit_notification_event('waitlist_slot_open', w.business_id, NULL, NULL,
        w.customer_id, jsonb_build_object('startsAt', NEW.starts_at, 'waitlistId', w.id));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
