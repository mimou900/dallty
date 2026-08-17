-- Project 01: soft-deletion foundation for the entities the Master Architecture calls
-- out (Business, Service, Staff/Specialist profile, Customer profile; business_memberships
-- and business_branches already got deleted_at when created earlier in this project).
-- This adds the columns and extends the public-read policies to exclude soft-deleted rows
-- -- it does NOT implement any delete-triggering UI or server function, and does NOT touch
-- any other policy (write policies are unaffected; an owner/admin can still see/manage a
-- soft-deleted row they're allowed to manage today). Because nothing sets deleted_at yet,
-- this changes no current behavior.

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS businesses_deleted_at_idx ON public.businesses (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS services_deleted_at_idx ON public.services (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_deleted_at_idx ON public.staff (deleted_at) WHERE deleted_at IS NOT NULL;

-- Policy bodies below are copied verbatim from their current live definitions (confirmed
-- by reading the migration history: "Public reads approved salons" last redefined in
-- 20260805210502; "Anyone reads services" / "Anyone reads staff" last redefined in
-- 20260801001824 -- all three keep their original names across the salon->business
-- rename, since ALTER TABLE/FUNCTION RENAME preserves policy/OID bindings), with only
-- "AND deleted_at IS NULL" added. DROP+CREATE is required because a policy's USING clause
-- cannot be ALTERed in place.

DROP POLICY IF EXISTS "Public reads approved salons" ON public.businesses;
CREATE POLICY "Public reads approved salons" ON public.businesses
  FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL AND (
      (is_active AND marketplace_status = 'approved')
      OR owner_id = auth.uid()
      OR public.is_platform_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Anyone reads services" ON public.services;
CREATE POLICY "Anyone reads services" ON public.services FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL AND (
      is_active OR public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Anyone reads staff" ON public.staff;
CREATE POLICY "Anyone reads staff" ON public.staff FOR SELECT TO anon, authenticated
  USING (
    deleted_at IS NULL AND (
      is_active OR user_id = auth.uid() OR public.owns_business(auth.uid(), business_id) OR public.is_platform_admin(auth.uid())
    )
  );
