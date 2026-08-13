import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PURPOSES = ["login_step_up", "change_email", "change_password"] as const;
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
    const { getRequest } = await import("@tanstack/react-start/server");

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    return sendOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: data.purpose,
      target: data.target,
      userAgent,
    });
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

    return verifyOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: data.purpose,
      code: data.code,
    });
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

    const { data: settings } = await supabaseAdmin
      .from("auth_settings")
      .select("otp_master_enabled")
      .eq("id", true)
      .single();
    if (!settings?.otp_master_enabled) return { required: false };

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.length) return { required: false };

    const { data: policies } = await supabaseAdmin
      .from("auth_role_policies")
      .select("role, otp_enabled")
      .in("role", roles);

    return { required: (policies ?? []).some((p) => p.otp_enabled) };
  });
