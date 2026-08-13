CREATE OR REPLACE FUNCTION public.submit_salon_for_review(_salon_id uuid)
RETURNS TABLE(ok boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  cur public.marketplace_status;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.salons s
    WHERE s.id = _salon_id
      AND (s.owner_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  ) THEN
    RETURN QUERY SELECT false, 'forbidden'; RETURN;
  END IF;

  SELECT marketplace_status INTO cur FROM public.salons WHERE id = _salon_id;
  IF cur IN ('pending_review', 'approved') THEN
    RETURN QUERY SELECT false, 'already_submitted'; RETURN;
  END IF;

  SELECT * INTO r FROM public.get_marketplace_readiness(_salon_id);
  IF r IS NULL THEN RETURN QUERY SELECT false, 'not_found'; RETURN; END IF;

  IF NOT (r.profile_complete AND r.logo_uploaded AND r.location_set AND r.hours_set
          AND r.has_service AND r.has_specialist AND r.service_assigned
          AND r.working_hours_set AND r.future_availability) THEN
    RETURN QUERY SELECT false, 'incomplete'; RETURN;
  END IF;

  UPDATE public.salons
  SET marketplace_status = 'pending_review',
      marketplace_note = NULL,
      submitted_at = now()
  WHERE id = _salon_id;

  RETURN QUERY SELECT true, 'ok';
END; $$;

REVOKE ALL ON FUNCTION public.submit_salon_for_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_salon_for_review(uuid) TO authenticated, service_role;