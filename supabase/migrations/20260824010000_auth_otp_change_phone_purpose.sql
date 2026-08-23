-- Phone number changes now authorize via an email OTP (the account's own verified email)
-- instead of the current password -- a password gate locks out any customer who signed up
-- via OTP/OAuth and never set one, and the old phone number itself can't be the proof since
-- changing it is often exactly because that number was lost. Widen the purpose check
-- accordingly, same pattern as change_email_new's own addition.

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
  CHECK (purpose IN ('login_step_up', 'change_email', 'change_password', 'change_email_new', 'change_phone'));
