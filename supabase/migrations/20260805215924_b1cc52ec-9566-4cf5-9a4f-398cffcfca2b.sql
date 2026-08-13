
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_keywords text,
  ADD COLUMN IF NOT EXISTS notify_new_booking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_cancellation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_review boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_daily_summary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_email_address text,
  ADD COLUMN IF NOT EXISTS accept_cash boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_card boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accept_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_deposit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slot_interval_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS min_notice_hours integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS allow_waitlist boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.salon_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  opens_at time NOT NULL DEFAULT '09:00',
  closes_at time NOT NULL DEFAULT '21:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (salon_id, weekday)
);

GRANT SELECT ON public.salon_hours TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_hours TO authenticated;
GRANT ALL ON public.salon_hours TO service_role;

ALTER TABLE public.salon_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads salon hours" ON public.salon_hours;
CREATE POLICY "Anyone reads salon hours" ON public.salon_hours
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.salons s WHERE s.id = salon_id AND s.is_active));

DROP POLICY IF EXISTS "Owners manage salon hours" ON public.salon_hours;
CREATE POLICY "Owners manage salon hours" ON public.salon_hours
  FOR ALL TO authenticated
  USING (public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()));

DROP TRIGGER IF EXISTS touch_salon_hours ON public.salon_hours;
CREATE TRIGGER touch_salon_hours BEFORE UPDATE ON public.salon_hours
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

REVOKE SELECT (email, phone) ON public.staff FROM anon, authenticated;
