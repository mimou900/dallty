ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_accepted_at timestamptz;

-- Keep staff emails out of public/authenticated reads (column-level grants).
REVOKE SELECT ON public.staff FROM anon, authenticated;
GRANT SELECT (id, salon_id, user_id, full_name, full_name_ar, title, title_ar, avatar_url, is_active, created_at, invited_at, invite_accepted_at)
  ON public.staff TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;

CREATE TABLE IF NOT EXISTS public.staff_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  title text NOT NULL DEFAULT 'Specialist',
  phone text,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_join_requests_one_pending
  ON public.staff_join_requests (user_id, salon_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS staff_join_requests_salon_idx ON public.staff_join_requests (salon_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_join_requests TO authenticated;
GRANT ALL ON public.staff_join_requests TO service_role;

ALTER TABLE public.staff_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requester and salon managers read requests"
  ON public.staff_join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Users create their own request"
  ON public.staff_join_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Salon managers review requests"
  ON public.staff_join_requests FOR UPDATE TO authenticated
  USING (public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.owns_salon(auth.uid(), salon_id) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Users cancel their pending request"
  ON public.staff_join_requests FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

CREATE TRIGGER staff_join_requests_touch
  BEFORE UPDATE ON public.staff_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();