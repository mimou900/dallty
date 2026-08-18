-- Project 09 Phase 3 (part 1): booking reference codes + configurable hold duration.
--
-- Booking reference codes: every booking gets a short, non-enumerable, customer-facing code
-- (e.g. "K7M4QXR2") instead of ever exposing the raw internal bookings.id UUID as the thing a
-- customer quotes to a business over the phone or types into a lookup form. Implemented as a
-- BEFORE INSERT trigger rather than application code, so it applies uniformly to every current
-- and future booking-creation path (the hold-based flow in booking-engine.functions.ts, the
-- direct customer insert in business.$businessSlug.tsx, guest checkout, staff quick-booking,
-- admin duplication, future walk-ins) without needing each call site to remember to set it.
--
-- Hold duration: was a hardcoded 15-minute constant in booking-engine.functions.ts. Made
-- Super-Admin/country configurable per the brief, following the same country-default ->
-- business-override hierarchy already used for buffers.

-- ============================================================
-- 1. Configurable hold duration
-- ============================================================
ALTER TABLE public.countries ADD COLUMN default_hold_minutes integer NOT NULL DEFAULT 15;
ALTER TABLE public.businesses ADD COLUMN hold_minutes integer; -- NULL = inherit country default

-- ============================================================
-- 2. Booking reference codes
-- ============================================================
ALTER TABLE public.bookings ADD COLUMN reference text;

-- Excludes 0/O/1/I/L (easy to misread over the phone or mistype). 32^8 ≈ 1.1e12 combinations —
-- this is a lookup/support code, not a security credential, so plain random() is adequate; the
-- collision-retry loop keeps it unique regardless.
CREATE OR REPLACE FUNCTION public.generate_booking_reference()
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text;
  i integer;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.bookings WHERE reference = result);
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bookings_set_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.reference IS NULL THEN
    NEW.reference := public.generate_booking_reference();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER bookings_before_insert_reference
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_set_reference();

-- Backfill any pre-existing rows, then lock the invariant in.
UPDATE public.bookings SET reference = public.generate_booking_reference() WHERE reference IS NULL;
ALTER TABLE public.bookings ALTER COLUMN reference SET NOT NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_reference_unique UNIQUE (reference);
