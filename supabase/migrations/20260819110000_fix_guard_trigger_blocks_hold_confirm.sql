-- Project 10: CRITICAL fix, found live-testing the Preview deployment against the actual
-- deployed HTTP server-function endpoints (not just DB constraints) -- the FIRST time
-- confirmBookingHold's UPDATE has ever actually been exercised end-to-end.
--
-- guard_bookings_customer_update() (Project 03, 20260817230000...sql) was written to stop a
-- signed-in customer PATCHing arbitrary columns on their own booking directly via PostgREST.
-- Its non-privileged branch only ever allows starts_at/ends_at to change freely and status to
-- move to 'cancelled' -- every other column, and every other status transition, raises
-- 'You may only cancel or reschedule your own booking'.
--
-- That trigger predates the hold->confirm engine (Project 09) and nobody noticed it also
-- fires for supabaseAdmin (service_role) UPDATEs -- BYPASSRLS skips RLS POLICY checks, but
-- NOT table triggers. Confirmed live: confirmBookingHold/confirmGuestBookingHold's UPDATE
-- (status held->pending/confirmed, plus total_price/discount fields for a coupon, plus
-- customer_name/phone/email for guests) and cancelBookingHold/cancelGuestBookingHold/
-- sweep_expired_holds's UPDATE (status held->expired) are BOTH non-'cancelled' status
-- transitions touching "protected" columns -- every one of them has been silently rejected by
-- this trigger with 'You may only cancel or reschedule your own booking' since Project 09
-- Phase 3 shipped confirmBookingHold, because service-role calls carry no JWT and so
-- auth.uid() is NULL, which satisfies none of the trigger's existing privileged conditions
-- (owns_business/is_business_staff/is_platform_admin all require a real actor id). The entire
-- confirm step of the booking engine has never actually worked in production.
--
-- Fix: auth.uid() IS NULL is added as a privileged condition. This is safe and precisely
-- scoped, not a broad hole: RLS's own "Update own or managed bookings" policy already
-- requires (customer_id = auth.uid() OR owns_business(...) OR is_business_staff(...) OR
-- is_platform_admin(...)) to even reach a row via PostgREST -- customer_id = auth.uid() can
-- only pass for a NON-NULL auth.uid() (NULL never equals anything in SQL, and NULL never
-- equals NULL either), so an authenticated attacker can never cause this trigger to observe
-- auth.uid() IS NULL on a row they were allowed to reach; only a genuine service_role
-- connection (no JWT claims set at all) ever satisfies it. service_role could trivially
-- disable this trigger outright anyway (or write raw SQL bypassing it entirely), so it was
-- never meaningful protection against a compromised service key in the first place -- this
-- fix just stops it from misfiring against the trusted backend it was never meant to guard.
CREATE OR REPLACE FUNCTION public.guard_bookings_customer_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL
     OR public.owns_business(auth.uid(), OLD.business_id)
     OR public.is_business_staff(auth.uid(), OLD.staff_id)
     OR public.is_platform_admin(auth.uid())
  THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.business_id IS DISTINCT FROM OLD.business_id
     OR NEW.service_id IS DISTINCT FROM OLD.service_id
     OR NEW.staff_id IS DISTINCT FROM OLD.staff_id
     OR NEW.total_price IS DISTINCT FROM OLD.total_price
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.paid_by IS DISTINCT FROM OLD.paid_by
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
     OR NEW.original_price IS DISTINCT FROM OLD.original_price
     OR NEW.promotion_id IS DISTINCT FROM OLD.promotion_id
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
  THEN
    RAISE EXCEPTION 'You may only cancel or reschedule your own booking';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status != 'cancelled' THEN
    RAISE EXCEPTION 'You may only cancel your own booking';
  END IF;

  RETURN NEW;
END;
$$;
