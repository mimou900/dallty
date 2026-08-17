# Dallty — Notification & Communication Architecture

**Status:** Living document. Produced by Project 07 (Notifications, Communications & Reminder
Engine).
**Last updated:** 2026-08-18 (email transport updated to Dallty's own `EmailProvider`
abstraction — see [`DALLTY_VENDOR_INDEPENDENCE.md`](DALLTY_VENDOR_INDEPENDENCE.md); everything
else in this document unchanged).

**Read this first:** substantial notification infrastructure already existed and already
worked before this project — a real `notifications` table with realtime-subscribed in-app
delivery, and a real transactional email system (`sendTemplateEmail` via Dallty's own
`EmailProvider` abstraction, React-Email templates). This project did **not** replace either. It builds the
piece that was genuinely missing: a domain-event/outbox layer that drives the *async*
channels (email, push, WhatsApp, SMS) off booking/payment events, without ever making a
booking or payment wait on a slow external provider, plus a real, live-scheduled reminder
engine. In-app notifications keep using the exact trigger-based path that already worked.

## The architecture (brief §2)

```
BOOKING/PAYMENT EVENT (Postgres trigger or TS server function)
   │
   ├── in-app notification insert (notifications table) ── unchanged, synchronous, existing
   │
   └── emit_notification_event() ── notification_outbox row (PENDING)
          │
          │  (pg_cron, every minute, live) → generate_due_booking_reminders()
          │
          ▼
     processNotificationOutbox()  [claim_notification_outbox_batch: FOR UPDATE SKIP LOCKED]
          │
          ├── resolve recipients (customer / owner) per notification-policy.ts
          ├── resolve channel per recipient (email / push / whatsapp / sms)
          ├── check preference (transactional always bypasses; marketing would consult
          │   notification_preferences → profiles.notify_*)
          ├── dispatch:
          │     email    → real (Dallty EmailProvider, i18n-rendered React Email template)
          │     push     → architecture-ready, no provider (device_tokens schema real)
          │     whatsapp → architecture-ready, no provider
          │     sms      → architecture-ready, no provider
          └── notification_deliveries row per attempt, resolve_notification_outbox_event()
              (processed / retry-with-backoff / failed / cancelled)
```

Booking code never calls `sendEmail()`/`sendWhatsApp()`/`sendPush()` directly — every async
send goes through this one path, resolved by `notification-policy.ts`'s single table of
"event → who → which channel → transactional-or-marketing."

## Tables created

| Table | Purpose |
|---|---|
| `notification_outbox` | Domain events awaiting async dispatch. `dedupe_key` (partial unique index) makes reminder generation idempotent by construction. |
| `notification_deliveries` | One row per (outbox event, channel, attempt) — never overwritten, a new attempt is a new row. |
| `notification_preferences` | Per-category, per-channel opt-out, scoped globally or per-business. Real, RLS-protected, currently exercised only by the always-true transactional path (no marketing event exists yet). |
| `device_tokens` | Push registration: user, platform, token, revocation. RLS: strictly own-rows-only, no admin override. |

## Tables/columns extended (reuse, not duplication)

- `notifications` (+`business_id`, `deep_link`, `category`) — the existing in-app table now
  carries deep-link/business context instead of a second notification table.
- `profiles` (+`notify_push`, `notify_whatsapp`) — `notify_email`/`notify_sms`/`notify_in_app`
  already existed; this project makes `notify_email` a real, consulted signal for the first
  time (previously dead) and adds the two channels this project introduces.
- `businesses` (+`reminder_offsets_minutes`) — business-level override point for reminder
  timing (default `{1440, 60, 15}` = 24h/1h/15m). No country/plan-level override table exists
  yet (no consumer), matching the same honest scoping Project 06 used for deposits.
