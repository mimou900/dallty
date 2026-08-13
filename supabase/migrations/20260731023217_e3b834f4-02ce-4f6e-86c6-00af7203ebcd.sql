CREATE TABLE public.staff_day_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, day),
  CHECK (ends_at > starts_at)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_day_hours TO authenticated;
GRANT ALL ON public.staff_day_hours TO service_role;

ALTER TABLE public.staff_day_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and the specialist can read day hours"
ON public.staff_day_hours FOR SELECT TO authenticated
USING (
  public.is_salon_staff(auth.uid(), staff_id)
  OR public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_day_hours.staff_id
      AND (s.user_id = auth.uid() OR public.owns_salon(auth.uid(), s.salon_id))
  )
);

CREATE POLICY "Managers and the specialist can write day hours"
ON public.staff_day_hours FOR ALL TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_day_hours.staff_id
      AND (s.user_id = auth.uid() OR public.owns_salon(auth.uid(), s.salon_id))
  )
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_day_hours.staff_id
      AND (s.user_id = auth.uid() OR public.owns_salon(auth.uid(), s.salon_id))
  )
);

CREATE TRIGGER touch_staff_day_hours
BEFORE UPDATE ON public.staff_day_hours
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.get_available_slots(_staff_id uuid, _service_id uuid, _day date)
 RETURNS TABLE(slot timestamp with time zone, available boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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

  SELECT dh.starts_at, dh.ends_at INTO win_start, win_end
  FROM public.staff_day_hours dh
  WHERE dh.staff_id = _staff_id AND dh.day = _day;

  IF win_start IS NULL THEN
    SELECT ss.starts_at, ss.ends_at INTO win_start, win_end
    FROM public.staff_schedules ss
    WHERE ss.staff_id = _staff_id AND ss.weekday = EXTRACT(dow FROM _day)::smallint;
  END IF;

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