/**
 * Dallty's own OTP-delivery abstraction — parallels `email-provider.ts` exactly (same
 * lazy-resolution, never-crash-at-import, honest-null-default shape). Business logic (the
 * Supabase "Send SMS" auth hook) depends on this interface only, never on Vonage's SDK.
 *
 * WhatsApp-first, SMS-fallback: tries the WhatsApp channel first; on ANY failure (bad
 * number, account not yet provisioned for production WhatsApp sending, no approved
 * authentication template, or any other synchronous rejection from Vonage's Messages API),
 * falls back to plain SMS via the same API. This only catches SYNCHRONOUS failures — Vonage's
 * Messages API is fundamentally asynchronous: a 200/202 here means "Vonage accepted the
 * message for processing," not "WhatsApp delivered it." A genuinely undelivered-but-accepted
 * WhatsApp send (e.g. the number really isn't on WhatsApp) is only reported later via a
 * separate delivery-status webhook, which this synchronous try/fallback cannot observe. A
 * true per-attempt fallback on async delivery failure would need a stateful tracking table
 * plus a status-webhook receiver — deliberately not built here; this covers what a single
 * synchronous OTP-send call actually can.
 */

export interface SendSmsParams {
  /** E.164, e.g. "+2135xxxxxxxx". */
  to: string;
  text: string;
  /** Dedupes retries of the same logical send. */
  idempotencyKey?: string;
}

export type SendSmsResult =
  | { sent: true; channel: "whatsapp" | "sms"; providerMessageId?: string }
  | { sent: false; reason: "not_configured" | "provider_error"; error?: string };

export interface SmsProvider {
  readonly code: string;
  send(params: SendSmsParams): Promise<SendSmsResult>;
}

interface VonageMessageResponse {
  message_uuid?: string;
}

/**
 * Real implementation: Vonage Messages API (https://api.nexmo.com/v1/messages). Basic-auth
 * (API key + secret) rather than JWT, matching the simplest path Vonage's own dashboard
 * recommends for getting started — this file is the entire integration, no new npm
 * dependency, matching this codebase's existing "thin fetch() wrapper over an SDK" convention
 * for email.
 */
class VonageSmsProvider implements SmsProvider {
  readonly code = "vonage";

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly whatsappFrom: string,
    private readonly smsFrom: string,
    private readonly whatsappBaseUrl: string,
    private readonly smsBaseUrl: string,
  ) {}

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64")}`;
  }

  private async sendVia(
    channel: "whatsapp" | "sms",
    to: string,
    text: string,
    from: string,
  ): Promise<VonageMessageResponse> {
    // WhatsApp and SMS deliberately use different base URLs: SMS has no sandbox concept at
    // all (it's always sent through the real API), while WhatsApp only works through
    // messages-sandbox.nexmo.com until a production WhatsApp Business sender + approved
    // template exist — using one shared base URL for both would send SMS through a sandbox
    // endpoint that was never meant to carry it.
    const baseUrl = channel === "whatsapp" ? this.whatsappBaseUrl : this.smsBaseUrl;
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        // Vonage wants the number without a leading "+".
        to: to.replace(/^\+/, ""),
        message_type: "text",
        text,
        channel,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    return (await response.json().catch(() => ({}))) as VonageMessageResponse;
  }

  async send(params: SendSmsParams): Promise<SendSmsResult> {
    try {
      const data = await this.sendVia("whatsapp", params.to, params.text, this.whatsappFrom);
      return { sent: true, channel: "whatsapp", providerMessageId: data.message_uuid };
    } catch (whatsappError) {
      console.warn(
        `[sms] vonage whatsapp send failed, falling back to sms:`,
        whatsappError instanceof Error ? whatsappError.message : whatsappError,
      );
      try {
        const data = await this.sendVia("sms", params.to, params.text, this.smsFrom);
        return { sent: true, channel: "sms", providerMessageId: data.message_uuid };
      } catch (smsError) {
        console.error(
          "[sms] vonage sms fallback also failed:",
          smsError instanceof Error ? smsError.message : smsError,
        );
        return {
          sent: false,
          reason: "provider_error",
          error: smsError instanceof Error ? smsError.message : "unknown error",
        };
      }
    }
  }
}

/** Honest default when no provider is configured — never crashes, degrades to a logged failure. */
class NullSmsProvider implements SmsProvider {
  readonly code = "none";

  async send(params: SendSmsParams): Promise<SendSmsResult> {
    console.warn(`[sms] no provider configured — would have sent an SMS/WhatsApp to ${params.to}`);
    return { sent: false, reason: "not_configured" };
  }
}

let cached: SmsProvider | undefined;

/** Resolved lazily, once, on first actual send attempt — never at module load. */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  const apiKey = process.env["VONAGE_API_KEY"];
  const apiSecret = process.env["VONAGE_API_SECRET"];
  const whatsappFrom = process.env["VONAGE_WHATSAPP_FROM"];
  const smsFrom = process.env["VONAGE_SMS_FROM"];
  // Defaults reflect the real current state, not a guess: WhatsApp only works through the
  // sandbox until a production WhatsApp Business sender exists (VONAGE_WHATSAPP_BASE_URL
  // overrides this once it does); SMS has always used the real API, no sandbox involved.
  const whatsappBaseUrl =
    process.env["VONAGE_WHATSAPP_BASE_URL"] || "https://messages-sandbox.nexmo.com";
  const smsBaseUrl = process.env["VONAGE_SMS_BASE_URL"] || "https://api.nexmo.com";
  cached =
    apiKey && apiSecret && whatsappFrom && smsFrom
      ? new VonageSmsProvider(apiKey, apiSecret, whatsappFrom, smsFrom, whatsappBaseUrl, smsBaseUrl)
      : new NullSmsProvider();
  return cached;
}
