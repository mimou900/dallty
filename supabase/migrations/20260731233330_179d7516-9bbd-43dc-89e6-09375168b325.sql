-- 1. Column-level protection for public salon reads
REVOKE SELECT ON public.salons FROM anon;
GRANT SELECT (
  id, owner_id, name, name_ar, description, description_ar, area, area_ar, city,
  image_url, rating, review_count, price_range, distance_km, opens_at, closes_at,
  instant_booking, is_active, created_at, amenities, languages, awards, certifications,
  brands, cancellation_policy, cancellation_policy_ar, house_rules, house_rules_ar,
  owner_story, owner_story_ar, faq, video_tour_url, instagram_url, tiktok_url, phone,
  address, status, business_type, website_url, facebook_url, country, district,
  postal_code, maps_url, latitude, longitude, employee_count, branch_count, logo_url,
  cover_url, updated_at, is_listed, country_code, currency, timezone
) ON public.salons TO anon;

-- 2. staff_services: only expose links for active staff and active services publicly
DROP POLICY IF EXISTS "Anyone reads staff services" ON public.staff_services;
CREATE POLICY "Public reads active staff services"
ON public.staff_services FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff st
    JOIN public.services sv ON sv.id = staff_services.service_id
    WHERE st.id = staff_services.staff_id
      AND st.is_active
      AND sv.is_active
      AND sv.salon_id = st.salon_id
  )
  OR EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = staff_services.staff_id
      AND (public.owns_salon(auth.uid(), s.salon_id) OR public.is_platform_admin(auth.uid()))
  )
);

-- 3. Lock down SECURITY DEFINER routines that are internal-only
REVOKE ALL ON FUNCTION public.notify_booking_audience(uuid, text, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_salon_listing(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_on_booking_change() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_waitlist_on_free_slot() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_salon_rating() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_recompute_listing_from_link() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_recompute_listing_from_salon_row() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_salon_staff(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;