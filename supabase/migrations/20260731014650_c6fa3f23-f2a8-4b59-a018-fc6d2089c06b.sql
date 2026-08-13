CREATE POLICY "Staff and owners create bookings for their salon"
ON public.bookings FOR INSERT TO authenticated
WITH CHECK (
  public.owns_salon(auth.uid(), salon_id)
  OR public.is_salon_staff(auth.uid(), staff_id)
  OR public.is_platform_admin(auth.uid())
);

CREATE OR REPLACE FUNCTION public.get_salon_availability_summary(_salon_id uuid, _days integer DEFAULT 14)
RETURNS TABLE(staff_id uuid, service_id uuid, has_schedule boolean, open_slots integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    has_schedule := EXISTS (SELECT 1 FROM public.staff_schedules x WHERE x.staff_id = r.sid);
    open_slots := cnt;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_salon_availability_summary(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_salon_availability_summary(uuid, integer) TO anon, authenticated;