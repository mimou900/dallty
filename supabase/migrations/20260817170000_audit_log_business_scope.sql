-- Project 01: extend the existing admin_audit_log with business_id, so audit entries can
-- be filtered/scoped per business. admin_audit_log (actor_id, action, target_type,
-- target_id, details jsonb, created_at) already matches the Master Architecture's
-- audit_logs foundation almost exactly -- this reuses it rather than creating a second,
-- duplicate audit table.

ALTER TABLE public.admin_audit_log ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS admin_audit_log_business_id_idx ON public.admin_audit_log (business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
