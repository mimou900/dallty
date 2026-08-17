-- Project 01: Permission foundation (Role + Permission + Scope), per the Master
-- Architecture's authorization target. This is schema and reference data only — no RLS
-- policy, server function, or frontend code is rewired to consult these tables in this
-- project. The existing role-only enforcement (has_role/is_platform_admin/is_super_admin/
-- owns_business, and every server-side assertCanManageBusiness/assertSuperAdmin check)
-- keeps working completely unchanged. This gives the future authorization project a real
-- schema to build on instead of starting from nothing.

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.permissions TO anon, authenticated;
GRANT ALL ON public.permissions TO service_role;

CREATE POLICY "permissions_select" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "permissions_write" ON public.permissions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- Initial permission list from the Master Architecture. Expandable later without a
-- structural change — this is exactly the kind of reference data this table exists for.
INSERT INTO public.permissions (key, description) VALUES
  ('business.view', 'View business profile and settings'),
  ('business.edit', 'Edit business profile and settings'),
  ('booking.view', 'View bookings'),
  ('booking.create', 'Create bookings'),
  ('booking.confirm', 'Confirm a pending booking'),
  ('booking.reschedule', 'Reschedule a booking'),
  ('booking.cancel', 'Cancel a booking'),
  ('booking.mark_paid', 'Mark a booking as paid'),
  ('customer.view', 'View customer records'),
  ('customer.edit', 'Edit customer records'),
  ('service.view', 'View services'),
  ('service.create', 'Create services'),
  ('service.edit', 'Edit services'),
  ('service.delete', 'Delete services'),
  ('staff.view', 'View staff/specialists'),
  ('staff.invite', 'Invite staff/specialists'),
  ('staff.edit', 'Edit staff/specialists'),
  ('staff.permissions', 'Manage staff role/permission assignments'),
  ('financial.view', 'View financial data'),
  ('financial.manage', 'Manage financial data'),
  ('subscription.view', 'View subscription/plan'),
  ('subscription.manage', 'Manage subscription/plan'),
  ('security.manage', 'Manage security settings'),
  ('ownership.manage', 'Manage business ownership/membership')
ON CONFLICT (key) DO NOTHING;

CREATE TYPE public.permission_scope AS ENUM ('global', 'country', 'business', 'branch', 'self');

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.platform_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  scope public.permission_scope NOT NULL DEFAULT 'business',
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX role_permissions_permission_id_idx ON public.role_permissions (permission_id);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.role_permissions TO anon, authenticated;
GRANT ALL ON public.role_permissions TO service_role;

CREATE POLICY "role_permissions_select" ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY "role_permissions_write" ON public.role_permissions FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.platform_roles r WHERE r.id = role_id AND r.business_id IS NOT NULL
        AND (public.owns_business(auth.uid(), r.business_id) OR public.is_platform_admin(auth.uid()))
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.platform_roles r WHERE r.id = role_id AND r.business_id IS NOT NULL
        AND (public.owns_business(auth.uid(), r.business_id) OR public.is_platform_admin(auth.uid()))
    )
  );

