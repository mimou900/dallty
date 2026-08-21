-- Project 13: real recurring lifecycle transitions (trial expiry, renewal grace period,
-- scheduled cancellation, final expiration), not something Super Admin has to remember to
-- click. pg_cron/pg_net are already live on this project driving
-- generate_due_booking_reminders() on a real schedule (see notification.functions.ts's own
-- doc comment) -- this is pure data logic (no email/HTTP dispatch), so it's scheduled the
-- same real way rather than left as a manual-trigger-only function.
CREATE OR REPLACE FUNCTION public.run_subscription_lifecycle_sweep()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  -- Trial ended with no payment ever recorded -> expired.
  FOR r IN
    SELECT bs.id, bs.business_id, bs.plan_key
    FROM public.business_subscriptions bs
    WHERE bs.status = 'trialing'
      AND bs.trial_ends_at IS NOT NULL
      AND bs.trial_ends_at < now()
  LOOP
    UPDATE public.business_subscriptions SET status = 'expired' WHERE id = r.id;
    INSERT INTO public.subscription_events
      (business_id, subscription_id, event_type, from_plan_key, to_plan_key, details)
      VALUES (r.business_id, r.id, 'expired', r.plan_key, r.plan_key,
        jsonb_build_object('reason', 'trial_ended_no_payment'));
  END LOOP;

  -- Active, billing period ended, not scheduled to cancel -> past_due, grace period starts.
  FOR r IN
    SELECT bs.id, bs.business_id, bs.plan_key, sp.grace_period_days
    FROM public.business_subscriptions bs
    JOIN public.subscription_plans sp ON sp.plan_key = bs.plan_key
    WHERE bs.status = 'active'
      AND bs.current_period_end IS NOT NULL
      AND bs.current_period_end < now()
      AND bs.cancel_at_period_end = false
  LOOP
    UPDATE public.business_subscriptions
      SET status = 'past_due', grace_period_ends_at = now() + (r.grace_period_days || ' days')::interval
      WHERE id = r.id;
    INSERT INTO public.subscription_events
      (business_id, subscription_id, event_type, from_plan_key, to_plan_key, details)
      VALUES (r.business_id, r.id, 'grace_period_entered', r.plan_key, r.plan_key,
        jsonb_build_object('gracePeriodDays', r.grace_period_days));
  END LOOP;

  -- Active, billing period ended, scheduled to cancel -> canceled (final, graceful cancellation).
  FOR r IN
    SELECT bs.id, bs.business_id, bs.plan_key
    FROM public.business_subscriptions bs
    WHERE bs.status = 'active'
      AND bs.current_period_end IS NOT NULL
      AND bs.current_period_end < now()
      AND bs.cancel_at_period_end = true
  LOOP
    UPDATE public.business_subscriptions SET status = 'canceled' WHERE id = r.id;
    INSERT INTO public.subscription_events
      (business_id, subscription_id, event_type, from_plan_key, to_plan_key, details)
      VALUES (r.business_id, r.id, 'canceled', r.plan_key, r.plan_key,
        jsonb_build_object('reason', 'cancel_at_period_end_reached'));
  END LOOP;

  -- past_due, grace period ended with still no payment -> expired.
  FOR r IN
    SELECT bs.id, bs.business_id, bs.plan_key
    FROM public.business_subscriptions bs
    WHERE bs.status = 'past_due'
      AND bs.grace_period_ends_at IS NOT NULL
      AND bs.grace_period_ends_at < now()
  LOOP
    UPDATE public.business_subscriptions SET status = 'expired' WHERE id = r.id;
    INSERT INTO public.subscription_events
      (business_id, subscription_id, event_type, from_plan_key, to_plan_key, details)
      VALUES (r.business_id, r.id, 'expired', r.plan_key, r.plan_key,
        jsonb_build_object('reason', 'grace_period_ended'));
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'dallty-subscription-lifecycle-sweep',
  '0 3 * * *',
  $$SELECT public.run_subscription_lifecycle_sweep();$$
);
