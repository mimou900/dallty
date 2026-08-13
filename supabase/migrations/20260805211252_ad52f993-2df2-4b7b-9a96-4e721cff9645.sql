-- 1. Fix broken storage read policies
DROP POLICY IF EXISTS "Review photos readable by uploader, salon owner or admin" ON storage.objects;
CREATE POLICY "Review photos readable by uploader, salon owner or admin"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'review-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.reviews r
      JOIN public.salons s ON s.id = r.salon_id
      WHERE s.owner_id = auth.uid()
        AND r.customer_id::text = (storage.foldername(storage.objects.name))[1]
    )
  )
);

DROP POLICY IF EXISTS "Read salon media" ON storage.objects;
CREATE POLICY "Read salon media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'salon-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.salons s
      WHERE s.owner_id::text = (storage.foldername(storage.objects.name))[1]
        AND s.marketplace_status = 'approved'
        AND s.is_active
    )
  )
);

-- 2. Block owner self-approval / self-verification / plan escalation
CREATE OR REPLACE FUNCTION public.guard_salon_marketplace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.marketplace_note IS DISTINCT FROM OLD.marketplace_note THEN
    RAISE EXCEPTION 'Only the Dallty team can change review decisions';
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
    RAISE EXCEPTION 'Only the Dallty team can change the subscription plan';
  END IF;

  -- is_listed is computed by platform triggers only (nested trigger depth > 1)
  IF NEW.is_listed IS DISTINCT FROM OLD.is_listed AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Marketplace listing is computed automatically';
  END IF;

  RETURN NEW;
END; $function$;