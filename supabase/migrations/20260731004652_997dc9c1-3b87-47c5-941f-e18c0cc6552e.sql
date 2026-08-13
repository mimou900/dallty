
-- 1. helper: platform admin (admin or super_admin)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','super_admin'))
$$;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO anon, authenticated;

-- 2. enums
DO $$ BEGIN
  CREATE TYPE public.business_status AS ENUM ('pending','approved','rejected','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_plan AS ENUM ('starter','professional','enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. salon onboarding + status columns
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS status public.business_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS plan public.subscription_plan NOT NULL DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS business_email text,
  ADD COLUMN IF NOT EXISTS business_phone text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS maps_url text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS branch_count integer,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.salons SET status = 'approved' WHERE status = 'pending';

DROP TRIGGER IF EXISTS touch_salons_updated_at ON public.salons;
CREATE TRIGGER touch_salons_updated_at BEFORE UPDATE ON public.salons
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. marketplace visibility: only approved + active salons are public
DROP POLICY IF EXISTS "Anyone reads active salons" ON public.salons;
CREATE POLICY "Public reads approved salons" ON public.salons FOR SELECT TO anon, authenticated
USING ((is_active AND status = 'approved') OR owner_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners insert salons" ON public.salons;
CREATE POLICY "Owners insert salons" ON public.salons FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'salon_owner'));

DROP POLICY IF EXISTS "Owners update salons" ON public.salons;
CREATE POLICY "Owners update salons" ON public.salons FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR public.is_platform_admin(auth.uid()))
WITH CHECK (owner_id = auth.uid() OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners delete salons" ON public.salons;
CREATE POLICY "Owners delete salons" ON public.salons FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- 5. platform admin reach on core tables
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins update profiles" ON public.profiles FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Super admins manage roles" ON public.user_roles FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Read own or managed bookings" ON public.bookings;
CREATE POLICY "Read own or managed bookings" ON public.bookings FOR SELECT TO authenticated
USING (customer_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_salon_staff(auth.uid(), staff_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Update own or managed bookings" ON public.bookings;
CREATE POLICY "Update own or managed bookings" ON public.bookings FOR UPDATE TO authenticated
USING (customer_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_salon_staff(auth.uid(), staff_id) OR public.is_platform_admin(auth.uid()))
WITH CHECK (customer_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_salon_staff(auth.uid(), staff_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone reads visible reviews" ON public.reviews;
CREATE POLICY "Anyone reads visible reviews" ON public.reviews FOR SELECT TO anon, authenticated
USING ((NOT is_hidden) OR customer_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners moderate reviews" ON public.reviews;
CREATE POLICY "Owners moderate reviews" ON public.reviews FOR UPDATE TO authenticated
USING (public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Customers delete own reviews" ON public.reviews;
CREATE POLICY "Customers delete own reviews" ON public.reviews FOR DELETE TO authenticated
USING (customer_id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- 6. admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read audit log" ON public.admin_audit_log FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Platform admins write audit log" ON public.admin_audit_log FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()) AND actor_id = auth.uid());

-- 7. super admin bootstrap on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  requested text := COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer');
  assigned public.app_role;
BEGIN
  IF lower(NEW.email) = 'admin@dallty.com' THEN
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
