
-- Recurring breaks
CREATE TABLE public.staff_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL DEFAULT '13:00',
  ends_at time NOT NULL DEFAULT '14:00',
  label text NOT NULL DEFAULT 'Break',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_breaks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_breaks TO authenticated;
GRANT ALL ON public.staff_breaks TO service_role;
ALTER TABLE public.staff_breaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads breaks" ON public.staff_breaks FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owners manage breaks" ON public.staff_breaks FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (public.owns_salon(auth.uid(), s.salon_id) OR s.user_id = auth.uid())) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (public.owns_salon(auth.uid(), s.salon_id) OR s.user_id = auth.uid())) OR public.has_role(auth.uid(),'admin'));

-- Closed dates
CREATE TABLE public.staff_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day date NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, day)
);
GRANT SELECT ON public.staff_time_off TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_time_off TO authenticated;
GRANT ALL ON public.staff_time_off TO service_role;
ALTER TABLE public.staff_time_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads time off" ON public.staff_time_off FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Owners manage time off" ON public.staff_time_off FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (public.owns_salon(auth.uid(), s.salon_id) OR s.user_id = auth.uid())) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (public.owns_salon(auth.uid(), s.salon_id) OR s.user_id = auth.uid())) OR public.has_role(auth.uid(),'admin'));

-- Waitlist
CREATE TYPE public.waitlist_status AS ENUM ('waiting','notified','converted','cancelled');

CREATE TABLE public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day date NOT NULL,
  status public.waitlist_status NOT NULL DEFAULT 'waiting',
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, staff_id, service_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_entries TO authenticated;
GRANT ALL ON public.waitlist_entries TO service_role;
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers create own waitlist" ON public.waitlist_entries FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Read own or managed waitlist" ON public.waitlist_entries FOR SELECT TO authenticated
USING (customer_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_salon_staff(auth.uid(), staff_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Update own or managed waitlist" ON public.waitlist_entries FOR UPDATE TO authenticated
USING (customer_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_salon_staff(auth.uid(), staff_id) OR public.has_role(auth.uid(),'admin'))
WITH CHECK (customer_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_salon_staff(auth.uid(), staff_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Delete own waitlist" ON public.waitlist_entries FOR DELETE TO authenticated USING (customer_id = auth.uid());

CREATE TRIGGER waitlist_touch BEFORE UPDATE ON public.waitlist_entries
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Notify waitlist when a slot frees up
CREATE OR REPLACE FUNCTION public.notify_waitlist_on_free_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    UPDATE public.waitlist_entries w
    SET status = 'notified', notified_at = now()
    WHERE w.status = 'waiting'
      AND w.staff_id = NEW.staff_id
      AND w.day = (NEW.starts_at AT TIME ZONE 'UTC')::date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_notify_waitlist AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_waitlist_on_free_slot();

ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist_entries;

-- Availability respects breaks and closed dates
CREATE OR REPLACE FUNCTION public.get_available_slots(_staff_id uuid, _service_id uuid, _day date)
RETURNS TABLE(slot timestamp with time zone, available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  dur integer;
  win_start time;
  win_end time;
  cur timestamptz;
  win_end_ts timestamptz;
BEGIN
  SELECT duration_minutes INTO dur FROM public.services WHERE id = _service_id;
  IF dur IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.staff_time_off t WHERE t.staff_id = _staff_id AND t.day = _day) THEN
    RETURN;
  END IF;

  SELECT ss.starts_at, ss.ends_at INTO win_start, win_end
  FROM public.staff_schedules ss
  WHERE ss.staff_id = _staff_id AND ss.weekday = EXTRACT(dow FROM _day)::smallint;

  IF win_start IS NULL THEN RETURN; END IF;

  cur := (_day + win_start) AT TIME ZONE 'UTC';
  win_end_ts := (_day + win_end) AT TIME ZONE 'UTC';

  WHILE cur + make_interval(mins => dur) <= win_end_ts LOOP
    slot := cur;
    available := cur > now()
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.staff_id = _staff_id
          AND b.status IN ('pending', 'confirmed')
          AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(cur, cur + make_interval(mins => dur), '[)')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_breaks br
        WHERE br.staff_id = _staff_id
          AND br.weekday = EXTRACT(dow FROM _day)::smallint
          AND tstzrange((_day + br.starts_at) AT TIME ZONE 'UTC', (_day + br.ends_at) AT TIME ZONE 'UTC', '[)')
              && tstzrange(cur, cur + make_interval(mins => dur), '[)')
      );
    RETURN NEXT;
    cur := cur + interval '30 minutes';
  END LOOP;
END;
$function$;
