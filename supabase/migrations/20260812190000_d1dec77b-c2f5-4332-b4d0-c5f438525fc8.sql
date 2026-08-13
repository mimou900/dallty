-- Guest checkout: a booking's identity becomes either an authenticated
-- customer_id or a captured name+phone (+optional email) pair.
ALTER TABLE public.bookings
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_email text;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_identity_present CHECK (
    customer_id IS NOT NULL
    OR (customer_name IS NOT NULL AND customer_phone IS NOT NULL)
  );

-- Fast lookup for claiming guest bookings by email at signup/login.
CREATE INDEX IF NOT EXISTS bookings_guest_email_idx
  ON public.bookings (lower(customer_email))
  WHERE customer_id IS NULL;

-- Claim-on-signup: attach any unclaimed guest bookings that match the new
-- auth user's email. Runs inside the existing on_auth_user_created trigger,
-- SECURITY DEFINER, so it bypasses RLS the same way the profiles/user_roles
-- inserts below it already do.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requested text := COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer');
  assigned public.app_role;
BEGIN
  IF lower(NEW.email) = 'mimou@devlly.net' THEN
    assigned := 'super_admin';
  ELSIF requested IN ('customer', 'salon_owner', 'staff') THEN
    assigned := requested::public.app_role;
  ELSE
    assigned := 'customer';
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