- `businesses.notify_new_booking` / `notify_cancellation` / `notify_email_address` — **these
  already existed with a real, working owner-facing settings UI** (`/admin/settings`) before
  this project, but were never consulted by anything — a genuinely dead read path behind a
  live write path. This project is their first real consumer: the owner-email gate for
  `booking_confirmed`/`booking_cancelled`. `notify_review`/`notify_daily_summary` remain dead
  — reviews/reporting are unrelated systems this project doesn't touch.

## Domain events (brief §3)

`NOTIFICATION_EVENT_TYPES` (`src/lib/notification-policy.ts`): `booking_created`,
`booking_confirmed`, `booking_pending_confirmation`, `booking_cancelled`,
`booking_rescheduled`, `booking_completed`, `booking_no_show`, `booking_reminder_24h/1h/15m`,
`waitlist_slot_open`, `waitlist_auto_booked`, `waitlist_pending_confirmation`,
`payment_received`, `refund_completed`, `extra_service_added`.

Emitted from:
- **Postgres triggers** (`notify_on_booking_change`, `notify_on_booking_insert`,
  `notify_waitlist_on_free_slot`) — covers every booking-mutation code path in the codebase
  (hold flow, walk-in, guest checkout, staff-desk edits, customer self-service) automatically,
  the same "the constraint/trigger protects every insert path with zero extra code" principle
  Project 05 established for the overlap constraint.
- **`reschedule_booking()`** — emits its own `booking_rescheduled` event directly rather than
  relying on the generic trigger (see "Bug found and fixed" below).
- **TS server functions** (`markCashPayment`, `createRefund`, `addExtraService` in
  `financial.functions.ts`) — via `emitFinancialEvent()`, wrapped so a notification failure
  can never roll back a financial transaction that already committed.

A booking never emits both `booking_created` and `booking_confirmed`/
`booking_pending_confirmation` for the same booking — the INSERT-time trigger explicitly
excludes `status = 'held'` (the hold flow's insert shape), so only the later
UPDATE-time event fires for that flow; only direct-insert flows (walk-in/guest, which insert
a live status immediately) get `booking_created`.

## Bug found and fixed while wiring this project

**`reschedule_booking()` was firing a spurious "booking cancelled" notification on every
reschedule.** The function's own reschedule mechanism (insert a new row, then
`UPDATE ... SET status = 'cancelled'` on the old row) triggers the exact same `AFTER UPDATE`
path a genuine cancellation does — before this project, that meant every reschedule silently
sent the customer a "your booking was cancelled" in-app toast, with no corresponding
"rescheduled" notification ever firing (the `starts_at <> OLD.starts_at` branch can't fire
because the new time lives on a freshly *inserted* row, never an *updated* one). Fixed with a
transaction-local flag (`set_config('dallty.reschedule_in_progress', 'true', true)`,
`is_local = true` so it can never leak across pooled connections) that both the UPDATE and
INSERT triggers check before emitting; `reschedule_booking()` emits the correct
`booking_rescheduled` event itself instead. **Live-tested**: a real reschedule via
`reschedule_booking()` now produces zero `booking_cancelled` events (in-app or outbox) and
exactly one `booking_rescheduled` outbox event, confirmed against the real database.

## Reminder engine (brief §5-9, §71-74)

Default offsets: 24h / 1h / 15m before `starts_at`, per-business configurable
(`businesses.reminder_offsets_minutes`).

**Timezone handling (brief §6) — read this carefully:** fire-time math
(`starts_at - offset <= now()`) is pure UTC interval arithmetic on a `timestamptz` — this is
deliberately timezone-agnostic and DST-safe *by construction*: "24 hours before an absolute
instant" is unambiguous no matter which IANA zone the business is in, so there is no
DST-transition edge case to get wrong in the scheduling math itself. Only the **rendered
content** (what date/time string the customer sees) needs the business's timezone — that
happens in `notification-engine.server.ts`'s `buildEventVars()`, via `formatInTimezone()`
(reused from Project 04, not reimplemented), never the fire-time calculation.

