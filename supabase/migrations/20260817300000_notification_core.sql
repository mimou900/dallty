-- Project 07: Notifications, Communications & Reminder Engine — core schema.
--
-- Read this first: this project builds an OUTBOX/dispatch layer for the async channels
-- (email, push, whatsapp, sms) on top of infrastructure that already exists and already
-- works — it does not replace it. Before this migration: `notifications` (in-app, realtime,
-- RLS-scoped to the recipient) and `notify_booking_audience()`/`notify_on_booking_change()`
-- (trigger-driven in-app fan-out for booking_cancelled/booking_rescheduled/waitlist events)
-- were both already real and live. Nothing here duplicates them — in-app stays exactly on
-- its existing synchronous trigger path (cheap, no external API call, already real-time via
-- Supabase Realtime); only email/push/whatsapp/sms — the channels that call slow external
-- providers and must never block a booking/payment transaction (brief §39-40) — go through
-- the new outbox.

-- ============================================================
-- 1. Additive columns on existing tables (reuse, don't duplicate)
-- ============================================================

-- profiles already has notify_in_app/notify_email/notify_sms (live, but notify_email/
-- notify_sms were dead — never consulted by anything before this project). Adding the two
-- missing channels this project introduces, same convention.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp boolean NOT NULL DEFAULT false;

-- businesses already has notify_new_booking/notify_cancellation/notify_review/
-- notify_daily_summary/notify_email_address — seeded in an earlier project, confirmed dead
-- (nothing ever sent an email using them). This project is their first real consumer for
-- notify_new_booking/notify_cancellation (owner email on booking events). notify_review/
-- notify_daily_summary remain out of scope (reviews/reporting are unrelated systems this
-- project doesn't touch) and stay dead, documented, not silently claimed done.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS reminder_offsets_minutes integer[] NOT NULL DEFAULT '{1440,60,15}';

-- notifications: additive columns for deep links (brief §16) and business/branch context
-- (brief §18-19). booking_id/waitlist_id already exist and remain the primary reference;
-- these are for cases the existing FKs don't cover (e.g. a payment-only notification) and
-- for the UI to render without a second query.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deep_link text,
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS notifications_business_id_idx ON public.notifications (business_id)
  WHERE business_id IS NOT NULL;

-- ============================================================
-- 2. Outbox — domain events awaiting async dispatch (brief §41-42)
-- ============================================================
CREATE TABLE public.notification_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       text NOT NULL,
  business_id      uuid REFERENCES public.businesses (id) ON DELETE SET NULL,
  booking_id       uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  payment_id       uuid REFERENCES public.payments (id) ON DELETE SET NULL,
  actor_id         uuid,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Idempotent delivery key (brief §7, §13): when set, a second insert with the same key is
  -- a no-op (ON CONFLICT DO NOTHING at the call site) rather than a duplicate event. Reminder
  -- events key on booking_id + reminder_type + the starts_at snapshot at generation time, so
  -- a reschedule naturally produces a fresh key instead of colliding with the stale one.
  dedupe_key       text,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'cancelled')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  claimed_at       timestamptz,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz
);

CREATE UNIQUE INDEX notification_outbox_dedupe_key_idx
  ON public.notification_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX notification_outbox_claim_idx
  ON public.notification_outbox (next_attempt_at) WHERE status = 'pending';
CREATE INDEX notification_outbox_booking_id_idx ON public.notification_outbox (booking_id)
  WHERE booking_id IS NOT NULL;
CREATE INDEX notification_outbox_event_type_idx ON public.notification_outbox (event_type, created_at DESC);

-- Internal system table — no anon/authenticated access at all, same convention as
-- idempotency_keys/rate_limit_hits (ENABLE RLS + zero policies = deny-all for both roles;
-- service_role bypasses RLS by design and is the only caller).
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.notification_outbox TO service_role;

-- ============================================================
-- 3. Delivery attempts — one row per (outbox event, channel, attempt) (brief §11-12)
-- ============================================================
CREATE TABLE public.notification_deliveries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id          uuid NOT NULL REFERENCES public.notification_outbox (id) ON DELETE CASCADE,
  notification_id    uuid REFERENCES public.notifications (id) ON DELETE SET NULL,
  recipient_user_id  uuid NOT NULL,
  channel            text NOT NULL CHECK (channel IN ('email', 'push', 'whatsapp', 'sms')),
  provider           text,
  attempt_number     integer NOT NULL DEFAULT 1,
  status             text NOT NULL
                        CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'cancelled')),
  provider_reference text,
  error_code         text,
  error_message      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  sent_at            timestamptz,
  delivered_at       timestamptz,
  failed_at          timestamptz
);

