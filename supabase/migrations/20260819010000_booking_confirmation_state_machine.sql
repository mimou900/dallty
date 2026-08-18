-- Project 09 Phase 4: pre-appointment confirmation-call state machine.
--
-- The third of the three state machines the brief calls for, alongside bookings.status
-- (booking lifecycle) and bookings.payment_status (financial state, Project 06). This one
-- tracks whether staff have called the customer ahead of the appointment to confirm they're
-- still coming — a standard anti-no-show workflow, opt-in per business (require_confirmation_
-- call), independent of the automatic/manual booking_confirmation setting added earlier.

CREATE TYPE public.booking_confirmation_status AS ENUM (
  'not_required', -- business doesn't do confirmation calls, or this booking predates opt-in
  'pending',       -- a call is owed before the appointment
  'confirmed',     -- customer confirmed attendance
  'unreachable',   -- staff tried calling, no answer
  'declined'       -- customer said they're not coming (business then cancels separately)
);

ALTER TABLE public.businesses ADD COLUMN require_confirmation_call boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings ADD COLUMN confirmation_status public.booking_confirmation_status NOT NULL DEFAULT 'not_required';
ALTER TABLE public.bookings ADD COLUMN confirmation_attempted_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN confirmed_by uuid REFERENCES auth.users(id);
ALTER TABLE public.bookings ADD COLUMN confirmation_notes text;

-- Initializes confirmation_status to 'pending' exactly once, the moment a booking first
-- becomes real (status enters pending/confirmed — a held slot isn't a booking yet). Fires on
-- both the direct customer insert (business.$businessSlug.tsx) and the hold-then-confirm path
-- (confirmBookingHold's UPDATE), and deliberately never re-touches a row whose confirmation_
-- status has already moved past 'not_required' — a later reschedule or a manual pending->
-- confirmed approval must not silently reset or re-open an already-recorded call.
CREATE OR REPLACE FUNCTION public.bookings_set_confirmation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  requires boolean;
BEGIN
  IF NEW.status NOT IN ('pending', 'confirmed') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.confirmation_status <> 'not_required' OR OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT b.require_confirmation_call INTO requires FROM public.businesses b WHERE b.id = NEW.business_id;
  IF requires THEN
    NEW.confirmation_status := 'pending';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER bookings_before_insert_update_confirmation
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_set_confirmation_status();
