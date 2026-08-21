-- Project 13: backfill + real entitlement enforcement.
--
-- Backfill: 9 businesses exist today, 0 have a business_subscriptions row (confirmed live
-- before writing this). Grandfathered in as 'active' (not 'trialing' -- these are already
-- real, established businesses, not new trial signups) on their existing businesses.plan
-- value, with current_period_end left NULL so the lifecycle sweep (which only acts when
-- current_period_end IS NOT NULL) never force-transitions a pre-existing business into
-- past_due for a billing cycle it never actually had. Without this backfill, the staff_limit
-- trigger below would immediately lock every existing business out of adding staff.
INSERT INTO public.business_subscriptions (business_id, plan_key, status, current_period_start)
SELECT b.id, COALESCE(b.plan::text, 'starter'), 'active', b.created_at
FROM public.businesses b
LEFT JOIN public.business_subscriptions bs ON bs.business_id = b.id
WHERE bs.id IS NULL;

INSERT INTO public.subscription_events (business_id, subscription_id, event_type, to_plan_key, details)
SELECT bs.business_id, bs.id, 'created', bs.plan_key, '{"reason": "project13_backfill_existing_business"}'::jsonb
FROM public.business_subscriptions bs
LEFT JOIN public.subscription_events se ON se.subscription_id = bs.id
WHERE se.id IS NULL;

-- Real entitlement enforcement: the actual "add a staff member" path is a plain client-side
-- insert gated only by RLS ("Owners manage staff" -- ALL commands, owner/admin only), not a
-- server function -- so an application-layer check has no single call site to live in. A
-- BEFORE INSERT/UPDATE trigger is the only way to enforce this without restructuring that
-- existing UI/RLS flow, and it has the advantage of covering every current and future
-- insert path, not just the one this project happens to know about.
CREATE OR REPLACE FUNCTION public.enforce_staff_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  SELECT sp.staff_limit INTO v_limit
  FROM public.business_subscriptions bs
  JOIN public.subscription_plans sp ON sp.plan_key = bs.plan_key
  WHERE bs.business_id = NEW.business_id;

  -- No subscription row at all (shouldn't happen post-backfill, but fail open rather than
  -- locking a business out due to a missing row this trigger didn't create) or an explicit
  -- NULL limit (unlimited, e.g. enterprise) both skip enforcement.
  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.staff
  WHERE business_id = NEW.business_id AND is_active = true AND deleted_at IS NULL;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'STAFF_LIMIT_REACHED: this business''s plan allows at most % active staff member(s)', v_limit;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_enforce_limit_insert
BEFORE INSERT ON public.staff
FOR EACH ROW WHEN (NEW.is_active = true)
EXECUTE FUNCTION public.enforce_staff_limit();

CREATE TRIGGER staff_enforce_limit_reactivate
BEFORE UPDATE ON public.staff
FOR EACH ROW WHEN (NEW.is_active = true AND OLD.is_active = false)
EXECUTE FUNCTION public.enforce_staff_limit();
