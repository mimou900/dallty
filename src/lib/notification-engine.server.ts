import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { formatInTimezone, formatMoney } from "@/lib/countries";
import type { Lang } from "@/lib/i18n";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { getEmailProvider } from "@/lib/email/email-provider";
import { renderNotificationEmailData } from "@/lib/email-templates/notification";
import {
  NOTIFICATION_POLICY,
  OWNER_EMAIL_PREFERENCE_COLUMN,
  type NotificationChannel,
  type NotificationEventType,
  type NotificationRecipient,
} from "@/lib/notification-policy";
import { isWhatsAppAvailable } from "@/lib/whatsapp-provider";
import { isSmsAvailable } from "@/lib/sms-provider";

type AnySupabase = SupabaseClient<Database>;

type OutboxRow = Database["public"]["Tables"]["notification_outbox"]["Row"];

interface RecipientContext {
  role: NotificationRecipient;
  userId: string | null;
  email: string | null;
  lang: Lang;
}

/**
 * Everything a template needs to render, resolved once per outbox event (not per recipient —
 * business/service/amount context is the same for every recipient of the same event).
 */
async function buildEventVars(
  supabaseAdmin: AnySupabase,
  outbox: OutboxRow,
): Promise<{
  business: {
    id: string;
    name: string;
    timezone: string;
    ownerId: string | null;
    businessEmail: string | null;
    notifyEmailAddress: string | null;
    notifyNewBooking: boolean;
    notifyCancellation: boolean;
  } | null;
  vars: Record<string, string | number>;
  ctaUrl: string;
}> {
  const payload = (outbox.payload ?? {}) as Record<string, unknown>;
  let business: {
    id: string;
    name: string;
    timezone: string;
    ownerId: string | null;
    businessEmail: string | null;
    notifyEmailAddress: string | null;
    notifyNewBooking: boolean;
    notifyCancellation: boolean;
  } | null = null;

  if (outbox.business_id) {
    const { data: b } = await supabaseAdmin
      .from("businesses")
      .select(
        "id, name, timezone, currency, owner_id, business_email, notify_email_address, notify_new_booking, notify_cancellation",
      )
      .eq("id", outbox.business_id)
      .maybeSingle();
    if (b) {
      business = {
        id: b.id,
        name: b.name,
        timezone: b.timezone,
        ownerId: b.owner_id,
        businessEmail: b.business_email,
        notifyEmailAddress: b.notify_email_address,
        notifyNewBooking: b.notify_new_booking,
        notifyCancellation: b.notify_cancellation,
      };
    }
  }

  const startsAt = payload.startsAt as string | undefined;
  const vars: Record<string, string | number> = {
    business: business?.name ?? "",
    service: (payload.serviceName as string | null) ?? "your appointment",
  };
  if (startsAt) {
    vars.date = formatInTimezone(startsAt, business?.timezone, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    vars.time = formatInTimezone(startsAt, business?.timezone, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (payload.amount != null) {
    vars.amount = formatMoney(payload.amount as number, (payload.currency as string) ?? "DZD");
  }
  if (payload.currency) vars.currency = payload.currency as string;

  const ctaUrl = outbox.booking_id ? `/bookings/${outbox.booking_id}` : "/bookings";

  return { business, vars, ctaUrl };
}

async function getUserEmail(supabaseAdmin: AnySupabase, userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

async function getUserLang(supabaseAdmin: AnySupabase, userId: string): Promise<Lang> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("locale")
    .eq("id", userId)
    .maybeSingle();
  const locale = data?.locale;
  return locale === "fr" || locale === "ar" ? locale : "en";
}

/** Resolves who should be notified for this event, per the policy's recipient roles. */
async function resolveRecipients(
  supabaseAdmin: AnySupabase,
  outbox: OutboxRow,
  business: Awaited<ReturnType<typeof buildEventVars>>["business"],
): Promise<RecipientContext[]> {
  const recipients: RecipientContext[] = [];
  const eventType = outbox.event_type as NotificationEventType;
  const policy = NOTIFICATION_POLICY[eventType];
  if (!policy) return recipients;

  if (policy.recipients.customer) {
    let customerId: string | null = null;
    let email: string | null = null;
    if (outbox.booking_id) {
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("customer_id, customer_email")
        .eq("id", outbox.booking_id)
        .maybeSingle();
      customerId = booking?.customer_id ?? null;
      email = booking?.customer_email ?? null;
    } else if (outbox.actor_id) {
      customerId = outbox.actor_id;
    }
    if (customerId) email = (await getUserEmail(supabaseAdmin, customerId)) ?? email;
    if (email) {
      recipients.push({
        role: "customer",
        userId: customerId,
        email,
        lang: customerId ? await getUserLang(supabaseAdmin, customerId) : "en",
      });
    }
  }

  if (policy.recipients.owner && business?.ownerId) {
    const gateColumn = OWNER_EMAIL_PREFERENCE_COLUMN[eventType];
    const gated =
      gateColumn === "notify_new_booking"
        ? business.notifyNewBooking
        : gateColumn === "notify_cancellation"
          ? business.notifyCancellation
          : true;
    if (gated) {
      const email =
        business.notifyEmailAddress ??
        business.businessEmail ??
        (await getUserEmail(supabaseAdmin, business.ownerId));
      if (email) {
        recipients.push({
          role: "owner",
          userId: business.ownerId,
          email,
          lang: await getUserLang(supabaseAdmin, business.ownerId),
        });
      }
    }
  }

  return recipients;
}

/** Transactional bypasses every preference (brief §21). Marketing (not used by any event
 * today) would fall through to the recipient's category/channel preference row, or the
 * blanket profiles.notify_* default when no override exists. Real mechanism, exercised now
 * only by the always-true transactional path — the same honesty as every other "schema
 * ready, no consumer needs the other branch yet" note in this codebase. */
async function isChannelAllowed(
  supabaseAdmin: AnySupabase,
  params: {
    userId: string | null;
    businessId: string | null;
    category: string;
    channel: NotificationChannel;
    isTransactional: boolean;
  },
): Promise<boolean> {
  if (params.isTransactional) return true;
  if (!params.userId) return true;

  let prefQuery = supabaseAdmin
    .from("notification_preferences")
    .select("enabled")
    .eq("user_id", params.userId)
    .eq("category", params.category)
    .eq("channel", params.channel);
  prefQuery = params.businessId
    ? prefQuery.eq("business_id", params.businessId)
    : prefQuery.is("business_id", null);
  const { data: pref } = await prefQuery.maybeSingle();
  if (pref) return pref.enabled;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("notify_email, notify_push, notify_whatsapp, notify_sms")
    .eq("id", params.userId)
    .maybeSingle();
  if (!profile) return true;
  const byChannel: Record<NotificationChannel, boolean> = {
    email: profile.notify_email,
    push: profile.notify_push,
    whatsapp: profile.notify_whatsapp,
    sms: profile.notify_sms,
  };
  return byChannel[params.channel];
}

async function recordDelivery(
  supabaseAdmin: AnySupabase,
  params: {
    outboxId: string;
    recipientUserId: string | null;
    channel: NotificationChannel;
    status: "sent" | "failed";
    provider?: string;
    providerReference?: string;
    errorCode?: string;
    errorMessage?: string;
  },
) {
  await supabaseAdmin.from("notification_deliveries").insert({
    outbox_id: params.outboxId,
    recipient_user_id: params.recipientUserId ?? "00000000-0000-0000-0000-000000000000",
    channel: params.channel,
    provider: params.provider ?? null,
    status: params.status,
    provider_reference: params.providerReference ?? null,
    error_code: params.errorCode ?? null,
    error_message: params.errorMessage ?? null,
    sent_at: params.status === "sent" ? new Date().toISOString() : null,
    failed_at: params.status === "failed" ? new Date().toISOString() : null,
  } as never);
}

async function dispatchEmail(
  supabaseAdmin: AnySupabase,
  outbox: OutboxRow,
  recipient: RecipientContext,
  templateKey: string,
  vars: Record<string, string | number>,
  ctaUrl: string,
) {
  if (!recipient.email) {
    await recordDelivery(supabaseAdmin, {
      outboxId: outbox.id,
      recipientUserId: recipient.userId,
      channel: "email",
      status: "failed",
      errorCode: "no_email_address",
    });
    return;
  }
  try {
    const templateData = await renderNotificationEmailData(
      recipient.lang,
      templateKey,
      vars,
      ctaUrl,
    );
    const result = await sendTemplateEmail("notification", recipient.email, {
      templateData,
      idempotencyKey: `outbox:${outbox.id}:email:${recipient.userId ?? recipient.email}`,
    });
    await recordDelivery(supabaseAdmin, {
      outboxId: outbox.id,
      recipientUserId: recipient.userId,
      channel: "email",
      status: result.sent ? "sent" : "failed",
      provider: getEmailProvider().code,
      errorCode: result.sent ? undefined : result.reason,
    });
  } catch (error) {
    await recordDelivery(supabaseAdmin, {
      outboxId: outbox.id,
      recipientUserId: recipient.userId,
      channel: "email",
      status: "failed",
      provider: getEmailProvider().code,
      errorCode: "send_failed",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
    });
    throw error; // let the caller decide retry vs. give-up; a provider outage should retry
  }
}

/** Push/WhatsApp/SMS: architecture-ready channel dispatch with no real provider wired up
 * anywhere in this project (brief's own repeated instruction: never fake a send). Records an
 * honest 'failed'/'no_provider' delivery row rather than pretending anything went out — this
 * is the same behavior payment-provider.ts documents for online payments. */
async function dispatchUnconfiguredChannel(
  supabaseAdmin: AnySupabase,
  outbox: OutboxRow,
  recipient: RecipientContext,
  channel: NotificationChannel,
) {
  if (channel === "push") {
    const { data: tokens } = await supabaseAdmin
      .from("device_tokens")
      .select("id")
      .eq("user_id", recipient.userId ?? "")
      .is("revoked_at", null)
      .limit(1);
    await recordDelivery(supabaseAdmin, {
      outboxId: outbox.id,
      recipientUserId: recipient.userId,
      channel: "push",
      status: "failed",
      errorCode: tokens?.length ? "no_push_provider" : "no_device_token",
    });
    return;
  }
  if (channel === "whatsapp") {
    await recordDelivery(supabaseAdmin, {
      outboxId: outbox.id,
      recipientUserId: recipient.userId,
      channel: "whatsapp",
      status: "failed",
      errorCode: isWhatsAppAvailable() ? "send_failed" : "no_whatsapp_provider",
    });
    return;
  }
  await recordDelivery(supabaseAdmin, {
    outboxId: outbox.id,
    recipientUserId: recipient.userId,
    channel: "sms",
    status: "failed",
    errorCode: isSmsAvailable() ? "send_failed" : "no_sms_provider",
  });
}

/**
 * Claims a batch of pending outbox events and dispatches every async channel the policy
 * calls for, per recipient. In-app notifications are NOT handled here — they're already
 * written synchronously by the existing booking/waitlist triggers (see the core migration).
 * Never throws for a single event's failure; every event is resolved independently so one
 * bad recipient/template doesn't block the rest of the batch (brief §91).
 */
export async function processNotificationOutbox(supabaseAdmin: AnySupabase, batchSize = 25) {
  const { data: claimed, error } = await supabaseAdmin.rpc("claim_notification_outbox_batch", {
    _batch_size: batchSize,
  });
  if (error) throw new Error(error.message);

  const summary = { claimed: claimed?.length ?? 0, processed: 0, retried: 0, failed: 0 };

  for (const outbox of claimed ?? []) {
    const eventType = outbox.event_type as NotificationEventType;
    const policy = NOTIFICATION_POLICY[eventType];
    if (!policy) {
      await supabaseAdmin.rpc("resolve_notification_outbox_event", {
        _id: outbox.id,
        _outcome: "failed",
        _error: `unknown event_type: ${eventType}`,
      });
      summary.failed += 1;
      continue;
    }

    try {
      const { business, vars, ctaUrl } = await buildEventVars(supabaseAdmin, outbox as OutboxRow);
      const recipients = await resolveRecipients(supabaseAdmin, outbox as OutboxRow, business);

      for (const recipient of recipients) {
        const channels = policy.recipients[recipient.role] ?? [];
        for (const channel of channels) {
          const allowed = await isChannelAllowed(supabaseAdmin, {
            userId: recipient.userId,
            businessId: outbox.business_id,
            category: policy.category,
            channel,
            isTransactional: policy.category === "transactional",
          });
          if (!allowed) continue;

          if (channel === "email") {
            await dispatchEmail(
              supabaseAdmin,
              outbox as OutboxRow,
              recipient,
              policy.templateKey,
              vars,
              ctaUrl,
            );
          } else {
            await dispatchUnconfiguredChannel(
              supabaseAdmin,
              outbox as OutboxRow,
              recipient,
              channel,
            );
          }
        }
      }

      await supabaseAdmin.rpc("resolve_notification_outbox_event", {
        _id: outbox.id,
        _outcome: "processed",
      });
      summary.processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "unknown error";
      const attempts = (outbox as OutboxRow).attempts ?? 0;
      const outcome = attempts >= 5 ? "failed" : "retry";
      await supabaseAdmin.rpc("resolve_notification_outbox_event", {
        _id: outbox.id,
        _outcome: outcome,
        _error: message,
      });
      if (outcome === "retry") summary.retried += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}