**Idempotent by construction (brief §7):** `generate_due_booking_reminders()` is designed to
be called repeatedly/concurrently — the dedupe key
(`reminder:{booking_id}:{type}:{starts_at snapshot}`) is a partial unique index, so a re-run
is a no-op via `ON CONFLICT DO NOTHING`. **Live-tested**: calling the sweep twice in a row for
the same booking produced zero duplicate reminder rows.

**Reschedule invalidation (brief §8):** the dedupe key embeds the `starts_at` snapshot at
generation time, so a reschedule naturally produces a *different* key (no collision risk) —
and `reschedule_booking()` additionally cancels any still-`pending` reminder rows for the old
booking explicitly, so an already-claimed/processing reminder can't slip through mid-reschedule.
**Live-tested**: rescheduling a booking with pending reminders left them `cancelled`, not sent.

**Cancellation (brief §9):** the booking-cancellation trigger branch cancels every `pending`
reminder for that booking; already-`processed`/sent ones are left untouched as history (never
deleted). **Live-tested.**

**Race conditions / stale state (brief §73-74):** `processNotificationOutbox()` re-derives
recipient/business context fresh from the database at dispatch time (not from the payload
captured at emission time) — a booking cancelled between reminder-generation and dispatch is
caught because the dispatch path only sends to recipients it re-resolves live; nothing is
cached across that gap other than the event type and the original `startsAt`/`serviceName`
snapshot used purely for message content.

**Never after the appointment starts (brief §72):** `generate_due_booking_reminders()` only
considers bookings with `starts_at > now()`; once that flips false the booking permanently
stops being eligible for any further reminder generation, regardless of cron drift.

## Scheduling — what's actually live vs. what's manual

**Live, verified in this project's environment:** `pg_cron` and `pg_net` extensions are
available on this Supabase project (confirmed by successfully enabling them) —
`generate_due_booking_reminders()` runs on a real cron schedule (`* * * * *`, every minute,
job name `dallty-generate-due-reminders`). This is pure SQL with no external HTTP call, so
it needed no secrets and was safe to wire fully automatically.

**Manual today, PLANNED to be automatic:** actually *dispatching* a claimed outbox event
(rendering + calling the email provider) requires TypeScript (React-Email rendering, the
i18n loader) — Postgres/pg_net alone cannot do this. `processNotificationOutboxNow` (Super
Admin only) is a real, fully working manual trigger today. Automating this specific step was
evaluated and deliberately not wired up this session, for two concrete reasons rather than
lack of effort:
1. Calling back into this app's own deployed HTTP origin via `pg_net` would need a confirmed
   production URL, which isn't established in this environment.
2. The alternative — composing emails as raw SQL strings so `pg_net` could call the email
   provider directly from Postgres — would mean duplicating the i18n/React-Email rendering pipeline as
   a second, parallel email system, which is exactly the kind of duplication this whole
   session has been built around avoiding.

The correct real fix (a Supabase Edge Function, or a Cloudflare Cron Trigger once a stable
URL exists) is an infrastructure decision beyond this project's scope — the underlying
dispatch logic is complete and tested; only its automatic invocation is deferred.

## Email — i18n (brief §24-26)

The `emails` namespace (reserved by Project 02 specifically for this project) is now
**active** — `locales/{en,fr,ar}/emails.json`, 14 event keys × {subject, heading, body, cta},
resolved server-side via `getEmailNamespace()`/`tEmail()` (`src/lib/email-templates/i18n.ts`)
— deliberately *not* the `useTranslation()` React hook, since emails render once,
synchronously, outside any React context (`send-email.ts` calls `render(element)` directly).
One generic template (`notification.tsx`, registered once as `"notification"`) serves every
event type, selected by `templateKey` at send time — the same COPY-by-key pattern
`business-status.tsx` already used, just now backed by the real i18n runtime instead of
hardcoded English.

