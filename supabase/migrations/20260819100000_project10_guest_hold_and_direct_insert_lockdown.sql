-- Project 10: Customer Booking HOLD -> CONFIRMATION flow.
--
-- 1. Guest hold ownership. A guest has no auth.uid() to own a hold with, so ownership of a
--    guest-created hold is proven by a server-generated, cryptographically random token
--    (crypto.randomUUID() in createGuestBookingHold) returned once to the browser that created
--    it and required back on confirm/cancel. NULL for every signed-in customer hold (those are
--    owned by customer_id = auth.uid(), same as before) and NULL for staff-created walk-ins.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS guest_hold_token text;

-- Only meaningful while a row is actually a live hold; keeps the partial index tiny.
CREATE INDEX IF NOT EXISTS bookings_guest_hold_token_idx ON public.bookings (id, guest_hold_token)
  WHERE status = 'held' AND guest_hold_token IS NOT NULL;

-- A guest hold is created BEFORE the guest has typed their name/phone (the whole point of the
-- hold->confirm split is that the slot gets locked the instant they pick a time, same as a
-- signed-in customer -- collecting contact details is deferred to the confirm step, not a
-- precondition of holding). `bookings_identity_present` (20260812190000...sql:12-15) requires
-- customer_id OR (customer_name AND customer_phone) on every row, which a still-anonymous guest
-- hold satisfies neither of. guest_hold_token is itself sufficient proof this is a legitimate,
-- server-issued guest booking (the row is uniquely ownable via the token even before contact
-- details exist), so it's added as a third valid identity state. Deliberately not conditioned
-- on status='held' -- sweep_expired_holds()'s UPDATE re-validates this same CHECK constraint,
-- and an abandoned anonymous guest hold that expires without ever reaching confirm must still
-- pass it.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_identity_present;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_identity_present CHECK (
  customer_id IS NOT NULL
  OR (customer_name IS NOT NULL AND customer_phone IS NOT NULL)
  OR guest_hold_token IS NOT NULL
);

-- 2. Close the direct CUSTOMER-insert path only (brief §74-75) -- leave the separate
-- staff/owner direct-insert path alone, it's a real live feature outside this project's scope
-- (see below).
--
-- "Customers create own bookings" (20260730230327...sql:224-225, still live) lets any
-- authenticated user INSERT directly into bookings with WITH CHECK (customer_id = auth.uid())
-- -- completely bypassing createBookingHold/confirmBookingHold: no exclusion-constraint
-- candidate retry, no price/duration server resolution, no hold/expiry, no idempotency, no
-- confirmation-state-machine reasoning beyond the trigger's own INSERT branch. The booking
-- engine itself no longer needs this policy -- createBookingHold/confirmBookingHold/
-- createWalkInBooking/createGuestBookingHold all write via the service-role client, which
-- bypasses RLS entirely, so removing this policy does not affect any of them.
--
-- Table-level INSERT stays GRANTed to `authenticated` (unlike the Project 09 Phase 8 function-
-- grant lesson, table privileges + RLS policies ARE the correct, already-proven narrowing
-- mechanism here -- that lesson was about `ALTER DEFAULT PRIVILEGES` re-granting FUNCTION
-- EXECUTE despite `REVOKE ... FROM PUBLIC`, not about table grants). Revoking the table grant
-- was tried and reverted: `admin/appointments.tsx`'s `duplicate()` (src/routes/_authenticated/
-- admin/appointments.tsx:183-204) still does a direct browser-side `.from("bookings").insert()`
-- for staff/owners cloning an existing booking a week forward, authorized by the OTHER live
-- INSERT policy on this table ("Staff and owners create bookings for their business",
-- WITH CHECK (owns_business(...) OR is_business_staff(...) OR is_platform_admin(...))) --
-- staff-facing, not customer-facing, and out of this project's explicit scope (brief §75
-- exempts staff/walk-in booking creation from the hold->confirm rework). Revoking the grant
-- would have silently broken that feature since Postgres GRANT is all-or-nothing per role per
-- table -- RLS policies are what narrow it per-row, not separate grants per-policy. Dropping
-- only the customer policy below closes the customer path while this staff policy keeps the
-- admin feature working exactly as before.
DROP POLICY IF EXISTS "Customers create own bookings" ON public.bookings;
