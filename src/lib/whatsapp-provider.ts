/**
 * Provider-agnostic WhatsApp abstraction (brief §31-33), mirroring the exact pattern
 * established by `payment-provider.ts` in Project 06: define the contract every future
 * adapter implements so core notification-dispatch code never depends on a specific
 * provider's SDK. No credentials for any WhatsApp Business API provider (Meta Cloud API,
 * Twilio, 360dialog, or otherwise) exist anywhere in this project's environment — confirmed
 * by the same absence pattern as every other provider integration in this session. Do not
 * implement a fake/stub adapter that pretends to send — the dispatch engine's "no provider
 * configured" outcome (see notification-engine.server.ts) is the honest behavior until one
 * is wired up.
 */

export type WhatsAppMessageCategory =
  | "booking_confirmation"
  | "booking_reminder"
  | "booking_cancellation"
  | "booking_reschedule"
  | "verification"
  | "marketing";

export interface SendWhatsAppParams {
  to: string; // E.164 phone number
  category: WhatsAppMessageCategory;
  templateName: string;
  templateData: Record<string, string>;
}

export interface SendWhatsAppResult {
  providerMessageId: string;
  status: "queued" | "sent" | "failed";
}

/**
 * Every future adapter (Meta Cloud API, Twilio, 360dialog, ...) implements this. Core
 * notification-dispatch code depends only on this interface (brief §33: "future provider
 * changes must not require rewriting booking logic").
 */
export interface WhatsAppProvider {
  readonly code: string;
  sendMessage(params: SendWhatsAppParams): Promise<SendWhatsAppResult>;
  verifyWebhook(rawBody: string, signatureHeader: string): boolean;
}

/**
 * Resolves whether WhatsApp is usable for a given business today (brief §32: plan/country/
 * business-settings gated, never hardcoded "premium = WhatsApp"). Always returns false right
 * now — no provider is configured (`platform_security_settings`-style provider config for
 * WhatsApp doesn't exist yet either, since there is nothing for it to point at). This
 * function exists so the dispatch engine has exactly one place to flip once a real provider
 * and its plan/country gating rules are decided, instead of a hardcoded check inline.
 */
export function isWhatsAppAvailable(): boolean {
  return false;
}