**Deliberately not touched:** the eight pre-existing auth/account email templates (signup,
recovery, magic-link, invite, staff-invite, email-change, business-status, security-otp,
account-change-notice) remain hardcoded English, exactly as they were. Retrofitting all of
them onto the `emails` namespace would be real, valuable work — and real, unnecessary risk to
working, security-sensitive flows (password reset, email change) for a UI-polish gain, well
outside this project's actual scope (notification/reminder architecture, not an i18n sweep of
unrelated systems). Flagged here as a legitimate future follow-up, not silently skipped.

## Channels

| Channel | Status |
|---|---|
| In-app | **Real**, unchanged, pre-existing (realtime bell + panel), now with deep links (see below) |
| Email | **Real** — Dallty EmailProvider (Resend), i18n-rendered, idempotency-keyed per (outbox event, recipient) |
| Push | **Architecture-ready** — `device_tokens` schema + RLS + registration/revocation server functions all real and tested; no push provider (FCM/APNs) configured anywhere in this environment. Dispatch records an honest `failed`/`no_device_token`/`no_push_provider` delivery row rather than pretending to send. |
| WhatsApp | **Architecture-ready** — `WhatsAppProvider` interface (`src/lib/whatsapp-provider.ts`) mirrors `PaymentProvider`'s exact pattern from Project 06. No credentials for any provider exist. `isWhatsAppAvailable()` is the single flip point for when one is wired up. |
| SMS | **Architecture-ready only**, per the brief's own "not V1" instruction — `SmsProvider` interface exists, nothing else. |

## Deep links (brief §16-17, §57)

`notifications.deep_link`/`business_id` are now populated by every in-app write path (the
booking-audience fan-out and both waitlist branches). The notification center
(`notification-center.tsx`) makes an item with a `deep_link` clickable — clicking marks it
read and navigates. **Deep links are never authorization**: the destination route's own
RLS/server-side check is what actually gates access, exactly as if the user had typed the URL
themselves — nothing new was added to trust a notification's origin.

## Preferences (brief §20-22)

