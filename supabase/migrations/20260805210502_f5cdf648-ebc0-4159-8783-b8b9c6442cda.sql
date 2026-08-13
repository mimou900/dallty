-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.marketplace_status AS ENUM ('draft','pending_review','approved','rejected','hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('unpaid','paid','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Salons
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS marketplace_status public.marketplace_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS marketplace_note text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS booking_confirmation text NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_booking_days integer NOT NULL DEFAULT 60;

UPDATE public.salons
SET marketplace_status = CASE status
    WHEN 'approved' THEN 'approved'::public.marketplace_status
    WHEN 'pending' THEN 'pending_review'::public.marketplace_status
    WHEN 'rejected' THEN 'rejected'::public.marketplace_status
    WHEN 'suspended' THEN 'hidden'::public.marketplace_status
    ELSE 'draft'::public.marketplace_status
  END
WHERE marketplace_status = 'draft';

UPDATE public.salons
SET categories = ARRAY[business_type]
WHERE business_type IS NOT NULL AND business_type <> '' AND cardinality(categories) = 0;

GRANT SELECT (categories, marketplace_status, is_verified, verified_at, booking_confirmation,
              buffer_minutes, cancellation_hours, max_booking_days)
  ON public.salons TO anon, authenticated;
GRANT UPDATE (categories, booking_confirmation, buffer_minutes, cancellation_hours, max_booking_days,
              marketplace_status, marketplace_note, submitted_at)
  ON public.salons TO authenticated;

-- Owners may never approve or verify themselves.
CREATE OR REPLACE FUNCTION public.guard_salon_marketplace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_platform_admin(auth.uid()) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    RAISE EXCEPTION 'Only the Dallty team can change verification';
  END IF;
  IF NEW.marketplace_status IS DISTINCT FROM OLD.marketplace_status
     AND NEW.marketplace_status NOT IN ('draft','pending_review','hidden') THEN
    RAISE EXCEPTION 'Only the Dallty team can approve or reject a salon';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only the Dallty team can change the business status';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS salons_guard_marketplace ON public.salons;
CREATE TRIGGER salons_guard_marketplace
  BEFORE UPDATE ON public.salons
  FOR EACH ROW EXECUTE FUNCTION public.guard_salon_marketplace();

DROP POLICY IF EXISTS "Public reads approved salons" ON public.salons;
CREATE POLICY "Public reads approved salons" ON public.salons
  FOR SELECT TO anon, authenticated
  USING (
    (is_active AND marketplace_status = 'approved')
    OR owner_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
  );

-- 3. Services
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS deposit numeric,
  ADD COLUMN IF NOT EXISTS processing_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cleanup_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tag text,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'standard';

-- 4. Specialists
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS experience_years integer,
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS certificates text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS portfolio text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.staff_services
  ADD COLUMN IF NOT EXISTS custom_price numeric,
  ADD COLUMN IF NOT EXISTS custom_duration_minutes integer;

-- 5. Bookings payment + discount
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS promotion_id uuid,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_price numeric;

-- 6. Promotions
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric NOT NULL,
  min_amount numeric NOT NULL DEFAULT 0,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS promotions_salon_code_key
  ON public.promotions (salon_id, upper(code));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage promotions" ON public.promotions
  FOR ALL TO authenticated
  USING (public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS promotions_touch ON public.promotions;
CREATE TRIGGER promotions_touch BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_promotion_id_fkey;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_promotion_id_fkey
  FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE SET NULL;

-- Safe coupon lookup for customers at checkout.
CREATE OR REPLACE FUNCTION public.check_promo_code(_salon_id uuid, _code text, _amount numeric)
RETURNS TABLE(promotion_id uuid, valid boolean, reason text, discount numeric, final_price numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; d numeric := 0;
BEGIN
  SELECT * INTO p FROM public.promotions
  WHERE salon_id = _salon_id AND upper(code) = upper(trim(_code));

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, false, 'not_found', 0::numeric, _amount; RETURN;
  END IF;
  IF NOT p.is_active
     OR (p.starts_at IS NOT NULL AND now() < p.starts_at)
     OR (p.ends_at IS NOT NULL AND now() > p.ends_at) THEN
    RETURN QUERY SELECT NULL::uuid, false, 'expired', 0::numeric, _amount; RETURN;
  END IF;
  IF p.max_uses IS NOT NULL AND p.used_count >= p.max_uses THEN
    RETURN QUERY SELECT NULL::uuid, false, 'used_up', 0::numeric, _amount; RETURN;
  END IF;
  IF _amount < p.min_amount THEN
    RETURN QUERY SELECT NULL::uuid, false, 'min_amount', 0::numeric, _amount; RETURN;
  END IF;

  d := CASE WHEN p.discount_type = 'percent'
            THEN round(_amount * p.discount_value / 100.0, 2)
            ELSE p.discount_value END;
  d := LEAST(GREATEST(d, 0), _amount);

  RETURN QUERY SELECT p.id, true, 'ok', d, _amount - d;
END; $$;

REVOKE ALL ON FUNCTION public.check_promo_code(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_promo_code(uuid, text, numeric) TO anon, authenticated;

-- 7. Marketplace readiness signal
CREATE OR REPLACE FUNCTION public.get_marketplace_readiness(_salon_id uuid)
RETURNS TABLE(
  profile_complete boolean, logo_uploaded boolean, location_set boolean,
  hours_set boolean, has_service boolean, has_specialist boolean,
  service_assigned boolean, working_hours_set boolean, future_availability boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (s.name <> '' AND s.city <> '' AND COALESCE(s.business_phone, s.phone) IS NOT NULL
      AND s.business_email IS NOT NULL AND cardinality(s.categories) > 0),
    s.logo_url IS NOT NULL,
    (s.latitude IS NOT NULL AND s.longitude IS NOT NULL AND s.address IS NOT NULL),
    (s.opens_at IS NOT NULL AND s.closes_at IS NOT NULL),
    EXISTS (SELECT 1 FROM services sv WHERE sv.salon_id = s.id AND sv.is_active),
    EXISTS (SELECT 1 FROM staff st WHERE st.salon_id = s.id AND st.is_active),
    EXISTS (SELECT 1 FROM staff_services ss
            JOIN staff st ON st.id = ss.staff_id AND st.salon_id = s.id AND st.is_active),
    EXISTS (SELECT 1 FROM staff_schedules sc
            JOIN staff st ON st.id = sc.staff_id AND st.salon_id = s.id AND st.is_active),
    EXISTS (SELECT 1 FROM get_salon_availability_summary(s.id, 14) g WHERE g.open_slots > 0)
  FROM salons s
  WHERE s.id = _salon_id
    AND (s.owner_id = auth.uid() OR is_platform_admin(auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.get_marketplace_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketplace_readiness(uuid) TO authenticated;