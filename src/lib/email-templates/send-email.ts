import * as React from "react";
import { render } from "@react-email/render";
import { getEmailProvider } from "@/lib/email/email-provider";
import { TEMPLATES } from "./registry";

// Server-only: reads RESEND_API_KEY via getEmailProvider(). Never import from client components.

// Configuration
const SITE_NAME = "dallty";
const FROM_DOMAIN = "dallty.com";

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: "recipient_suppressed" | "not_configured" | "provider_error" };

export interface SendTemplateEmailOptions {
  templateData?: Record<string, unknown>;
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string;
  replyTo?: string;
}

/**
 * Renders a registered template and sends it through Dallty's own `EmailProvider`
 * abstraction (`src/lib/email/email-provider.ts`) — replaces the Lovable-specific
 * `sendLovableEmail`. Never throws on a missing/unconfigured provider: `getEmailProvider()`
 * degrades to a logging no-op rather than crashing the caller, so a booking/notification
 * transaction that triggers an email never fails because of email delivery (brief §22).
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {},
): Promise<SendTemplateEmailResult> {
  const template = TEMPLATES[templateName];
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(", ")}`,
    );
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to;
  if (!recipient) {
    throw new Error("Recipient is required (the template defines no fixed recipient)");
  }

  const templateData = options.templateData ?? {};
  const element = React.createElement(template.component, templateData);
  const html = await render(element);
  const text = await render(element, { plainText: true });
  const subject =
    typeof template.subject === "function" ? template.subject(templateData) : template.subject;

  const result = await getEmailProvider().send({
    to: recipient,
    from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
    subject,
    html,
    text,
    tag: templateName,
    idempotencyKey: options.idempotencyKey || crypto.randomUUID(),
    replyTo: options.replyTo,
  });

  if (result.sent) return { sent: true };
  if (result.reason === "not_configured") return { sent: false, reason: "not_configured" };
  return { sent: false, reason: "provider_error" };
}