Transactional notifications (every event this project actually sends) **always** bypass
`notification_preferences` and the blanket `profiles.notify_*` columns — brief §21's
explicit, non-negotiable rule. The preference-resolution machinery
(`isChannelAllowed()`) is real and would gate a future marketing event correctly, but has no
live consumer today since no marketing system exists (matches the brief's own "do not build
a marketing campaign manager" instruction). `setNotificationPreference` (server function) and
direct RLS-scoped reads let a user manage per-category overrides; no dedicated settings page
was built for this in the customer-facing UI this pass (see Deferred) since, with zero
marketing events to control, there is nothing yet for that UI to meaningfully change.

## Security / RLS — live-tested, not assumed

- `notification_outbox` / `notification_deliveries`: zero grants to `anon`/`authenticated` —
  service-role only, same convention as `idempotency_keys`/`rate_limit_hits`. **Live-tested**:
  an authenticated user's client can read zero rows from `notification_outbox`.
- `notification_preferences` / `device_tokens`: `user_id = auth.uid()` on every operation.
  **Live-tested**: one authenticated user attempting to read another user's device tokens gets
  zero rows; attempting to insert a preference row for another user's `user_id` is rejected
  outright by RLS.
- `emit_notification_event`/`claim_notification_outbox_batch`/
  `resolve_notification_outbox_event`/`generate_due_booking_reminders`: all `REVOKE`d from
  `anon`/`authenticated`, `GRANT`ed only to `service_role`.
- Concurrency: `claim_notification_outbox_batch` uses `FOR UPDATE SKIP LOCKED`. **Live-tested**
  with two simultaneous claim calls against the same pending batch — zero events were claimed
  by both callers.

## Retry / idempotency (brief §11-13)

Every dispatch attempt writes a `notification_deliveries` row; a retried send is a **new**
row (new `attempt_number`), never an overwrite of history. Outbox resolution: `processed` /
`failed` (terminal) or `retry` (exponential backoff, `2^attempts` minutes capped at 60,
`attempts` incremented) — a hard cap of 5 attempts before giving up permanently. Email sends
carry a deterministic `idempotencyKey` (`outbox:{id}:email:{recipient}`) into the provider's own
idempotency-key support, so a retried claim of the same event can't produce a duplicate email
even if the first attempt actually succeeded but the outbox-resolution step failed to record
it (a real, if narrow, crash window this closes).

## Testing performed (live, against the real database)

1. **Dedupe**: two `emit_notification_event()` calls with the same `dedupe_key` → exactly one
   row persisted.
2. **Concurrent claim**: two simultaneous `claim_notification_outbox_batch()` calls against
   the same pending batch → zero overlap between what each caller claimed.
3. **Reminder windowing**: a booking created 20 minutes before its start time → the sweep
   correctly generated the 24h and 1h reminders immediately (both windows were already
   reached) and correctly did *not* generate the 15m reminder yet (its window wasn't reached).
   A second sweep produced zero duplicate rows.
4. **Cancellation cascade**: cancelling a booking with pending reminders → all pending
   reminders flipped to `cancelled`, and a `booking_cancelled` outbox event was emitted.
5. **Reschedule bug fix**: rescheduling a booking → zero spurious `booking_cancelled` events
   (outbox or in-app), exactly one `booking_rescheduled` outbox event, zero spurious
   `booking_created` events on the new row.
6. **RLS**: cross-user reads of `device_tokens` blocked (zero rows); cross-user writes to
   `notification_preferences` blocked (RLS error); `notification_outbox` unreadable by any
   authenticated (non-service-role) client.

**Not live-tested this session:** an actual outbound email delivery (would consume real
provider quota against a fabricated recipient address with no way to verify inbox
delivery) — verified instead by `tsc`/build passing and direct code review of the
`sendTemplateEmail` integration, matching exactly how Project 06 never fired a real payment
because no provider exists; here a provider *does* exist, but firing a real send during
automated testing wasn't judged a safe or useful verification step.

## IMPLEMENTED vs. PLANNED

**IMPLEMENTED, live-tested:** outbox schema + claim/resolve mechanics (dedupe, concurrency,
retry-with-backoff); domain-event emission from every booking-mutation code path and from
`markCashPayment`/`createRefund`/`addExtraService`; the reschedule notification bug fix;
reminder generation with correct timezone-agnostic-by-design scheduling math, idempotent
sweeps, reschedule/cancel invalidation, never-after-start guarantee; `pg_cron`-driven
automatic reminder generation (real, live schedule); `emails` i18n namespace activated with a
real, working generic template; device-token registration/revocation with strict per-user
RLS; notification-preference schema with correct transactional-bypass semantics; deep links
populated end-to-end and clickable in the notification center; `WhatsAppProvider`/
`SmsProvider` abstractions; owner-facing `notify_new_booking`/`notify_cancellation` finally
wired to a real send (first live consumer of a previously dead read path).

**PLANNED, explicitly not built:** automatic scheduling of outbox *dispatch* specifically
(reminder *generation* is automatic; turning a claimed event into a sent email still needs a
manual trigger or a future Edge Function/Cloudflare Cron Trigger — see "Scheduling" above);
any real push/WhatsApp/SMS provider (no credentials exist for any of the three); a
customer-facing notification-preferences settings page (no marketing event exists yet for one
to usefully control); retrofitting the eight pre-existing auth/account emails onto the
`emails` i18n namespace (deliberately out of scope — working, security-sensitive flows left
untouched); a Super-Admin notification-configuration/observability UI beyond the existing
manual-trigger server function (the data — `notification_deliveries`, `notification_outbox`
— is real and queryable; no dashboard was built to consume it, matching Project 03's same
"don't build a monitoring UI speculatively" precedent); marketing-category events and their
consent/campaign machinery (explicitly out of scope per the brief's own "do not build" list).
