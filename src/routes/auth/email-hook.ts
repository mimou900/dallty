import * as React from "react";
import { render } from "@react-email/render";
import { createFileRoute } from "@tanstack/react-router";
import {
  readStandardWebhookHeaders,
  verifyStandardWebhook,
  WebhookVerificationError,
} from "@/lib/webhooks/standard-webhook";
import { getEmailProvider } from "@/lib/email/email-provider";
import { SignupEmail } from "@/lib/email-templates/signup";
import { InviteEmail } from "@/lib/email-templates/invite";
import { MagicLinkEmail } from "@/lib/email-templates/magic-link";
import { RecoveryEmail } from "@/lib/email-templates/recovery";
import { EmailChangeEmail } from "@/lib/email-templates/email-change";
import { ReauthenticationEmail } from "@/lib/email-templates/reauthentication";

/**
 * Dallty's own Supabase Auth "Send Email" hook — replaces the Lovable-hosted
 * pipeline previously at `/lovable/email/auth/webhook` (deleted; see
 * docs/DALLTY_VENDOR_INDEPENDENCE.md). That route required
 * `@lovable.dev/email-js` and Lovable's own hosted send API/proxy; this one
 * only needs Standard Webhooks verification (self-implemented,
 * `src/lib/webhooks/standard-webhook.ts`) and Dallty's `EmailProvider`
 * abstraction (`src/lib/email/email-provider.ts`).
 *
 * LIVE: Supabase's project-level Auth config has `hook_send_email_enabled:
 * true` pointing at `https://www.dallty.com/auth/email-hook`, with
 * `SUPABASE_AUTH_EMAIL_HOOK_SECRET`/`SUPABASE_URL`/`RESEND_API_KEY` all set
 * in production (confirmed via the Management API and a safe unsigned probe
 * of this route — it correctly reaches the "missing webhook headers" check
 * rather than the earlier "not configured" one). Real users now receive
 * this hook's own branded, code-only emails, not Supabase's default
 * templates.
 *
 * Payload shape is Supabase's native Auth Hook body (NOT Lovable's wrapped
 * `{version, type:"auth", data:{...}}` shape):
 *   { user: {...}, email_data: { token, token_hash, redirect_to,
 *     email_action_type, site_url, token_new, token_hash_new } }
 * https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 */

interface SupabaseAuthHookPayload {
  user: { email: string; new_email?: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type:
      "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "reauthentication";
    site_url: string;
    token_hash_new?: string;
  };
}

const SITE_NAME = "dallty";
const ROOT_DOMAIN = "dallty.com";
const SITE_URL = `https://${ROOT_DOMAIN}`;

const SUBJECTS: Record<SupabaseAuthHookPayload["email_data"]["email_action_type"], string> = {
  signup: "Your verification code",
  invite: "Your booking is confirmed — create your account",
  magiclink: "Your sign-in code",
  recovery: "Reset your password",
  email_change: "Confirm your new email",
  reauthentication: "Your verification code",
};

function buildConfirmationUrl(
  supabaseUrl: string,
  emailData: SupabaseAuthHookPayload["email_data"],
): string {
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: emailData.redirect_to || SITE_URL,
  });
  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`;
}

function renderEmail(
  payload: SupabaseAuthHookPayload,
  confirmationUrl: string,
): React.ReactElement {
  const { user, email_data } = payload;
  switch (email_data.email_action_type) {
    case "signup":
      return React.createElement(SignupEmail, {
        siteName: SITE_NAME,
        siteUrl: SITE_URL,
        recipient: user.email,
        confirmationUrl,
        token: email_data.token,
      });
    case "invite":
      return React.createElement(InviteEmail, {
        siteName: SITE_NAME,
        siteUrl: SITE_URL,
        confirmationUrl,
      });
    case "magiclink":
      return React.createElement(MagicLinkEmail, { siteName: SITE_NAME, token: email_data.token });
    case "recovery":
      return React.createElement(RecoveryEmail, { siteName: SITE_NAME, confirmationUrl });
    case "email_change":
      return React.createElement(EmailChangeEmail, {
        siteName: SITE_NAME,
        oldEmail: user.email,
        email: user.email,
        newEmail: user.new_email ?? "",
        confirmationUrl,
      });
    case "reauthentication":
      return React.createElement(ReauthenticationEmail, { token: email_data.token });
  }
}

export const Route = createFileRoute("/auth/email-hook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SUPABASE_AUTH_EMAIL_HOOK_SECRET"];
        const supabaseUrl = process.env["SUPABASE_URL"];
        if (!secret || !supabaseUrl) {
          console.error(
            "[auth-email-hook] not configured (missing SUPABASE_AUTH_EMAIL_HOOK_SECRET or SUPABASE_URL)",
          );
          return Response.json({ error: "not configured" }, { status: 500 });
        }

        const headers = readStandardWebhookHeaders(request);
        const body = await request.text();
        if (!headers) {
          return Response.json({ error: "missing webhook headers" }, { status: 401 });
        }
        try {
          await verifyStandardWebhook(body, headers, secret);
        } catch (error) {
          if (error instanceof WebhookVerificationError) {
            return Response.json({ error: "signature verification failed" }, { status: 401 });
          }
          throw error;
        }

        let payload: SupabaseAuthHookPayload;
        try {
          payload = JSON.parse(body);
        } catch {
          return Response.json({ error: "invalid JSON body" }, { status: 400 });
        }

        const confirmationUrl = buildConfirmationUrl(supabaseUrl, payload.email_data);
        const element = renderEmail(payload, confirmationUrl);
        const html = await render(element);
        const text = await render(element, { plainText: true });

        const result = await getEmailProvider().send({
          to: payload.user.email,
          from: `${SITE_NAME} <noreply@${ROOT_DOMAIN}>`,
          subject: SUBJECTS[payload.email_data.email_action_type],
          html,
          text,
          tag: `auth_${payload.email_data.email_action_type}`,
        });

        if (!result.sent) {
          // Supabase treats a non-2xx as "email failed to send" and surfaces that to the
          // triggering auth request — an honest failure, not a silent swallow.
          console.error("[auth-email-hook] send failed:", result.reason, result.error);
          return Response.json({ error: `email send failed: ${result.reason}` }, { status: 500 });
        }

        return Response.json({});
      },
    },
  },
});
