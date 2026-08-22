import { createFileRoute } from "@tanstack/react-router";
import {
  readStandardWebhookHeaders,
  verifyStandardWebhook,
  WebhookVerificationError,
} from "@/lib/webhooks/standard-webhook";
import { getSmsProvider } from "@/lib/sms/sms-provider";

/**
 * Dallty's own Supabase Auth "Send SMS" hook — parallels `email-hook.ts` exactly: real users
 * get Supabase's own default (Twilio-backed, plain-SMS-only) delivery until this hook is
 * enabled. Once enabled, this intercepts every phone-OTP send (login, signup) and tries
 * WhatsApp first via Vonage, falling back to SMS on failure — see sms-provider.ts's own doc
 * comment for the real limits of that fallback (synchronous failures only).
 *
 * NOT LIVE YET: requires SUPABASE_AUTH_SMS_HOOK_SECRET set in Vercel's production
 * environment AND Supabase's project-level Auth config to have hook_send_sms_enabled=true
 * pointing at this route (both deliberately left for the operator to confirm, same as
 * email-hook.ts's own rollout) — also requires VONAGE_API_KEY/VONAGE_API_SECRET/
 * VONAGE_WHATSAPP_FROM/VONAGE_SMS_FROM to actually deliver anything (falls back to
 * Supabase's own default SMS pipeline being bypassed with no replacement otherwise — see
 * getSmsProvider()'s NullSmsProvider, which fails the hook honestly rather than silently).
 *
 * Payload shape is Supabase's native Auth Hook body for SMS
 * (https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook):
 *   { user: { id, phone, ... }, sms: { otp } }
 */

interface SupabaseSmsHookPayload {
  user: { phone: string };
  sms: { otp: string };
}

const SITE_NAME = "Dallty";

export const Route = createFileRoute("/auth/sms-hook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["SUPABASE_AUTH_SMS_HOOK_SECRET"];
        if (!secret) {
          console.error("[auth-sms-hook] not configured (missing SUPABASE_AUTH_SMS_HOOK_SECRET)");
          return Response.json({ error: { http_code: 500, message: "not configured" } }, { status: 500 });
        }

        const headers = readStandardWebhookHeaders(request);
        const body = await request.text();
        if (!headers) {
          return Response.json(
            { error: { http_code: 401, message: "missing webhook headers" } },
            { status: 401 },
          );
        }
        try {
          await verifyStandardWebhook(body, headers, secret);
        } catch (error) {
          if (error instanceof WebhookVerificationError) {
            return Response.json(
              { error: { http_code: 401, message: "signature verification failed" } },
              { status: 401 },
            );
          }
          throw error;
        }

        let payload: SupabaseSmsHookPayload;
        try {
          payload = JSON.parse(body);
        } catch {
          return Response.json(
            { error: { http_code: 400, message: "invalid JSON body" } },
            { status: 400 },
          );
        }

        const result = await getSmsProvider().send({
          to: payload.user.phone,
          text: `Your ${SITE_NAME} verification code is ${payload.sms.otp}`,
          idempotencyKey: `sms-otp-${payload.user.phone}-${payload.sms.otp}`,
        });

        if (!result.sent) {
          // Supabase treats a non-2xx as "SMS failed to send" and surfaces that to the
          // triggering auth request — an honest failure, not a silent swallow.
          console.error("[auth-sms-hook] send failed:", result.reason, result.error);
          return Response.json(
            { error: { http_code: 500, message: `sms send failed: ${result.reason}` } },
            { status: 500 },
          );
        }

        return Response.json({});
      },
    },
  },
});
