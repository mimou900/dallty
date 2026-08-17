-- Project 07: attempt to enable a real scheduler. Kept as its own migration, separate from
-- the correctness-critical core schema (20260817300000), specifically so that if pg_cron/
-- pg_net aren't available on this Supabase project's plan, that failure is isolated and
-- doesn't block anything else. If this migration applies successfully, the two cron jobs
-- below make reminder generation and outbox dispatch genuinely automatic; if it fails, the
-- underlying functions/server routes are still fully real and callable manually or by any
-- future external scheduler — see DALLTY_NOTIFICATION_ARCHITECTURE.md for what "PLANNED"
-- means in that case.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Reminder generation is pure SQL (no external API call), so it can run directly on a
-- schedule with no HTTP hop at all.
SELECT cron.schedule(
  'dallty-generate-due-reminders',
  '* * * * *',
  $$SELECT public.generate_due_booking_reminders();$$
);
