/**
 * The notification policy (brief §37): for every domain event, who gets notified, on which
 * async channel(s) (in-app is deliberately excluded — see notification-engine.server.ts for
 * why), and whether it's transactional or marketing. This is the single place that answers
 * "what does event X send, to whom, on what channel" — nothing else in this codebase should
 * hardcode that decision (brief §36-37: no duplicate channel-spam logic scattered around).
 *
 * TRANSACTIONAL notifications always bypass the recipient's marketing channel preference
 * (profiles.notify_email/notify_push/notify_whatsapp/notify_sms) — brief §21's explicit
 * requirement. MARKETING is not implemented by any event below (no marketing system exists
 * yet, per the brief's own "do not build" list) — the distinction exists in this table so a
 * future marketing event slots in without re-deciding the rule.
 */

export type NotificationChannel = "email" | "push" | "whatsapp" | "sms";
export type NotificationCategory = "transactional" | "marketing";
export type NotificationPriority = "low" | "normal" | "high" | "critical";
export type NotificationRecipient = "customer" | "owner";

export interface NotificationEventPolicy {
  category: NotificationCategory;
  priority: NotificationPriority;
  /** Which async channels to attempt, per recipient role. In-app is handled separately by
   * the existing trigger-based path and is not listed here. */
  recipients: Partial<Record<NotificationRecipient, NotificationChannel[]>>;
  /** i18n key prefix under the `emails` namespace, e.g. "booking_confirmed" ->
   * emails.booking_confirmed.subject / .heading / .body. */
  templateKey: string;
}

export const NOTIFICATION_EVENT_TYPES = [
  "booking_created",
  "booking_confirmed",
  "booking_pending_confirmation",
  "booking_cancelled",
  "booking_rescheduled",
  "booking_completed",
  "booking_no_show",
  "booking_reminder_24h",
  "booking_reminder_1h",
  "booking_reminder_15m",
  "waitlist_slot_open",
  "waitlist_auto_booked",
  "waitlist_pending_confirmation",
  "payment_received",
  "refund_completed",
  "extra_service_added",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_POLICY: Record<NotificationEventType, NotificationEventPolicy> = {
  // "Created" only fires for direct-insert flows (walk-in/guest checkout) — the hold flow's
  // equivalent moment is booking_confirmed/booking_pending_confirmation instead (see the
  // notify_on_booking_insert trigger for why a booking never emits both).
  booking_created: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email"] },
    templateKey: "booking_created",
  },
  booking_confirmed: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email", "push"], owner: ["email"] },
    templateKey: "booking_confirmed",
  },
  booking_pending_confirmation: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email"] },
    templateKey: "booking_pending_confirmation",
  },
  booking_cancelled: {
    category: "transactional",
    priority: "high",
    recipients: { customer: ["email", "push"], owner: ["email"] },
    templateKey: "booking_cancelled",
  },
  booking_rescheduled: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email", "push"] },
    templateKey: "booking_rescheduled",
  },
  booking_completed: {
    category: "transactional",
    priority: "low",
    recipients: { customer: ["email"] },
    templateKey: "booking_completed",
  },
  booking_no_show: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email"] },
    templateKey: "booking_no_show",
  },
  booking_reminder_24h: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email", "push"] },
    templateKey: "booking_reminder",
  },
  booking_reminder_1h: {
    category: "transactional",
    priority: "high",
    recipients: { customer: ["email", "push"] },
    templateKey: "booking_reminder",
  },
  booking_reminder_15m: {
    category: "transactional",
    priority: "high",
    recipients: { customer: ["push"] },
    templateKey: "booking_reminder",
  },
  waitlist_slot_open: {
    category: "transactional",
    priority: "high",
    recipients: { customer: ["email", "push"] },
    templateKey: "waitlist_slot_open",
  },
  waitlist_auto_booked: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email"] },
    templateKey: "waitlist_auto_booked",
  },
  waitlist_pending_confirmation: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email"] },
    templateKey: "waitlist_pending_confirmation",
  },
  payment_received: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email"] },
    templateKey: "payment_received",
  },
  refund_completed: {
    category: "transactional",
    priority: "normal",
    recipients: { customer: ["email"] },
    templateKey: "refund_completed",
  },
  extra_service_added: {
    category: "transactional",
    priority: "low",
    recipients: { customer: ["email"] },
    templateKey: "extra_service_added",
  },
};

/** businesses.notify_new_booking/notify_cancellation gate the `owner` recipient specifically
 * — the first real consumer of those previously-dead columns (see the core migration). */
export const OWNER_EMAIL_PREFERENCE_COLUMN: Partial<
  Record<NotificationEventType, "notify_new_booking" | "notify_cancellation">
> = {
  booking_confirmed: "notify_new_booking",
  booking_cancelled: "notify_cancellation",
};
