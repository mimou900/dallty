-- Project 11: RBAC foundation for business operations (Confirmation Center, walk-ins,
-- branch-scoped staff).
--
-- Project 01 seeded platform_roles/permissions/role_permissions as reference data only —
-- its own migration header says explicitly "no RLS policy, server function, or frontend
-- code is rewired to consult these tables". Confirmed still true by direct audit: nothing
-- reads role_permissions/permissions anywhere in src/. owns_business() remains a binary
-- owner/manager-vs-everyone-else check — receptionist/confirmation_member/specialist/
-- custom memberships currently grant ZERO access through it.
--
-- This migration builds the actual resolver (has_permission/has_branch_access) and the
-- branch-scope column business_memberships was missing, but deliberately does NOT touch
-- owns_business() or any of the 41+ existing RLS policies built on it — those keep working
-- exactly as before (same discipline Project 01's own migration used: additive, never a
-- silent behavior change to already-shipped enforcement). New Project 11 surfaces
-- (confirmation center, walk-in booking, branch-scoped views, payment actions) are wired to
-- the new resolver as they're built, not retrofitted onto every pre-existing policy.

-- ============================================================
-- 1. Branch scope on membership: NULL = all branches (unchanged default behavior for
-- every existing membership, including the owner/manager rows owns_business() already
-- trusts business-wide). A non-NULL value scopes a 'branch'-scope permission grant to that
-- one branch only.
-- ============================================================
ALTER TABLE public.business_memberships
  ADD COLUMN branch_id uuid REFERENCES public.business_branches(id) ON DELETE SET NULL;

CREATE INDEX business_memberships_branch_id_idx
  ON public.business_memberships (branch_id) WHERE branch_id IS NOT NULL;

-- ============================================================
-- 2. New permission key needed by a real, immediate consumer (markNoShow, built in the
-- same project) — no-show marking didn't have a dedicated key; folding it into
-- booking.cancel would conflate two different operational actions and outcomes.
-- ============================================================
INSERT INTO public.permissions (key, description) VALUES
  ('booking.no_show', 'Mark a booking as a no-show')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id, scope)
