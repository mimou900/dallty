-- Project 13 Phase 0 (security prerequisite, explicitly required before building the
-- subscription permission system): audit + fix has_permission()'s scope handling for all
-- four values (self/business/branch/global).
--
-- AUDIT FINDINGS (verified live against the real schema before writing this fix):
--
-- 1. scope='self' was a complete no-op: `rp.scope IN ('global','business','self')` treated
--    all three identically, so ANY grant -- regardless of scope -- passed regardless of who
--    the action's target was. Dormant until Project 12 (its own consumer, worked around in
--    application code -- see payout.functions.ts) since no earlier caller actually needed
--    'self' to be restrictive. It is NOT dormant for the 'specialist' role's grants
--    (booking.confirm/reschedule/view, finance.view_staff_payouts, etc.) which ARE live,
--    real, business_memberships-backed grants today.
--
-- 2. scope='branch' was already correct (checked m.branch_id IS NULL OR = _branch_id) --
--    left unchanged.
--
-- 3. scope='global' is currently only ever seeded on the 'super_admin' *platform_roles* key,
--    which is NEVER assigned via any real business_memberships row (confirmed: 0 rows) --
--    real super-admin authorization goes through the entirely separate is_super_admin()/
--    assertSuperAdmin() (user_roles table), matching the established, correct pattern used
--    throughout Projects 09-12 for platform-wide checks. So 'global' scope has zero live
--    consumers today, but its *semantics* were still wrong: it required a match against the
--    one specific _business_id passed in, identical to 'business' scope, which cannot
--    actually mean "every business" through a business_memberships-anchored function. Fixed
--    to check across every one of the caller's active memberships, independent of
--    _business_id, so a future 'global' grant on a real (non-orphaned) role behaves as its
--    name promises. Zero behavior change today since no real grant exists.
--
-- Extends the signature with an optional _target_user_id (default NULL, so every existing
-- caller that doesn't pass it keeps its exact current behavior for 'business'/'branch'
-- scope, and now correctly FAILS CLOSED for 'self' scope instead of silently passing --
-- callers that need self-scope to work must now explicitly resolve and pass the real target
-- user id, same pattern payout.functions.ts already established by hand).
-- Two RLS policies call has_permission(...) directly in their USING clause (both tables are
-- written/read exclusively via the service-role client today per booking-ops.functions.ts --
-- confirmed via a repo-wide grep -- so these policies are currently unreachable in practice,
-- but Postgres still tracks the dependency and refuses to drop the function under them.
-- Dropped and recreated identically around the function replacement below.
DROP POLICY IF EXISTS "booking_confirmation_calls_select" ON public.booking_confirmation_calls;
DROP POLICY IF EXISTS "booking_status_history_select" ON public.booking_status_history;
DROP POLICY IF EXISTS "booking_status_history_insert" ON public.booking_status_history;

-- Postgres treats an added parameter as a distinct overload, not a true replacement --
-- drop the old 4-arg signature explicitly first so calls with default trailing args can't
-- become ambiguous between two coexisting overloads.
DROP FUNCTION IF EXISTS public.has_permission(uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid,
  _business_id uuid,
  _permission_key text,
  _branch_id uuid DEFAULT NULL,
  _target_user_id uuid DEFAULT NULL
)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    -- Legacy single-column owner always has full access to their own business (unchanged).
    EXISTS (SELECT 1 FROM public.businesses WHERE id = _business_id AND owner_id = _user_id)
    OR EXISTS (
      -- business/branch/self grants, scoped to THIS specific business membership.
      SELECT 1
      FROM public.business_memberships m
      JOIN public.role_permissions rp ON rp.role_id = m.role_id
      JOIN public.permissions p ON p.id = rp.permission_id AND p.key = _permission_key
      WHERE m.business_id = _business_id
        AND m.user_id = _user_id
        AND m.status = 'active'
        AND m.deleted_at IS NULL
        AND (
          rp.scope = 'business'
          OR (rp.scope = 'branch' AND (m.branch_id IS NULL OR m.branch_id = _branch_id))
          OR (rp.scope = 'self' AND _target_user_id IS NOT NULL AND _target_user_id = _user_id)
        )
    )
    OR EXISTS (
      -- global grants apply across every business the caller holds any membership in, not
      -- just the one business_id passed in -- see finding #3 above.
      SELECT 1
      FROM public.business_memberships m
      JOIN public.role_permissions rp ON rp.role_id = m.role_id
      JOIN public.permissions p ON p.id = rp.permission_id AND p.key = _permission_key
      WHERE m.user_id = _user_id
        AND m.status = 'active'
        AND m.deleted_at IS NULL
        AND rp.scope = 'global'
    )
$function$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text, uuid, uuid) TO authenticated;

-- Recreated identically (still no _target_user_id -- neither table's row correlates to a
-- specific staff member without a join has_permission() doesn't perform, so 'self'-scope
-- grants correctly fail closed here rather than pass, matching the fixed semantics; 'business'
-- scope grants are unaffected).
CREATE POLICY "booking_confirmation_calls_select" ON public.booking_confirmation_calls
  FOR SELECT TO authenticated
  USING (
    owns_business(auth.uid(), business_id)
    OR is_platform_admin(auth.uid())
    OR has_permission(auth.uid(), business_id, 'booking.confirm'::text)
  );

CREATE POLICY "booking_status_history_select" ON public.booking_status_history
  FOR SELECT TO authenticated
  USING (
    owns_business(auth.uid(), business_id)
    OR is_platform_admin(auth.uid())
    OR has_permission(auth.uid(), business_id, 'booking.view'::text)
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_status_history.booking_id AND b.customer_id = auth.uid()
    )
  );

CREATE POLICY "booking_status_history_insert" ON public.booking_status_history
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      owns_business(auth.uid(), business_id)
      OR is_platform_admin(auth.uid())
      OR has_permission(auth.uid(), business_id, 'booking.cancel'::text)
      OR has_permission(auth.uid(), business_id, 'booking.confirm'::text)
      OR has_permission(auth.uid(), business_id, 'booking.no_show'::text)
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = booking_status_history.booking_id AND b.customer_id = auth.uid()
      )
    )
  );
