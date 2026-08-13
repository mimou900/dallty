-- profiles.country_code already exists but handle_new_user() never populated
-- it, so "Country" (a required profile field) was silently dropped at
-- signup. Same trigger body otherwise -- only the profiles INSERT gains one
-- column, sourced from the same raw_user_meta_data payload as phone/locale.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.profiles (id, full_name, phone, locale, country_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    COALESCE(NEW.raw_user_meta_data ->> 'locale', 'en'),
    NEW.raw_user_meta_data ->> 'country_code'
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
$$;
