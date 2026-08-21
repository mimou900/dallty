-- Project 13 follow-up: a real bug caught by an actual functional test (not just tsc), not
-- a theoretical one. subscription_payments/subscription_events REVOKEd UPDATE/DELETE from
-- BOTH authenticated AND service_role, copying ledger_transactions' own stricter pattern --
-- but no other append-only table in this codebase (admin_audit_log, booking_status_history)
-- actually revokes from service_role; they rely on RLS having no authenticated write policy,
-- while trusted server-function code (which always runs as service_role, bypassing RLS)
-- keeps normal privileges. Copying the ledger's absolute pattern here was wrong and broke a
-- real, legitimate step: recordSubscriptionPayment's own ledger_group_id backfill UPDATE
-- (confirmed failing live: `SET ROLE service_role; UPDATE subscription_payments ...` ->
-- "permission denied for table subscription_payments" before this fix).
--
-- The real security boundary these tables need is "authenticated users can't tamper with
-- their own audit trail" -- authenticated stays revoked. service_role gets UPDATE back
-- (the one legitimate need, the ledger_group_id backfill) but DELETE stays revoked even for
-- service_role -- these are financial/audit records with no legitimate deletion path today,
-- so keeping that door shut is free insurance, not something blocking real functionality.
GRANT UPDATE ON public.subscription_payments TO service_role;
GRANT UPDATE ON public.subscription_events TO service_role;
