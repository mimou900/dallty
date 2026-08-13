ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'AE',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'AED',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dubai';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code text;

-- Backfill ISO codes from the existing free-text country values.
UPDATE public.salons SET country_code = m.code, currency = m.cur, timezone = m.tz
FROM (VALUES
  ('algeria','DZ','DZD','Africa/Algiers'),
  ('saudi','SA','SAR','Asia/Riyadh'),
  ('saudi arabia','SA','SAR','Asia/Riyadh'),
  ('united arab emirates','AE','AED','Asia/Dubai'),
  ('uae','AE','AED','Asia/Dubai'),
  ('egypt','EG','EGP','Africa/Cairo'),
  ('morocco','MA','MAD','Africa/Casablanca'),
  ('tunisia','TN','TND','Africa/Tunis'),
  ('qatar','QA','QAR','Asia/Qatar'),
  ('kuwait','KW','KWD','Asia/Kuwait'),
  ('bahrain','BH','BHD','Asia/Bahrain'),
  ('oman','OM','OMR','Asia/Muscat'),
  ('jordan','JO','JOD','Asia/Amman'),
  ('lebanon','LB','LBP','Asia/Beirut'),
  ('iraq','IQ','IQD','Asia/Baghdad'),
  ('libya','LY','LYD','Africa/Tripoli'),
  ('sudan','SD','SDG','Africa/Khartoum'),
  ('syria','SY','SYP','Asia/Damascus'),
  ('yemen','YE','YER','Asia/Aden'),
  ('palestine','PS','ILS','Asia/Hebron'),
  ('mauritania','MR','MRU','Africa/Nouakchott'),
  ('somalia','SO','SOS','Africa/Mogadishu'),
  ('djibouti','DJ','DJF','Africa/Djibouti'),
  ('comoros','KM','KMF','Indian/Comoro')
) AS m(name, code, cur, tz)
WHERE lower(trim(coalesce(public.salons.country, ''))) = m.name;

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
  tz text;
BEGIN
  SELECT duration_minutes INTO dur FROM public.services WHERE id = _service_id;
  IF dur IS NULL THEN RETURN; END IF;

  SELECT sa.timezone INTO tz
  FROM public.staff st JOIN public.salons sa ON sa.id = st.salon_id
  WHERE st.id = _staff_id;
  tz := COALESCE(tz, 'UTC');

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
          AND tstzrange((_day + br.starts_at) AT TIME ZONE tz, (_day + br.ends_at) AT TIME ZONE tz, '[)')
              && tstzrange(cur, cur + make_interval(mins => dur), '[)')
      );
    RETURN NEXT;
    cur := cur + interval '30 minutes';
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_salon_availability_summary(_salon_id uuid, _days integer DEFAULT 14)
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
  SELECT COALESCE(sa.timezone, 'UTC') INTO tz FROM public.salons sa WHERE sa.id = _salon_id;
  tz := COALESCE(tz, 'UTC');
  today := (now() AT TIME ZONE tz)::date;

  FOR r IN
    SELECT st.id AS sid, sv.id AS svid
    FROM public.staff st
    JOIN public.staff_services ss ON ss.staff_id = st.id
    JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active AND sv.salon_id = _salon_id
    WHERE st.salon_id = _salon_id AND st.is_active
  LOOP
    cnt := 0;
    d := today;
    WHILE d < today + span LOOP
      cnt := cnt + (
        SELECT count(*) FROM public.get_available_slots(r.sid, r.svid, d) g WHERE g.available
      );
      d := d + 1;
    END LOOP;

    staff_id := r.sid;
    service_id := r.svid;
    has_schedule := EXISTS (SELECT 1 FROM public.staff_schedules x WHERE x.staff_id = r.sid)
      OR EXISTS (
        SELECT 1 FROM public.staff_day_hours dh
        WHERE dh.staff_id = r.sid AND dh.day >= today AND dh.day < today + span
      );
    open_slots := cnt;
    RETURN NEXT;
  END LOOP;
END;
$function$;