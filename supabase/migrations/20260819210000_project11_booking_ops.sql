-- Project 11 Phase 2: booking-operations backend gaps found by audit.
--
-- Three real gaps, not just missing UI:
--   1. No per-call confirmation history — bookings.confirmation_status/confirmation_notes/
--      confirmed_by/confirmation_attempted_at (Project 09) is a single summary, overwritten
--      by every call. The brief (§5-7) needs a call queue with per-attempt outcome/staff/
--      timestamp/note, including states the summary enum doesn't have (called, no_answer,
--      reschedule_requested, wrong_number). Kept as a NEW table rather than widening the
--      existing booking_confirmation_status enum, so the pre-existing summary machine (read
--      by bookings_set_confirmation_status()'s trigger and anything else already consuming
--      it) stays exactly as-is (brief §60: internal enums remain stable).
--   2. No immutable booking-status-change history at all — audit_admin_log entries are
--      scattered per-function (confirmation, walk-in, extra-service, refund), and
--      cancellation currently bypasses even that (a raw client-side status flip). Brief §24/
--      §61 wants a real operational history feed.
--   3. No-show has an enum value (booking_status.no_show, Project 05) but nothing sets it.

-- ============================================================
-- 1. Confirmation call history — one row per call attempt.
-- ============================================================
CREATE TYPE public.confirmation_call_outcome AS ENUM (
  'pending', 'called', 'no_answer', 'confirmed', 'reschedule_requested', 'cancelled', 'wrong_number'
);

CREATE TABLE public.booking_confirmation_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id),
  outcome public.confirmation_call_outcome NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_confirmation_calls_booking_id_idx ON public.booking_confirmation_calls (booking_id);
CREATE INDEX booking_confirmation_calls_business_id_idx ON public.booking_confirmation_calls (business_id, created_at DESC);

ALTER TABLE public.booking_confirmation_calls ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.booking_confirmation_calls TO authenticated;
GRANT ALL ON public.booking_confirmation_calls TO service_role;

-- Read access follows the same business-management boundary as bookings themselves — no
-- write policy for authenticated (all writes go through the service-role server function,
-- which does the has_permission() check itself; this is a history log, not a
-- direct-from-browser mutation surface, consistent with §88's "no direct public database
-- mutations for critical operational actions").
CREATE POLICY "booking_confirmation_calls_select" ON public.booking_confirmation_calls
  FOR SELECT TO authenticated
  USING (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())
    OR public.has_permission(auth.uid(), business_id, 'booking.confirm'));

-- ============================================================
-- 2. Booking status history — immutable, append-only. Never UPDATE/DELETE (matches the
-- ledger_transactions pattern from Project 06: no grant to any non-service role, the real
-- backstop against accidental or malicious rewriting of operational history).
-- ============================================================
CREATE TABLE public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  from_status public.booking_status,
  to_status public.booking_status NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  actor_role text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_status_history_booking_id_idx ON public.booking_status_history (booking_id, created_at);
CREATE INDEX booking_status_history_business_id_idx ON public.booking_status_history (business_id, created_at DESC);

ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.booking_status_history TO authenticated;
GRANT ALL ON public.booking_status_history TO service_role;

CREATE POLICY "booking_status_history_select" ON public.booking_status_history
  FOR SELECT TO authenticated
  USING (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())
    OR public.has_permission(auth.uid(), business_id, 'booking.view')
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.customer_id = auth.uid()));

-- INSERT requires the same business-management boundary as SELECT, plus the row must claim
-- the actual caller as its actor (never insert history "as" someone else). Immutable once
-- written -- no UPDATE/DELETE policy exists for any role, and no grant either.
CREATE POLICY "booking_status_history_insert" ON public.booking_status_history
  FOR INSERT TO authenticated WITH CHECK (
    actor_id = auth.uid()
    AND (
      public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())
      OR public.has_permission(auth.uid(), business_id, 'booking.cancel')
      OR public.has_permission(auth.uid(), business_id, 'booking.confirm')
      OR public.has_permission(auth.uid(), business_id, 'booking.no_show')
      OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.customer_id = auth.uid())
    )
  );
