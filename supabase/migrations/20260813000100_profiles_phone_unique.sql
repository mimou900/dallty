-- Enforce phone uniqueness across accounts. NULLs are exempt under a
-- standard UNIQUE constraint, so customers without a phone on file are
-- unaffected. Combined with handle_new_user() running inside the same
-- transaction as the auth.users insert, a violation here rolls back the
-- whole signup -- no partial accounts can be created on a phone collision.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);
