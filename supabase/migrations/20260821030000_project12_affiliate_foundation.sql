-- Project 12 Phase 4: affiliate foundation (brief §42-45). Confirmed genuinely zero before
-- this — no table, enum, or code of any kind (grep across the whole repo found only a
-- business-category seed *label* unrelated to a referral-affiliate system, plus explicit
-- "no affiliate system exists yet" comments in idempotency/security-foundation migrations).
--
-- Mirrors the existing commission_rules precedence pattern (affiliate-specific -> country ->
-- global default) rather than inventing a new hierarchy shape, per the brief's own
-- instruction not to conflict with an established one.

-- ============================================================
-- 1. Ledger account type for affiliate accrual, parallel to staff_payable. Postgres requires
-- a new enum value to commit in its own transaction before use (the same constraint Project
-- 06 hit adding 'external_cash') -- this migration only adds the value; server code added in
-- the same project, applied in a later migration/deploy step, is fine since the VALUE itself
-- is what needs the separate commit, not the consuming code.
-- ============================================================
ALTER TYPE public.ledger_account_type ADD VALUE IF NOT EXISTS 'affiliate_payable';
