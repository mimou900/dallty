-- services
DROP POLICY IF EXISTS "Anyone reads services" ON public.services;
CREATE POLICY "Anyone reads services" ON public.services FOR SELECT TO anon, authenticated
USING (is_active OR public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()));

-- staff
DROP POLICY IF EXISTS "Anyone reads staff" ON public.staff;
CREATE POLICY "Anyone reads staff" ON public.staff FOR SELECT TO anon, authenticated
USING (is_active OR user_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()));

-- staff_schedules
DROP POLICY IF EXISTS "Read schedules of active staff or managed staff" ON public.staff_schedules;
CREATE POLICY "Read schedules of active staff or managed staff" ON public.staff_schedules FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.staff s JOIN public.salons sa ON sa.id = s.salon_id
  WHERE s.id = staff_schedules.staff_id
    AND ((s.is_active AND sa.is_active) OR s.user_id = auth.uid()
         OR public.owns_salon(auth.uid(), s.salon_id) OR public.is_platform_admin(auth.uid()))));

-- staff_breaks
DROP POLICY IF EXISTS "Read breaks of active staff or managed staff" ON public.staff_breaks;
CREATE POLICY "Read breaks of active staff or managed staff" ON public.staff_breaks FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.staff s JOIN public.salons sa ON sa.id = s.salon_id
  WHERE s.id = staff_breaks.staff_id
    AND ((s.is_active AND sa.is_active) OR s.user_id = auth.uid()
         OR public.owns_salon(auth.uid(), s.salon_id) OR public.is_platform_admin(auth.uid()))));

-- staff_time_off
DROP POLICY IF EXISTS "Read time off of active staff or managed staff" ON public.staff_time_off;
CREATE POLICY "Read time off of active staff or managed staff" ON public.staff_time_off FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.staff s JOIN public.salons sa ON sa.id = s.salon_id
  WHERE s.id = staff_time_off.staff_id
    AND ((s.is_active AND sa.is_active) OR s.user_id = auth.uid()
         OR public.owns_salon(auth.uid(), s.salon_id) OR public.is_platform_admin(auth.uid()))));

-- salon_gallery
DROP POLICY IF EXISTS "Anyone reads gallery of active salons" ON public.salon_gallery;
CREATE POLICY "Anyone reads gallery of active salons" ON public.salon_gallery FOR SELECT TO anon, authenticated
USING (EXISTS (
  SELECT 1 FROM public.salons s
  WHERE s.id = salon_gallery.salon_id
    AND (s.is_active OR s.owner_id = auth.uid() OR public.is_platform_admin(auth.uid()))));