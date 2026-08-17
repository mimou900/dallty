-- Project 06: extend the existing payment_status enum (unpaid/paid/refunded, added in an
-- earlier project) rather than creating a second one. New values must be committed in their
-- own transaction before later statements in this migration set can reference them (same
-- constraint hit in Project 05's booking_status extension).
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'payment_pending';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'deposit_required';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'deposit_pending';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'deposit_paid';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'partially_paid';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'payment_failed';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'payment_cancelled';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'refund_pending';
ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'partially_refunded';
