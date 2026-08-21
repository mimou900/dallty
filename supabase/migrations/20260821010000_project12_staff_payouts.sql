-- Project 12 Phase 1: staff payout recording. `staff_payouts` (Project 06) has existed since
-- schema-only with zero consumers -- accrual into staff_payable is real (markCashPayment),
-- but nothing ever turns that accrual into a recorded, paid-out event. This closes that gap.
--
-- Also aligns the status state machine with the brief's exact 6 states
-- (pending/available/processing/paid/failed/cancelled) -- the prior CHECK had
-- pending/approved/paid/cancelled/failed (no rows exist yet per the audit, so this is a
-- clean swap, not a data migration).

ALTER TABLE public.staff_payouts DROP CONSTRAINT staff_payouts_status_check;
ALTER TABLE public.staff_payouts ADD CONSTRAINT staff_payouts_status_check
  CHECK (status IN ('pending', 'available', 'processing', 'paid', 'failed', 'cancelled'));
ALTER TABLE public.staff_payouts ALTER COLUMN status SET DEFAULT 'available';

-- Links a payout to the exact staff_earning ledger rows it covers -- the real mechanism that
-- makes "how much is still owed" a derived, idempotent calculation rather than a guess:
-- an earning covered by a non-cancelled payout can never be included in a second one.
CREATE TABLE public.staff_payout_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id             uuid NOT NULL REFERENCES public.staff_payouts (id) ON DELETE CASCADE,
  ledger_transaction_id uuid NOT NULL REFERENCES public.ledger_transactions (id) ON DELETE RESTRICT,
  amount                numeric(10,2) NOT NULL CHECK (amount > 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ledger_transaction_id)
);
CREATE INDEX staff_payout_items_payout_id_idx ON public.staff_payout_items (payout_id);

ALTER TABLE public.staff_payout_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.staff_payout_items TO authenticated;
GRANT ALL ON public.staff_payout_items TO service_role;
CREATE POLICY "staff_payout_items_select" ON public.staff_payout_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_payouts sp
      WHERE sp.id = payout_id
        AND (owns_business(auth.uid(), sp.business_id) OR is_business_staff(auth.uid(), sp.staff_id)
          OR is_platform_admin(auth.uid()))
    )
  );
