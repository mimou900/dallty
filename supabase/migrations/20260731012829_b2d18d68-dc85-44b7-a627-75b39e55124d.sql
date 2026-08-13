CREATE TABLE public.staff_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, service_id)
);

GRANT SELECT ON public.staff_services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_services TO authenticated;
GRANT ALL ON public.staff_services TO service_role;

ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads staff services" ON public.staff_services
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Owners manage staff services" ON public.staff_services
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (public.owns_salon(auth.uid(), s.salon_id) OR public.is_platform_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (public.owns_salon(auth.uid(), s.salon_id) OR public.is_platform_admin(auth.uid()))));

CREATE INDEX idx_staff_services_service ON public.staff_services(service_id);

ALTER TABLE public.salons ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.recompute_salon_listing(_salon_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.salons s
  SET is_listed = EXISTS (
    SELECT 1
    FROM public.staff_services ss
    JOIN public.staff st ON st.id = ss.staff_id AND st.is_active AND st.salon_id = s.id
    JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active AND sv.salon_id = s.id
  )
  WHERE s.id = _salon_id;
$$;

CREATE OR REPLACE FUNCTION public.tg_recompute_listing_from_salon_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_salon_listing(COALESCE(NEW.salon_id, OLD.salon_id));
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recompute_listing_from_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE sid uuid;
BEGIN
  SELECT salon_id INTO sid FROM public.staff WHERE id = COALESCE(NEW.staff_id, OLD.staff_id);
  IF sid IS NOT NULL THEN PERFORM public.recompute_salon_listing(sid); END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_services_listing
AFTER INSERT OR UPDATE OR DELETE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_listing_from_salon_row();

CREATE TRIGGER trg_staff_listing
AFTER INSERT OR UPDATE OR DELETE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_listing_from_salon_row();

CREATE TRIGGER trg_staff_services_listing
AFTER INSERT OR UPDATE OR DELETE ON public.staff_services
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_listing_from_link();

INSERT INTO public.staff_services (staff_id, service_id)
SELECT st.id, sv.id
FROM public.staff st
JOIN public.services sv ON sv.salon_id = st.salon_id
WHERE st.is_active AND sv.is_active
ON CONFLICT DO NOTHING;

UPDATE public.salons s SET is_listed = EXISTS (
  SELECT 1 FROM public.staff_services ss
  JOIN public.staff st ON st.id = ss.staff_id AND st.is_active AND st.salon_id = s.id
  JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active AND sv.salon_id = s.id
);