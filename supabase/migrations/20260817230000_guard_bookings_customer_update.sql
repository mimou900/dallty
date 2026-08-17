-- Project 03: CRITICAL fix — found in this project's mass-assignment audit.
--
-- "Update own or managed bookings" (supabase/migrations/20260730230327...sql:226-234,
-- still live, name preserved through the business rename) allows UPDATE wherever
-- `customer_id = auth.uid() OR owns_business(...) OR is_business_staff(...) OR
-- is_platform_admin(...)`. The WITH CHECK is an OR across those four conditions with no
-- per-column restriction, so any signed-in customer can PATCH EVERY column on their own
-- booking directly via PostgREST — including `payment_status`, `total_price`, `staff_id`,
-- `service_id`, `business_id`, `discount_amount`, `promotion_id` — completely bypassing the
-- app's own `useSetPaymentStatus`/staff-desk code paths, which only ever send safe explicit
-- fields but provide no actual protection since the underlying grant is wide open. No guard
-- trigger existed for `bookings` (unlike `businesses`, which already has
-- guard_business_marketplace() for exactly this class of problem).
--
-- Fix: a BEFORE UPDATE trigger, same shape as guard_business_marketplace(). Privileged
-- callers (checked against the booking's CURRENT business_id/staff_id — OLD, never NEW, so
-- an attacker can't launder privilege by simultaneously reassigning business_id/staff_id to
-- something they do control) may change anything, exactly as today. Everyone else (a plain
-- customer on their own booking) may only change starts_at/ends_at (reschedule) and move
-- status to 'cancelled' — every other column must stay byte-for-byte identical.

CREATE OR REPLACE FUNCTION public.guard_bookings_customer_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.owns_business(auth.uid(), OLD.business_id)
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

CREATE TRIGGER bookings_guard_customer_update BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_bookings_customer_update();
