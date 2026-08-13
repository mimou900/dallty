-- Email change now proves ownership of the OLD address before the new one:
-- 'change_email' is verified first (code sent to the current email), then
-- 'change_email_new' is verified (code sent to the pending new email)
-- before the change is applied. Widen the purpose check accordingly,
-- looking up the existing constraint name rather than assuming it, since it
-- was never given an explicit name.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.auth_otp_codes'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%purpose%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.auth_otp_codes DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.auth_otp_codes
  ADD CONSTRAINT auth_otp_codes_purpose_check
  CHECK (purpose IN ('login_step_up', 'change_email', 'change_password', 'change_email_new'));
