-- Business/Salon Terminology Rename, migration 2 of 4: enum value renames.
-- Same ALTER ... RENAME VALUE pattern already proven safe in this project's
-- earlier customer->client / staff->specialist role rename: preserves every
-- existing row's value (no backfill), and — per the same empirical check
-- run for migration 1 — auto-propagates into any policy that compares
-- against the literal (e.g. has_role(auth.uid(), 'salon_owner'::app_role)).

ALTER TYPE public.app_role RENAME VALUE 'salon_owner' TO 'business_owner';
ALTER TYPE public.favorite_kind RENAME VALUE 'salon' TO 'business';
