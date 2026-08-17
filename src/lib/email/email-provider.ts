/**
 * Dallty's own transactional email abstraction — replaces the Lovable-specific
 * `@lovable.dev/email-js` package (`sendLovableEmail`), which was a thin wrapper around
 * Lovable's own hosted send API (`https://api.lovable.dev/v1/messaging/email/send`).
 *
 * Business logic (auth flows, booking notifications, business-status emails) depends on
 * this interface only — never on a specific provider's SDK or endpoint. Swapping providers
 * later means writing one new file that implements `EmailProvider`, not touching any caller.
 *
 * CRITICAL, and the actual root cause of the production crash this replaces: nothing in
 * this module throws at import time. The previous Lovable integration read
 * `process.env["LOVABLE_API_KEY"]!` (non-null assertion) at the top level of a route module,
 * so merely *loading* that route — which TanStack Start's SSR does for every request, not
 * just requests to that specific route — crashed the entire app whenever the variable was
 * unset. `getEmailProvider()` is lazy and `send()` fails soft: no configured provider means
 * a logged, recorded failure, never a crash (brief §22 — fail-safe behavior).
 */

export interface SendEmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  /** Groups related emails for the provider's own analytics/suppression handling. */
  tag?: string;
  /** Dedupes retries of the same logical send. */
  idempotencyKey?: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { sent: true; providerMessageId?: string }
  | { sent: false; reason: "not_configured" | "provider_error" | "suppressed"; error?: string };

export interface EmailProvider {
  readonly code: string;
  send(params: SendEmailParams): Promise<SendEmailResult>;
}

/**
 * Real implementation: Resend (https://resend.com). Chosen because it needs no SDK — a
 * single JSON POST — has first-class transactional-email support, EU data residency is
 * available on request, and its API shape is simple enough that this file is the entire
 * integration (no new npm dependency, matching the existing `sendLovableEmail` pattern of a
 * thin `fetch()` wrapper rather than pulling in a vendor SDK). This is a REAL, working
 * implementation, not a stub — but it only ever activates if `RESEND_API_KEY` is actually
 * set; see `NullEmailProvider` below for the honest, never-crashing default when it isn't
 * (brief §5's "do not invent credentials" — no key exists in this environment).
 */
class ResendEmailProvider implements EmailProvider {
  readonly code = "resend";
  constructor(private readonly apiKey: string) {}

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: params.from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
          reply_to: params.replyTo,
          tags: params.tag ? [{ name: "category", value: params.tag }] : undefined,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[email] resend send failed [${response.status}]:`, body.slice(0, 500));
        return { sent: false, reason: "provider_error", error: `HTTP ${response.status}` };
      }

      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return { sent: true, providerMessageId: data.id };
    } catch (error) {
      console.error("[email] resend send threw:", error);
      return {
        sent: false,
        reason: "provider_error",
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }
}

/**
 * The honest default when no provider is configured — logs and records the failure rather
 * than either crashing (the old bug) or silently pretending to succeed. Every caller in this
 * codebase already treats a `{ sent: false }` result as a normal, handleable outcome (see
 * `notification-engine.server.ts`'s delivery-attempt recording), so this degrades safely:
 * the booking/business-status/notification transaction that triggered the email always
 * still completes.
 */
class NullEmailProvider implements EmailProvider {
  readonly code = "none";

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    console.warn(
      `[email] no provider configured — would have sent "${params.subject}" to ${params.to}`,
    );
    return { sent: false, reason: "not_configured" };
  }
}

let cached: EmailProvider | undefined;

/** Resolved lazily, once, on first actual send attempt — never at module load. */
export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const apiKey = process.env["RESEND_API_KEY"];
  cached = apiKey ? new ResendEmailProvider(apiKey) : new NullEmailProvider();
  return cached;
}
