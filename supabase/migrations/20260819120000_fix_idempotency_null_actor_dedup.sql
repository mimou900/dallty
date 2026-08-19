-- Project 10: CRITICAL fix, found live-testing confirmGuestBookingHold's idempotency against
-- the deployed Preview -- retrying the exact same idempotency key for the exact same guest
-- confirm returned BOOKING_ALREADY_CONFIRMED (a different response than the original success)
-- instead of the original cached result.
--
-- idempotency_keys.UNIQUE (actor_id, operation, idempotency_key) (20260817210000...sql:24) --
-- standard SQL: NULL is never equal to NULL for uniqueness purposes, so two INSERTs with the
-- same (operation, idempotency_key) but actor_id = NULL never conflict. withIdempotency()
-- (idempotency.server.ts) relies on that 23505 conflict to detect a repeat call and either
-- return the cached response or reject a truly-concurrent duplicate -- for every authenticated
-- caller (a real actor_id) this worked correctly and was already exercised by markCashPayment/
-- createRefund; guests (confirmGuestBookingHold, actor_id always NULL) are the first caller
-- where it silently never deduplicated at all -- each "duplicate" call just inserted its own
-- fresh row and re-ran confirmCore from scratch. No duplicate booking resulted only because
-- confirmCore's own hold.status re-check happened to catch it and return a (different, wrong)
-- error instead -- a network retry after a guest's first confirm actually succeeded would have
-- shown them an error, not their booking confirmation.
--
-- Fix: replace the plain UNIQUE constraint with a unique index on
-- COALESCE(actor_id, '00000000-...'::uuid) so every NULL-actor row collapses onto the same
-- sentinel value for uniqueness purposes, restoring real deduplication for guests. Unique
-- indexes raise the same 23505 conflict as named unique constraints, so withIdempotency()
-- needs no code change.
ALTER TABLE public.idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_actor_id_operation_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_actor_op_key_idx ON public.idempotency_keys (
  COALESCE(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
  operation,
  idempotency_key
);
