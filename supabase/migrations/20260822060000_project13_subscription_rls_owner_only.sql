-- Project 13 follow-up: the three subscription-table SELECT policies from this project's own
-- earlier migration used owns_business(auth.uid(), business_id) in their OR-clause. Live
-- audit (via the real Manager test account against real business_subscriptions state) found
-- owns_business() deliberately treats 'manager' as owner-equivalent for the "almost all daily
-- operations" surfaces it correctly gates elsewhere -- but subscription data is explicitly
-- NOT one of those surfaces (the brief: "Manager -> subscription: DENY unless explicitly
-- permitted"; subscription.manage/subscription.view are in fact only ever granted to 'owner'
-- and 'super_admin', never 'manager'). Already fixed at the server-function layer
-- (subscription.functions.ts's isLiteralOwner helper); this closes the same gap at the RLS
-- layer for defense-in-depth, since these tables have no INSERT/UPDATE policy for
-- authenticated users (every write already goes through the now-fixed server functions) but
-- a direct client-side SELECT would otherwise still leak a manager into subscription/billing
-- data they were never meant to see.
DROP POLICY IF EXISTS "business_subscriptions_select" ON public.business_subscriptions;
CREATE POLICY "business_subscriptions_select" ON public.business_subscriptions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.has_permission(auth.uid(), business_id, 'subscription.view')
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "subscription_events_select" ON public.subscription_events;
CREATE POLICY "subscription_events_select" ON public.subscription_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.has_permission(auth.uid(), business_id, 'subscription.view')
    OR public.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "subscription_payments_select" ON public.subscription_payments;
CREATE POLICY "subscription_payments_select" ON public.subscription_payments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.owner_id = auth.uid())
    OR public.has_permission(auth.uid(), business_id, 'subscription.view')
    OR public.is_platform_admin(auth.uid())
  );