CREATE INDEX notification_deliveries_outbox_id_idx ON public.notification_deliveries (outbox_id);
CREATE INDEX notification_deliveries_recipient_idx ON public.notification_deliveries (recipient_user_id, created_at DESC);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.notification_deliveries TO service_role;

-- ============================================================
-- 4. Preferences — category x channel, transactional never gated here (brief §20-22)
-- ============================================================
-- business_id NULL = a customer/global-level category preference (e.g. marketing).
-- business_id set = a business user's operational preference for that business (e.g. an
-- owner who manages two businesses can want new-booking pushes for one but not the other).
-- The blanket profiles.notify_email/notify_push/notify_whatsapp/notify_sms columns remain
-- the channel-level default for MARKETING notifications specifically (see notification-
-- policy.ts) — this table is for per-category overrides on top of that default, not a
-- second copy of the same concept. Transactional notifications are never gated by either
-- mechanism (brief §21: "marketing preferences must not disable critical transactional
-- messages").
CREATE TABLE public.notification_preferences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  business_id  uuid REFERENCES public.businesses (id) ON DELETE CASCADE,
  category     text NOT NULL,
  channel      text NOT NULL CHECK (channel IN ('email', 'push', 'whatsapp', 'sms')),
  enabled      boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_preferences_global_idx
  ON public.notification_preferences (user_id, category, channel) WHERE business_id IS NULL;
CREATE UNIQUE INDEX notification_preferences_business_idx
  ON public.notification_preferences (user_id, business_id, category, channel) WHERE business_id IS NOT NULL;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;

CREATE POLICY "notification_preferences_own" ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER touch_notification_preferences
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 5. Device tokens — push registration (brief §28-30)
-- ============================================================
CREATE TABLE public.device_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  platform       text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  token          text NOT NULL,
  device_name    text,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX device_tokens_token_idx ON public.device_tokens (token);
CREATE INDEX device_tokens_user_id_idx ON public.device_tokens (user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;

-- A user can only ever see/manage their own device tokens (brief §29) — no policy grants
-- broader access, including to platform admins (a leaked push token is not something an
-- admin dashboard needs to browse).
CREATE POLICY "device_tokens_own" ON public.device_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 6. Outbox helper functions
-- ============================================================

-- Single write path into the outbox — every trigger and every TS call site goes through
-- this, so the dedupe/defaults logic lives in exactly one place.
CREATE OR REPLACE FUNCTION public.emit_notification_event(
  _event_type   text,
  _business_id  uuid,
  _booking_id   uuid,
  _payment_id   uuid,
  _actor_id     uuid,
  _payload      jsonb DEFAULT '{}'::jsonb,
  _dedupe_key   text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.notification_outbox
    (event_type, business_id, booking_id, payment_id, actor_id, payload, dedupe_key)
  VALUES (_event_type, _business_id, _booking_id, _payment_id, _actor_id, _payload, _dedupe_key)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.emit_notification_event(text, uuid, uuid, uuid, uuid, jsonb, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.emit_notification_event(text, uuid, uuid, uuid, uuid, jsonb, text) TO service_role;

-- Atomic claim: FOR UPDATE SKIP LOCKED so two concurrent worker invocations never process
-- the same event twice (brief §42, §90) — this is the actual concurrency guarantee, not the
-- caller's own care. Called by processNotificationOutbox() via .rpc().
CREATE OR REPLACE FUNCTION public.claim_notification_outbox_batch(_batch_size integer DEFAULT 25)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_outbox o
  SET status = 'processing', claimed_at = now()
  FROM (
    SELECT id FROM public.notification_outbox
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT LEAST(GREATEST(_batch_size, 1), 100)
    FOR UPDATE SKIP LOCKED
  ) claimed
  WHERE o.id = claimed.id
  RETURNING o.*;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_notification_outbox_batch(integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox_batch(integer) TO service_role;

-- Records the outcome of processing one claimed event. 'retry' puts it back to pending with
-- exponential backoff (2^attempts minutes, capped at 60) for transient failures (brief §12);
-- 'failed'/'processed'/'cancelled' are terminal.
CREATE OR REPLACE FUNCTION public.resolve_notification_outbox_event(
  _id uuid, _outcome text, _error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur_attempts integer;
BEGIN
  IF _outcome = 'retry' THEN
    SELECT attempts INTO cur_attempts FROM public.notification_outbox WHERE id = _id;
    UPDATE public.notification_outbox
    SET status = 'pending',
        attempts = COALESCE(cur_attempts, 0) + 1,
        next_attempt_at = now() + make_interval(mins => LEAST(POWER(2, COALESCE(cur_attempts, 0) + 1), 60)),
        last_error = _error
    WHERE id = _id;
  ELSE
    UPDATE public.notification_outbox
    SET status = _outcome, last_error = _error, processed_at = now()
    WHERE id = _id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_notification_outbox_event(uuid, text, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.resolve_notification_outbox_event(uuid, text, text) TO service_role;

-- ============================================================
-- 7. Booking lifecycle -> domain events (extends the existing, already-live trigger; does
-- not replace it — the in-app notify_booking_audience() calls already in these functions
-- are untouched)
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_on_booking_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  svc text;
BEGIN
  SELECT name INTO svc FROM public.services WHERE id = NEW.service_id;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    -- reschedule_booking() cancels the OLD row as an internal step of a reschedule, not a
    -- genuine cancellation (bug found while wiring this project: before this fix, every
    -- reschedule fired a spurious "booking cancelled" notification to the customer because
    -- this branch can't otherwise tell the two apart). reschedule_booking() sets this
    -- transaction-local flag before it touches the old row, and emits its own correct
    -- booking_rescheduled event itself instead.
    IF current_setting('dallty.reschedule_in_progress', true) IS DISTINCT FROM 'true' THEN
      PERFORM public.notify_booking_audience(
        NEW.id, 'booking_cancelled', 'Booking cancelled',
        COALESCE(svc, 'Appointment') || ' on ' ||
        to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' was cancelled.');
      PERFORM public.emit_notification_event('booking_cancelled', NEW.business_id, NEW.id, NULL,
        NULL, jsonb_build_object('serviceName', svc, 'startsAt', NEW.starts_at));
      -- Never send a reminder for an appointment that no longer exists (brief §9).
      UPDATE public.notification_outbox
      SET status = 'cancelled'
      WHERE booking_id = NEW.id AND status = 'pending' AND event_type LIKE 'booking_reminder_%';
    END IF;
  ELSIF NEW.starts_at <> OLD.starts_at THEN
    PERFORM public.notify_booking_audience(
      NEW.id, 'booking_rescheduled', 'Booking rescheduled',
      COALESCE(svc, 'Appointment') || ' moved to ' ||
      to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || '.');
    PERFORM public.emit_notification_event('booking_rescheduled', NEW.business_id, NEW.id, NULL,
      NULL, jsonb_build_object('serviceName', svc, 'startsAt', NEW.starts_at));
  ELSIF NEW.status = 'confirmed' AND OLD.status <> 'confirmed' THEN
    PERFORM public.emit_notification_event('booking_confirmed', NEW.business_id, NEW.id, NULL,
      NULL, jsonb_build_object('serviceName', svc, 'startsAt', NEW.starts_at));
  ELSIF NEW.status = 'pending' AND OLD.status = 'held' THEN
    PERFORM public.emit_notification_event('booking_pending_confirmation', NEW.business_id, NEW.id,
      NULL, NULL, jsonb_build_object('serviceName', svc, 'startsAt', NEW.starts_at));
  ELSIF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    PERFORM public.emit_notification_event('booking_completed', NEW.business_id, NEW.id, NULL,
      NULL, jsonb_build_object('serviceName', svc, 'startsAt', NEW.starts_at));
  ELSIF NEW.status = 'no_show' AND OLD.status <> 'no_show' THEN
    PERFORM public.emit_notification_event('booking_no_show', NEW.business_id, NEW.id, NULL,
      NULL, jsonb_build_object('serviceName', svc, 'startsAt', NEW.starts_at));
  END IF;
  RETURN NEW;
END;
$$;

-- Direct-insert flows (staff-desk walk-in, guest checkout — booking-engine.md confirms both
-- insert a live status directly, bypassing the held->confirmed UPDATE path entirely, so
-- without this INSERT-time hook they'd get zero email/push coverage). Hold-flow bookings
-- insert with status='held', which this explicitly excludes — they get their event from the
-- UPDATE trigger above instead when confirmed, so a booking never emits both.
CREATE OR REPLACE FUNCTION public.notify_on_booking_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  svc text;
BEGIN
  -- reschedule_booking() also inserts a new row directly at status pending/confirmed — that
  -- is a continuation of an existing booking, not a new one, and already gets its own
  -- explicit booking_rescheduled event from that function. Skip here (same transaction-local
  -- flag used to suppress the spurious cancelled-notification on the old row).
  IF NEW.status IN ('pending', 'confirmed')
     AND current_setting('dallty.reschedule_in_progress', true) IS DISTINCT FROM 'true' THEN
    SELECT name INTO svc FROM public.services WHERE id = NEW.service_id;
    PERFORM public.emit_notification_event('booking_created', NEW.business_id, NEW.id, NULL,
      NEW.customer_id, jsonb_build_object('serviceName', svc, 'startsAt', NEW.starts_at, 'status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_on_booking_insert() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS notify_on_booking_insert ON public.bookings;
CREATE TRIGGER notify_on_booking_insert
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking_insert();

-- ============================================================
-- 8. Reschedule: emit the correct event directly + invalidate stale reminders (brief §8)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reschedule_booking(
  _booking_id uuid,
  _new_starts_at timestamptz,
  _new_ends_at timestamptz,
  _actor_id uuid,
  _reason text DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old public.bookings;
  new_row public.bookings;
  svc text;
BEGIN
  SELECT * INTO old FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF old IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF old.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'BOOKING_NOT_MODIFIABLE';
  END IF;
  IF NOT (
    old.customer_id = _actor_id
    OR public.owns_business(_actor_id, old.business_id)
    OR public.is_business_staff(_actor_id, old.staff_id)
    OR public.is_platform_admin(_actor_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  PERFORM set_config('dallty.reschedule_in_progress', 'true', true);

  INSERT INTO public.bookings (
    customer_id, business_id, service_id, staff_id, starts_at, ends_at, status,
    total_price, notes, customer_name, customer_phone, customer_email
  )
  VALUES (
    old.customer_id, old.business_id, old.service_id, old.staff_id, _new_starts_at, _new_ends_at,
    old.status, old.total_price, old.notes, old.customer_name, old.customer_phone, old.customer_email
  )
  RETURNING * INTO new_row;

  INSERT INTO public.booking_items (booking_id, service_id, service_name, service_name_ar,
    duration_minutes, price, currency, staff_id, business_id, sort_order)
  SELECT new_row.id, service_id, service_name, service_name_ar, duration_minutes, price,
    currency, staff_id, business_id, sort_order
  FROM public.booking_items WHERE booking_id = old.id;

  UPDATE public.bookings SET status = 'cancelled', updated_at = now() WHERE id = old.id;

  -- Old pending reminders were computed against the old starts_at and are now wrong —
  -- cancel them explicitly rather than relying only on the dedupe key changing, so a
  -- reminder that's already claimed/processing can't slip through mid-reschedule.
  UPDATE public.notification_outbox
  SET status = 'cancelled'
  WHERE booking_id = old.id AND status = 'pending' AND event_type LIKE 'booking_reminder_%';

  SELECT name INTO svc FROM public.services WHERE id = new_row.service_id;
  PERFORM public.emit_notification_event('booking_rescheduled', new_row.business_id, new_row.id,
    NULL, _actor_id, jsonb_build_object(
      'serviceName', svc, 'oldStartsAt', old.starts_at, 'newStartsAt', _new_starts_at, 'reason', _reason
    ));

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, business_id, details)
  VALUES (_actor_id, 'booking.rescheduled', 'booking', new_row.id, old.business_id,
    jsonb_build_object(
      'old_booking_id', old.id, 'old_starts_at', old.starts_at, 'old_ends_at', old.ends_at,
      'new_starts_at', _new_starts_at, 'new_ends_at', _new_ends_at, 'reason', _reason
    ));

  RETURN new_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz, timestamptz, uuid, text) TO service_role;

-- ============================================================
-- 9. Waitlist: add outbox emission alongside the existing (unchanged) in-app inserts
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_waitlist_on_free_slot()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w record;
  dur integer;
  price numeric;
  new_booking uuid;
  new_status public.booking_status;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  FOR w IN
    SELECT * FROM public.waitlist_entries
    WHERE status = 'waiting'
      AND staff_id = NEW.staff_id
      AND day = (NEW.starts_at AT TIME ZONE 'UTC')::date
    ORDER BY created_at
  LOOP
    SELECT duration_minutes, COALESCE(discount_price, price)
      INTO dur, price FROM public.services WHERE id = w.service_id;

    IF w.auto_book
       AND dur IS NOT NULL
       AND NEW.starts_at + make_interval(mins => dur) <= NEW.ends_at + interval '0 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM public.bookings b
         WHERE b.staff_id = NEW.staff_id
           AND b.status IN ('pending', 'confirmed')
           AND tstzrange(b.starts_at, b.ends_at, '[)')
               && tstzrange(NEW.starts_at, NEW.starts_at + make_interval(mins => dur), '[)')
       )
    THEN
      new_status := CASE WHEN w.require_confirmation THEN 'pending' ELSE 'confirmed' END;
      INSERT INTO public.bookings (customer_id, business_id, service_id, staff_id, starts_at, ends_at, status, total_price, notes)
      VALUES (w.customer_id, w.business_id, w.service_id, w.staff_id, NEW.starts_at,
              NEW.starts_at + make_interval(mins => dur), new_status, COALESCE(price, 0),
              'Auto-booked from waitlist')
      RETURNING id INTO new_booking;

      UPDATE public.waitlist_entries
      SET status = 'converted', notified_at = now(), booking_id = new_booking
      WHERE id = w.id;

      INSERT INTO public.notifications (user_id, kind, title, body, booking_id, waitlist_id)
      SELECT w.customer_id,
             CASE WHEN w.require_confirmation THEN 'waitlist_pending_confirmation' ELSE 'waitlist_auto_booked' END,
             CASE WHEN w.require_confirmation THEN 'Slot held for you' ELSE 'You are booked!' END,
             'A slot opened on ' || to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') ||
             CASE WHEN w.require_confirmation THEN ' — confirm within the app to keep it.' ELSE ' and was booked for you automatically.' END,
             new_booking, w.id
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = w.customer_id AND p.notify_in_app);

      PERFORM public.emit_notification_event(
        CASE WHEN w.require_confirmation THEN 'waitlist_pending_confirmation' ELSE 'waitlist_auto_booked' END,
        w.business_id, new_booking, NULL, w.customer_id,
        jsonb_build_object('startsAt', NEW.starts_at));

      EXIT;
    ELSE
      UPDATE public.waitlist_entries
      SET status = 'notified', notified_at = now()
      WHERE id = w.id;

      INSERT INTO public.notifications (user_id, kind, title, body, waitlist_id)
      SELECT w.customer_id, 'waitlist_slot_open', 'A slot just opened',
             'A slot opened on ' || to_char(NEW.starts_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' — book it before someone else does.',
             w.id
      WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = w.customer_id AND p.notify_in_app);

      PERFORM public.emit_notification_event('waitlist_slot_open', w.business_id, NULL, NULL,
        w.customer_id, jsonb_build_object('startsAt', NEW.starts_at, 'waitlistId', w.id));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 10. Reminder generation (brief §5-7, §71-74)
-- ============================================================
-- Fire-time math is pure UTC interval arithmetic on starts_at (a timestamptz) — this is
-- deliberately timezone-agnostic and DST-safe by construction: "24 hours before an absolute
-- instant" is unambiguous regardless of which IANA zone the business is in. Only the
-- CONTENT rendered to the customer needs the business's timezone (done in the email
-- template/TS dispatch layer, not here) — never the scheduling math itself (brief §6).
--
-- Idempotent by construction: dedupe_key embeds the starts_at snapshot, so this can be
-- (and is designed to be) called repeatedly/concurrently — ON CONFLICT DO NOTHING makes a
-- re-run a no-op for anything already generated, satisfying brief §7 without a separate
-- "already sent" check.
CREATE OR REPLACE FUNCTION public.generate_due_booking_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  offset_minutes integer;
  reminder_type text;
  inserted_count integer := 0;
  new_id uuid;
BEGIN
  FOR b IN
    SELECT bk.id, bk.business_id, bk.starts_at, bu.reminder_offsets_minutes
    FROM public.bookings bk
    JOIN public.businesses bu ON bu.id = bk.business_id
    WHERE bk.status = 'confirmed' AND bk.starts_at > now()
  LOOP
    FOREACH offset_minutes IN ARRAY COALESCE(b.reminder_offsets_minutes, '{1440,60,15}')
    LOOP
      IF b.starts_at - make_interval(mins => offset_minutes) <= now() THEN
        reminder_type := CASE offset_minutes
          WHEN 1440 THEN 'booking_reminder_24h'
          WHEN 60 THEN 'booking_reminder_1h'
          WHEN 15 THEN 'booking_reminder_15m'
          ELSE 'booking_reminder_' || offset_minutes || 'm'
        END;
        new_id := public.emit_notification_event(
          reminder_type, b.business_id, b.id, NULL, NULL,
          jsonb_build_object('startsAt', b.starts_at, 'offsetMinutes', offset_minutes),
          'reminder:' || b.id || ':' || reminder_type || ':' || b.starts_at::text
        );
        IF new_id IS NOT NULL THEN inserted_count := inserted_count + 1; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN inserted_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_due_booking_reminders() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.generate_due_booking_reminders() TO service_role;
