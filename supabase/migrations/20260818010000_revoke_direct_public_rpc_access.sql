-- Security Foundation: close the RPC rate-limit bypass.
--
-- Several read-only RPCs used by the public business-detail page and marketplace search were
-- GRANTed EXECUTE directly to anon/authenticated, on top of also being reachable through
-- rate-limited server functions (src/lib/business-detail.functions.ts,
-- src/lib/marketplace-search.functions.ts). Direct grants meant any caller could bypass those
-- wrappers entirely by calling `supabase.rpc(...)` straight from the browser — a scripted loop
-- would never touch the IP rate limit at all, since the RPC itself never enforced one.
--
-- All of these are STABLE SECURITY DEFINER read functions, so revoking anon/authenticated does
-- not affect internal calls between them (e.g. get_business_next_available() calling
-- get_staff_day_availability() internally still works — SECURITY DEFINER functions run with the
-- definer's privileges for their own internal calls, not the calling role's).
--
-- service_role keeps EXECUTE — that's what the server-function wrappers use.

REVOKE EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_staff_day_availability(uuid, uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_day_availability(uuid, uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_promo_code(uuid, text, numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_promo_code(uuid, text, numeric) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_business_availability_summary(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_availability_summary(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_business_public_staff(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_public_staff(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_businesses_page(
  text, text, text, uuid, text, double precision, double precision, boolean, boolean, text,
  double precision, uuid, integer
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_business_next_available(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_next_available(uuid, integer) TO service_role;

-- bump_slug_redirect_hit(text) is deliberately left reachable directly from the browser: it's a
-- low-risk, low-cost hit counter (no sensitive data returned, no expensive query), not part of
-- this cleanup.
