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

  RETURN NEW;
END;
$function$;