import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PURPOSES = ["login_step_up", "change_email", "change_password", "change_phone"] as const;
type OtpPurpose = (typeof PURPOSES)[number];

const requestOtpInput = z.object({
  purpose: z.enum(PURPOSES),
  target: z.string().trim().max(255).optional(),
});

/** Sends a fresh 6-digit code for the given purpose to the signed-in user. */
export const requestOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { purpose: OtpPurpose; target?: string }) => requestOtpInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendOtpCode } = await import("@/lib/otp.server");
    const { logAdminAction } = await import("@/lib/platform.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    const result = await sendOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: data.purpose,
      target: data.target,
      userAgent,
    });
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "security.otp_requested",
      "user",
      context.userId,
      {
        purpose: data.purpose,
      },
    );
    return result;
  });

const verifyOtpInput = z.object({
  purpose: z.enum(PURPOSES),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

/** Verifies a submitted code for the given purpose, constant-time. */
export const verifyOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { purpose: OtpPurpose; code: string }) => verifyOtpInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyOtpCode } = await import("@/lib/otp.server");
    const { logAdminAction } = await import("@/lib/platform.server");

    let result;
    try {
      result = await verifyOtpCode(supabaseAdmin, {
        userId: context.userId,
        purpose: data.purpose,
        code: data.code,
      });
    } catch (e) {
      await logAdminAction(
        supabaseAdmin,
        context.userId,
        "security.otp_failed",
        "user",
        context.userId,
        {
          purpose: data.purpose,
        },
      );
      throw e;
    }

    // Record step-up completion against this specific session (not just "the user, ever")
    // so a future session that hasn't stepped up still gets challenged. See the
    // auth_step_up_sessions migration for why this can't just be a per-user flag.
    if (data.purpose === "login_step_up") {
      const sessionId = context.claims.session_id as string | undefined;
      if (sessionId) {
        await supabaseAdmin.from("auth_step_up_sessions").upsert({
          session_id: sessionId,
          user_id: context.userId,
          verified_at: new Date().toISOString(),
        });
      }
    }

    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "security.otp_verified",
      "user",
      context.userId,
      {
        purpose: data.purpose,
      },
    );

    return result;
  });

/**
 * Does the signed-in user's role require an OTP step-up on login? Reads via
 * the service-role client since `auth_settings`/`auth_role_policies` are
 * Super-Admin-only under RLS — this narrow {required} boolean is the only
 * thing exposed to a non-super-admin caller.
 */
export const checkLoginOtpRequired = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isStepUpRequired } = await import("@/lib/step-up.server");

    return { required: await isStepUpRequired(supabaseAdmin, context.userId) };
  });
