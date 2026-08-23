-- Root cause of the reported "asked for phone twice" bug: handle_new_user() only ever copied
-- profiles.phone from raw_user_meta_data ->> 'phone' -- arbitrary self-reported metadata a
-- caller can pass via signUp()'s `options.data`. A brand-new customer created through
-- signInWithOtp({ phone }) (the booking page's inline phone-OTP sign-up, business.
-- $businessSlug.tsx's sendInlineAuthOtp/verifyInlineAuthOtp) never sets that metadata --
-- Supabase writes the verified number to auth.users' own native `phone` column instead. This
-- trigger never read that column, so profiles.phone landed NULL even though the customer had
-- just verified a real number, and the booking flow's `needsPhone` check (reading
-- profiles.phone) asked for it again immediately after.
--
-- Fix: prefer the native, OTP-verified NEW.phone; fall back to the metadata value only when
-- the native column is empty (covers email/OAuth signups that separately passed a phone via
-- metadata, if any caller ever does).
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
    COALESCE(NEW.phone, NEW.raw_user_meta_data ->> 'phone'),
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

-- Backfill: existing accounts created via phone-OTP before this fix, still sitting with a
-- verified auth.users.phone but a NULL profiles.phone. Never overwrites a phone the customer
-- (or the account-security phone-change flow) already set.
UPDATE public.profiles p
SET phone = u.phone
FROM auth.users u
WHERE p.id = u.id
  AND p.phone IS NULL
  AND u.phone IS NOT NULL
  AND u.phone <> '';
