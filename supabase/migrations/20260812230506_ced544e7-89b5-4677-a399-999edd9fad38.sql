-- Role vocabulary rename: customer -> client, staff -> specialist.
-- Verified safe against RLS: no policy or helper function (has_role, owns_salon,
-- is_salon_staff, is_platform_admin, is_super_admin) hardcodes these labels as
-- literals; they only ever receive 'admin'/'salon_owner'/'super_admin', which
-- are unchanged. RENAME VALUE preserves existing user_roles data as-is.
--
-- Out of scope, deliberately untouched: the `staff` table and its satellite
-- tables (staff_schedules, staff_services, staff_day_hours, staff_breaks,
-- staff_time_off, staff_join_requests) model salon employee data, not the
-- auth role, and keep their existing names.
ALTER TYPE public.app_role RENAME VALUE 'customer' TO 'client';
ALTER TYPE public.app_role RENAME VALUE 'staff' TO 'specialist';

-- handle_new_user() compares raw_user_meta_data->>'role' as plain text before
-- casting to app_role, so RENAME VALUE above does not update these literals —
-- they must be swapped explicitly in the same migration. Body is otherwise
-- identical to the version in 20260812190000_...sql (guest-booking claim
-- logic unchanged).
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requested text := COALESCE(NEW.raw_user_meta_data ->> 'role', 'client');
  assigned public.app_role;
BEGIN
  IF lower(NEW.email) = 'mimou@devlly.net' THEN
    assigned := 'super_admin';
  ELSIF requested IN ('client', 'salon_owner', 'specialist') THEN
    assigned := requested::public.app_role;
  ELSE
    assigned := 'client';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, locale)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    COALESCE(NEW.raw_user_meta_data ->> 'locale', 'en')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Link any guest bookings placed under this email before the account existed.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.bookings
    SET customer_id = NEW.id, updated_at = now()
    WHERE customer_id IS NULL
      AND customer_email IS NOT NULL
      AND lower(customer_email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
