-- Preferences
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_in_app boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT false;

-- Waitlist auto-booking options
ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS auto_book boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_confirmation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_id uuid;

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  booking_id uuid,
  waitlist_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own notifications"
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER touch_notifications
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Fan-out helper: notify customer, staff user and salon owner
CREATE OR REPLACE FUNCTION public.notify_booking_audience(
  _booking_id uuid, _kind text, _title text, _body text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
BEGIN
  SELECT bk.customer_id, bk.staff_id, bk.salon_id INTO b
  FROM public.bookings bk WHERE bk.id = _booking_id;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, booking_id)
  SELECT DISTINCT uid, _kind, _title, _body, _booking_id
  FROM (
    SELECT b.customer_id AS uid
    UNION SELECT s.user_id FROM public.staff s WHERE s.id = b.staff_id AND s.user_id IS NOT NULL
    UNION SELECT sa.owner_id FROM public.salons sa WHERE sa.id = b.salon_id AND sa.owner_id IS NOT NULL
  ) t
  WHERE uid IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND p.notify_in_app);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_booking_audience(uuid, text, text, text) FROM anon, authenticated, public;

-- Booking change notifications
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

REVOKE EXECUTE ON FUNCTION public.notify_on_booking_change() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS notify_on_booking_change ON public.bookings;
CREATE TRIGGER notify_on_booking_change
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking_change();

-- Waitlist: auto-book or notify when a slot frees up
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
      INSERT INTO public.bookings (customer_id, salon_id, service_id, staff_id, starts_at, ends_at, status, total_price, notes)
      VALUES (w.customer_id, w.salon_id, w.service_id, w.staff_id, NEW.starts_at,
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

REVOKE EXECUTE ON FUNCTION public.notify_waitlist_on_free_slot() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS notify_waitlist_on_free_slot ON public.bookings;
CREATE TRIGGER notify_waitlist_on_free_slot
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_waitlist_on_free_slot();
