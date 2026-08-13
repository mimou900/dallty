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
  SELECT COALESCE(sa.timezone, 'UTC') INTO tz
  FROM public.staff st JOIN public.salons sa ON sa.id = st.salon_id
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

REVOKE ALL ON FUNCTION public.get_staff_day_availability(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_day_availability(uuid, uuid, integer) TO anon, authenticated, service_role;