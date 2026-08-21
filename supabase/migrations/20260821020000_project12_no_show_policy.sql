-- Project 12 Phase 2: no-show financial policy (brief §87-88). Business/country policy must
-- determine no-show financial treatment, never hardcoded. Genuinely new: no such config
-- existed anywhere before this.
--
-- 'full_charge' is recorded as INTENT only, not an actual charge -- no payment gateway
-- exists in this environment (confirmed repeatedly across every project to date), so nothing
-- can actually collect money from a no-show customer today. markNoShow (booking-ops.functions.ts)
-- records which policy applied to the booking's audit trail; a real charge mechanism is future
-- work once a provider exists, not fabricated here.
ALTER TABLE public.businesses
  ADD COLUMN no_show_charge_policy text NOT NULL DEFAULT 'no_charge'
    CHECK (no_show_charge_policy IN ('no_charge', 'retain_deposit', 'full_charge'));
