REVOKE SELECT ON public.staff FROM anon, authenticated;

GRANT SELECT (
  id, salon_id, user_id, full_name, full_name_ar, title, title_ar,
  avatar_url, is_active, created_at, invited_at, invite_accepted_at
) ON public.staff TO anon, authenticated;

GRANT ALL ON public.staff TO service_role;

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
BEGIN
  FOR r IN
    SELECT st.id AS sid, sv.id AS svid
    FROM public.staff st
    JOIN public.staff_services ss ON ss.staff_id = st.id
    JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active AND sv.salon_id = _salon_id
    WHERE st.salon_id = _salon_id AND st.is_active
  LOOP
    cnt := 0;
    d := current_date;
    WHILE d < current_date + span LOOP
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
        WHERE dh.staff_id = r.sid AND dh.day >= current_date AND dh.day < current_date + span
      );
    open_slots := cnt;
    RETURN NEXT;
  END LOOP;
END;
$function$;