-- Default scope/permission grants for the seeded system roles, matching the Master
-- Architecture's own worked examples (specialist booking.view scope=self; manager
-- booking.view scope=business; super_admin business.view scope=global). Reference data for
-- the future authorization engine to read — not consulted by any RLS policy yet.
INSERT INTO public.role_permissions (role_id, permission_id, scope)
SELECT r.id, p.id, x.scope::public.permission_scope
FROM (VALUES
  ('super_admin', 'business.view', 'global'), ('super_admin', 'business.edit', 'global'),
  ('super_admin', 'booking.view', 'global'), ('super_admin', 'booking.confirm', 'global'),
  ('super_admin', 'booking.reschedule', 'global'), ('super_admin', 'booking.cancel', 'global'),
  ('super_admin', 'booking.mark_paid', 'global'), ('super_admin', 'customer.view', 'global'),
  ('super_admin', 'customer.edit', 'global'), ('super_admin', 'service.view', 'global'),
  ('super_admin', 'service.create', 'global'), ('super_admin', 'service.edit', 'global'),
  ('super_admin', 'service.delete', 'global'), ('super_admin', 'staff.view', 'global'),
  ('super_admin', 'staff.invite', 'global'), ('super_admin', 'staff.edit', 'global'),
  ('super_admin', 'staff.permissions', 'global'), ('super_admin', 'financial.view', 'global'),
  ('super_admin', 'financial.manage', 'global'), ('super_admin', 'subscription.view', 'global'),
  ('super_admin', 'subscription.manage', 'global'), ('super_admin', 'security.manage', 'global'),
  ('super_admin', 'ownership.manage', 'global'),

  ('owner', 'business.view', 'business'), ('owner', 'business.edit', 'business'),
  ('owner', 'booking.view', 'business'), ('owner', 'booking.create', 'business'),
  ('owner', 'booking.confirm', 'business'), ('owner', 'booking.reschedule', 'business'),
  ('owner', 'booking.cancel', 'business'), ('owner', 'booking.mark_paid', 'business'),
  ('owner', 'customer.view', 'business'), ('owner', 'customer.edit', 'business'),
  ('owner', 'service.view', 'business'), ('owner', 'service.create', 'business'),
  ('owner', 'service.edit', 'business'), ('owner', 'service.delete', 'business'),
  ('owner', 'staff.view', 'business'), ('owner', 'staff.invite', 'business'),
  ('owner', 'staff.edit', 'business'), ('owner', 'staff.permissions', 'business'),
  ('owner', 'financial.view', 'business'), ('owner', 'financial.manage', 'business'),
  ('owner', 'subscription.view', 'business'), ('owner', 'subscription.manage', 'business'),
  ('owner', 'security.manage', 'business'), ('owner', 'ownership.manage', 'business'),

  ('manager', 'business.view', 'business'), ('manager', 'business.edit', 'business'),
  ('manager', 'booking.view', 'business'), ('manager', 'booking.create', 'business'),
  ('manager', 'booking.confirm', 'business'), ('manager', 'booking.reschedule', 'business'),
  ('manager', 'booking.cancel', 'business'), ('manager', 'booking.mark_paid', 'business'),
  ('manager', 'customer.view', 'business'), ('manager', 'customer.edit', 'business'),
  ('manager', 'service.view', 'business'), ('manager', 'service.create', 'business'),
  ('manager', 'service.edit', 'business'), ('manager', 'staff.view', 'business'),
  ('manager', 'staff.invite', 'business'), ('manager', 'staff.edit', 'business'),
  ('manager', 'financial.view', 'business'),

  ('receptionist', 'booking.view', 'business'), ('receptionist', 'booking.create', 'business'),
  ('receptionist', 'booking.confirm', 'business'), ('receptionist', 'booking.reschedule', 'business'),
  ('receptionist', 'booking.cancel', 'business'), ('receptionist', 'booking.mark_paid', 'business'),
  ('receptionist', 'customer.view', 'business'), ('receptionist', 'customer.edit', 'business'),
  ('receptionist', 'service.view', 'business'), ('receptionist', 'staff.view', 'business'),

  ('confirmation_member', 'booking.view', 'business'), ('confirmation_member', 'booking.confirm', 'business'),
  ('confirmation_member', 'booking.reschedule', 'business'), ('confirmation_member', 'booking.cancel', 'business'),
  ('confirmation_member', 'customer.view', 'business'),

  ('specialist', 'booking.view', 'self'), ('specialist', 'booking.confirm', 'self'),
  ('specialist', 'booking.reschedule', 'self'), ('specialist', 'service.view', 'self'),
  ('specialist', 'customer.view', 'self'),

  ('customer', 'booking.view', 'self'), ('customer', 'booking.create', 'self'),
  ('customer', 'booking.cancel', 'self'), ('customer', 'booking.reschedule', 'self')
) AS x(role_key, permission_key, scope)
JOIN public.platform_roles r ON r.key = x.role_key AND r.business_id IS NULL
JOIN public.permissions p ON p.key = x.permission_key
ON CONFLICT DO NOTHING;
