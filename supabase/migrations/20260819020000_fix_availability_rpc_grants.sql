-- Project 09 Phase 8: security fix found by the concurrency/security test pass.
--
-- The Phase 2 migration locked get_available_slots/get_staff_day_availability/
-- get_business_availability_summary/get_business_next_available/resolve_buffer_minutes down
-- to service_role using `REVOKE ALL ... FROM PUBLIC`, mirroring the *intent* of the earlier
-- Security Anti-Fraud migration but not its actual mechanism. That migration explicitly
-- revoked from `anon, authenticated` because this Supabase project has `ALTER DEFAULT
-- PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role`
-- configured at the project level -- every new function gets EXECUTE granted directly to those
-- two named roles at CREATE FUNCTION time. `REVOKE ... FROM PUBLIC` only revokes the PUBLIC
-- pseudo-role's privilege; it does nothing to a grant already held directly by anon or
-- authenticated. Confirmed via pg_proc.proacl that all five Phase 2 functions currently show
-- anon=X and authenticated=X despite the Phase 2 migration's revoke -- meaning any signed-in or
-- anonymous caller could invoke them directly via supabase.rpc(...), bypassing the rate-limited
-- server-function wrappers (business-detail.functions.ts) entirely. Same bug class the Security
-- Anti-Fraud migration fixed for the old signatures; this migration fixes it for the new ones.

REVOKE EXECUTE ON FUNCTION public.resolve_buffer_minutes(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, uuid, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_staff_day_availability(uuid, uuid, uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_business_availability_summary(uuid, uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_business_next_available(uuid, uuid, integer) FROM anon, authenticated;
