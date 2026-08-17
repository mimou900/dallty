-- Project 01: Business Membership foundation.
--
-- Today, business ownership is a single businesses.owner_id column — no multi-owner
-- support, no managers/receptionists/confirmation-members as first-class business-scoped
-- roles (only global user_roles + the operational `staff` table for service-performing
-- specialists exist). This migration adds the membership layer the Master Architecture
-- calls for, WITHOUT touching owner_id or any existing behavior:
--
--   - businesses.owner_id stays exactly as-is (still the single source of truth for the
--     original/legacy owner pointer — nothing reads or writes it differently after this
--     migration).
--   - public.owns_business() is extended, not replaced: it keeps its original
--     owner_id check and ADDS a second OR'd check against active 'owner'/'manager'
--     memberships. This is a strict superset of prior behavior (can only grant MORE
--     access, never less), so every one of the 41+ RLS policies built on it keeps working
--     unchanged for every business that has no membership rows yet.
--   - Every existing business is backfilled with one 'owner' membership row
--     (is_primary_owner = true) matching its current owner_id, so the two models start in
--     sync. (The live database currently has 0 businesses — Project 00 cleared test data —
--     so this backfill is a no-op today, but is written correctly for when it isn't.)
--
-- This does NOT implement the multi-owner protection workflow (email confirmation, 15-day
-- removal-protection window, audit trail) from the Master Architecture — only the schema
-- (is_primary_owner) that workflow needs. That workflow is explicitly future
-- authorization-project work.

-- Role catalogue: system roles (business_id IS NULL, Super-Admin-managed) plus
-- business-specific custom roles (business_id NOT NULL, owner/platform-admin-managed).
-- Distinct from the existing public.app_role enum (global platform role: client /
-- business_owner / specialist / admin / super_admin) — this table is the business-scoped
-- role a membership holds, matching the Master Architecture's Role+Permission+Scope target,
-- not a duplicate of the existing global-role system.
CREATE TABLE public.platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name text NOT NULL,
  is_system boolean NOT NULL DEFAULT true,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- System roles have a globally-unique key; a business's own custom roles are unique
-- within that business only (two businesses can each have a "Front Desk Lead").
CREATE UNIQUE INDEX platform_roles_system_key_idx ON public.platform_roles (key) WHERE business_id IS NULL;
CREATE UNIQUE INDEX platform_roles_business_key_idx ON public.platform_roles (business_id, key) WHERE business_id IS NOT NULL;
CREATE INDEX platform_roles_business_id_idx ON public.platform_roles (business_id) WHERE business_id IS NOT NULL;

CREATE TRIGGER platform_roles_touch_updated_at BEFORE UPDATE ON public.platform_roles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_roles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_roles TO authenticated;
GRANT ALL ON public.platform_roles TO service_role;

CREATE POLICY "platform_roles_select" ON public.platform_roles FOR SELECT USING (true);

CREATE POLICY "platform_roles_write_system" ON public.platform_roles FOR ALL TO authenticated
  USING (business_id IS NULL AND public.is_super_admin(auth.uid()))
  WITH CHECK (business_id IS NULL AND public.is_super_admin(auth.uid()));

CREATE POLICY "platform_roles_write_business" ON public.platform_roles FOR ALL TO authenticated
  USING (business_id IS NOT NULL AND (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())))
  WITH CHECK (business_id IS NOT NULL AND (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())));

INSERT INTO public.platform_roles (key, name, is_system, business_id) VALUES
  ('super_admin', 'Super Admin', true, NULL),
  ('owner', 'Owner', true, NULL),
  ('manager', 'Manager', true, NULL),
  ('receptionist', 'Receptionist', true, NULL),
  ('confirmation_member', 'Confirmation Member', true, NULL),
  ('specialist', 'Specialist', true, NULL),
  ('customer', 'Customer', true, NULL),
  ('affiliate', 'Affiliate', true, NULL)
ON CONFLICT (key) WHERE business_id IS NULL DO NOTHING;

-- The membership itself: who has business-management access, at what role, in what state.
CREATE TABLE public.business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.platform_roles(id) ON DELETE RESTRICT,
  is_primary_owner boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX business_memberships_business_user_idx
  ON public.business_memberships (business_id, user_id) WHERE deleted_at IS NULL;
CREATE INDEX business_memberships_business_id_idx ON public.business_memberships (business_id);
CREATE INDEX business_memberships_user_id_idx ON public.business_memberships (user_id);
CREATE INDEX business_memberships_role_id_idx ON public.business_memberships (role_id);

-- At most one primary owner per business — schema-level support for the future owner-
-- protection workflow; the workflow's actual rules (confirmation, 15-day lock, audit) are
-- not implemented here.
CREATE UNIQUE INDEX business_memberships_one_primary_owner_idx
  ON public.business_memberships (business_id) WHERE is_primary_owner AND deleted_at IS NULL;

CREATE TRIGGER business_memberships_touch_updated_at BEFORE UPDATE ON public.business_memberships
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.business_memberships TO authenticated;
GRANT ALL ON public.business_memberships TO service_role;

CREATE POLICY "business_memberships_select" ON public.business_memberships FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.owns_business(auth.uid(), business_id)
    OR public.is_platform_admin(auth.uid())
  );

CREATE POLICY "business_memberships_manage" ON public.business_memberships FOR ALL TO authenticated
  USING (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid()));

-- Backfill: one 'owner' membership per existing business, matching its current owner_id.
-- No-op on the current (empty) businesses table; written for correctness whenever this
-- migration runs against a populated one.
INSERT INTO public.business_memberships (business_id, user_id, role_id, is_primary_owner, status, accepted_at)
SELECT b.id, b.owner_id, r.id, true, 'active', b.created_at
FROM public.businesses b
JOIN public.platform_roles r ON r.key = 'owner' AND r.business_id IS NULL
WHERE b.owner_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Extend owns_business(): keep the original owner_id check, ADD an OR'd check against
-- active owner/manager memberships. Strictly additive — cannot reduce access for any
-- existing business, since the original condition is preserved verbatim.
CREATE OR REPLACE FUNCTION public.owns_business(_user_id uuid, _salon_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.businesses WHERE id = _salon_id AND owner_id = _user_id)
     OR EXISTS (
       SELECT 1
       FROM public.business_memberships m
       JOIN public.platform_roles r ON r.id = m.role_id
       WHERE m.business_id = _salon_id
         AND m.user_id = _user_id
         AND m.status = 'active'
         AND m.deleted_at IS NULL
         AND r.key IN ('owner', 'manager')
     )
$function$;