SELECT r.id, p.id, x.scope::public.permission_scope
FROM (VALUES
  ('owner', 'booking.no_show', 'business'),
  ('manager', 'booking.no_show', 'business'),
  ('receptionist', 'booking.no_show', 'business'),
  ('confirmation_member', 'booking.no_show', 'business')
) AS x(role_key, permission_key, scope)
JOIN public.platform_roles r ON r.key = x.role_key AND r.business_id IS NULL
JOIN public.permissions p ON p.key = x.permission_key
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. Financial permission grants (brief §37-39: manager gets broad operational financial
-- access but not billing/subscription/payout-config; receptionist can mark paid but not see
-- revenue; confirmation_member gets none unless explicitly granted; specialist sees only
-- their own earnings via scope='self'). Project 06's financial_core migration added the
-- payments.*/finance.*/balance.* permission keys but granted them to no role at all —
-- closing that gap here since Project 11 is the first real consumer.
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id, scope)
SELECT r.id, p.id, x.scope::public.permission_scope
FROM (VALUES
  -- Owner: everything, business-scoped (matches the existing pattern for owner's other keys).
  ('owner', 'payments.view', 'business'), ('owner', 'payments.create', 'business'),
  ('owner', 'payments.mark_paid', 'business'), ('owner', 'payments.refund', 'business'),
  ('owner', 'payments.adjust', 'business'), ('owner', 'payments.manage_methods', 'business'),
  ('owner', 'payments.manage_deposits', 'business'), ('owner', 'finance.view', 'business'),
  ('owner', 'finance.view_revenue', 'business'), ('owner', 'finance.view_staff_payouts', 'business'),
  ('owner', 'finance.manage_payouts', 'business'), ('owner', 'balance.view', 'business'),
  ('owner', 'balance.adjust', 'business'),

  -- Manager: brief §10 — "almost all daily operations" except billing config/subscription/
  -- ownership/critical security. createRefund's existing owns_business() check already
  -- allows manager to refund today; this grant only makes that pre-existing behavior
  -- resolvable through the new permission model too, not a new grant of access.
  ('manager', 'payments.view', 'business'), ('manager', 'payments.create', 'business'),
  ('manager', 'payments.mark_paid', 'business'), ('manager', 'payments.refund', 'business'),
  ('manager', 'payments.adjust', 'business'), ('manager', 'finance.view', 'business'),
  ('manager', 'finance.view_revenue', 'business'), ('manager', 'finance.view_staff_payouts', 'business'),
  ('manager', 'balance.view', 'business'),

  -- Receptionist: brief §8 — can mark paid, cannot see revenue (the brief's own custom-role
  -- worked example marks "See revenue" as an opt-in addition on top of base receptionist).
  ('receptionist', 'payments.view', 'business'), ('receptionist', 'payments.create', 'business'),
  ('receptionist', 'payments.mark_paid', 'business'),

  -- Confirmation member: brief §9 — no revenue/payroll access unless explicitly granted.
  -- Intentionally zero financial grants here.

  -- Specialist: brief §37 — own earnings/payout only, never total business revenue.
  ('specialist', 'finance.view', 'self'), ('specialist', 'finance.view_staff_payouts', 'self'),
  ('specialist', 'balance.view', 'self')
) AS x(role_key, permission_key, scope)
JOIN public.platform_roles r ON r.key = x.role_key AND r.business_id IS NULL
JOIN public.permissions p ON p.key = x.permission_key
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. has_permission(): the real resolver. SECURITY DEFINER, mirrors owns_business()'s
-- shape so it composes the same way in RLS policies and server functions.
--
-- Resolution order:
--   a. businesses.owner_id = _user_id -> TRUE (the legacy single-column owner always has
--      full access; consistent with owns_business()'s own first check).
--   b. Otherwise, an active business_memberships row for (_user_id, _business_id) must
--      exist, its role must be granted _permission_key via role_permissions, and:
--      - scope 'global'/'business' -> TRUE regardless of branch.
--      - scope 'branch' -> TRUE only if the membership is unscoped (branch_id IS NULL,
--        meaning "all branches") or its branch_id matches _branch_id.
--      - scope 'self' -> TRUE at this layer; callers combining this with a resource-level
--        self-check (e.g. "is this booking's staff_id this specialist's own staff row")
--        are responsible for that second check themselves, since "self" ownership means a
--        different thing per resource type and can't be generically resolved here.
--      - scope 'country' -> not currently granted to any role (verified: zero rows use
--        it); no country-parameter branch is implemented until a real grant needs it.
--
-- Does NOT bundle is_platform_admin() -- callers OR it in separately, matching the
-- existing owns_business()-OR-is_platform_admin() convention used throughout the codebase.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid,
  _business_id uuid,
  _permission_key text,
  _branch_id uuid DEFAULT NULL
)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.businesses WHERE id = _business_id AND owner_id = _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.business_memberships m
      JOIN public.role_permissions rp ON rp.role_id = m.role_id
      JOIN public.permissions p ON p.id = rp.permission_id AND p.key = _permission_key
      WHERE m.business_id = _business_id
        AND m.user_id = _user_id
        AND m.status = 'active'
        AND m.deleted_at IS NULL
        AND (
          rp.scope IN ('global', 'business', 'self')
          OR (rp.scope = 'branch' AND (m.branch_id IS NULL OR m.branch_id = _branch_id))
        )
    )
$function$;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text, uuid) TO authenticated;

-- ============================================================
-- 5. has_branch_access(): coarser helper for "can this user see/act on this branch at
-- all", independent of a specific permission key -- used to branch-scope list queries
-- (e.g. the confirmation queue, calendar) rather than gate a single mutation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_branch_access(
  _user_id uuid,
  _business_id uuid,
  _branch_id uuid
)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    public.owns_business(_user_id, _business_id)
    OR EXISTS (
      SELECT 1 FROM public.business_memberships m
      WHERE m.business_id = _business_id
        AND m.user_id = _user_id
        AND m.status = 'active'
        AND m.deleted_at IS NULL
        AND (m.branch_id IS NULL OR m.branch_id = _branch_id)
    )
$function$;

GRANT EXECUTE ON FUNCTION public.has_branch_access(uuid, uuid, uuid) TO authenticated;
