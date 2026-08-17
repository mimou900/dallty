-- Project 05: Booking Engine core — the concurrency-safety mechanism this whole project
-- exists to deliver.
--
-- Before this migration (confirmed by reading the live schema, not assumed): the only
-- overlap protection was `bookings_no_double_booking`, a UNIQUE INDEX on
-- (staff_id, starts_at) — it only catches two bookings with the EXACT SAME start
-- timestamp. Two bookings for the same staff member with different-but-overlapping start
-- times (the common case for variable-duration services, or any hold/booking race) could
-- both succeed. There was no hold concept at all.
--
-- This migration replaces that narrow index with a real interval-exclusion constraint
-- (Postgres's native mechanism for "no two rows in this set may overlap"), and folds the
-- hold concept INTO the existing `bookings` table (a hold is a `bookings` row with
-- status='held') rather than creating a second `booking_holds` table — one row, one
-- constraint, one source of truth for "is this staff member busy at this time," instead of
-- two overlap-prevention systems that would need to agree with each other. This is a
-- deliberate reuse decision, not an oversight: the brief itself warns against duplicate
-- booking/availability systems.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- 1. Booking status: add HELD/EXPIRED/NO_SHOW to the existing enum (brief §3, §6, §45)
-- ============================================================
-- PENDING_CONFIRMATION is not added as a separate value: the existing 'pending' already
-- means exactly that in this codebase's usage (verified by reading every call site in
-- Project 00's audit) — adding a second, differently-spelled value for the same concept
-- would be the kind of duplication this project is warned against. IN_PROGRESS/REFUNDED/
-- RESCHEDULED are not added: no consumer exists for IN_PROGRESS (no live-appointment
-- tracking UI), REFUNDED ties to a payment system that doesn't exist yet, and RESCHEDULED
-- is represented instead as an in-place update to the existing row (new starts_at/ends_at)
-- plus an audit-log entry recording the old values — simpler than a new terminal status
-- that would need its own handling everywhere status is read.
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'held';
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'no_show';
