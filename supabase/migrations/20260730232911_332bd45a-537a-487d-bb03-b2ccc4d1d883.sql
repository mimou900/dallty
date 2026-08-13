-- 1. Lock down SECURITY DEFINER helper functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.owns_salon(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_salon_staff(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notify_waitlist_on_free_slot() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date) TO anon, authenticated;

-- 2. Restrict staff_schedules reads
DROP POLICY IF EXISTS "Anyone reads schedules" ON public.staff_schedules;
CREATE POLICY "Read schedules of active staff or managed staff"
ON public.staff_schedules FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.salons sa ON sa.id = s.salon_id
    WHERE s.id = staff_schedules.staff_id
      AND ((s.is_active AND sa.is_active)
        OR s.user_id = auth.uid()
        OR public.owns_salon(auth.uid(), s.salon_id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

-- 3. Restrict staff_breaks reads
DROP POLICY IF EXISTS "Anyone reads breaks" ON public.staff_breaks;
CREATE POLICY "Read breaks of active staff or managed staff"
ON public.staff_breaks FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.salons sa ON sa.id = s.salon_id
    WHERE s.id = staff_breaks.staff_id
      AND ((s.is_active AND sa.is_active)
        OR s.user_id = auth.uid()
        OR public.owns_salon(auth.uid(), s.salon_id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

-- 4. Restrict staff_time_off reads and hide the reason from anonymous users
DROP POLICY IF EXISTS "Anyone reads time off" ON public.staff_time_off;
CREATE POLICY "Read time off of active staff or managed staff"
ON public.staff_time_off FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff s
    JOIN public.salons sa ON sa.id = s.salon_id
    WHERE s.id = staff_time_off.staff_id
      AND ((s.is_active AND sa.is_active)
        OR s.user_id = auth.uid()
        OR public.owns_salon(auth.uid(), s.salon_id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
);

REVOKE SELECT ON public.staff_time_off FROM anon;
GRANT SELECT (id, staff_id, day, created_at) ON public.staff_time_off TO anon;
