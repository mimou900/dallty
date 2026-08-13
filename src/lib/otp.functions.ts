import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PURPOSES = ["login_step_up", "change_email", "change_password"] as const;
type OtpPurpose = (typeof PURPOSES)[number];

const requestOtpInput = z.object({
  purpose: z.enum(PURPOSES),
  target: z.string().trim().max(255).optional(),
});

/**
 * Sends a fresh 6-digit code for the given purpose to the signed-in user
 * (or to `target`, for change_email — the new address being confirmed).
 * Resends within the cooldown window reuse and refresh the same row instead
 * of creating a new one, so `resend_count` tracks the whole session.
 */
export const requestOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { purpose: OtpPurpose; target?: string }) => requestOtpInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateOtpCode, hashOtpCode } = await import("@/lib/otp.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { getRequest } = await import("@tanstack/react-start/server");

    const { data: settings } = await supabaseAdmin
      .from("auth_settings")
      .select("otp_expiry_minutes, otp_resend_cooldown_seconds, otp_max_attempts")
      .eq("id", true)
      .single();
    const expiryMinutes = settings?.otp_expiry_minutes ?? 10;
    const cooldownSeconds = settings?.otp_resend_cooldown_seconds ?? 60;
    const maxAttempts = settings?.otp_max_attempts ?? 5;

    const { data: latest } = await supabaseAdmin
      .from("auth_otp_codes")
      .select("id, last_sent_at, resend_count, consumed_at, expires_at")
      .eq("user_id", context.userId)
      .eq("purpose", data.purpose)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = Date.now();
    if (latest && !latest.consumed_at) {
      const secondsSinceSend = (now - new Date(latest.last_sent_at).getTime()) / 1000;
      if (secondsSinceSend < cooldownSeconds) {
        throw new Error(
          `Please wait ${Math.ceil(cooldownSeconds - secondsSinceSend)}s before requesting another code`,
        );
      }
    }

    const code = generateOtpCode();
    const codeHash = hashOtpCode(code);
    const expiresAt = new Date(now + expiryMinutes * 60_000).toISOString();
    const userAgent = getRequest()?.headers.get("user-agent") ?? null;

    if (latest && !latest.consumed_at) {
      const { error } = await supabaseAdmin
        .from("auth_otp_codes")
        .update({
          code_hash: codeHash,
          target: data.target ?? null,
          expires_at: expiresAt,
          attempts_used: 0,
          max_attempts: maxAttempts,
          last_sent_at: new Date(now).toISOString(),
          resend_count: latest.resend_count + 1,
          user_agent: userAgent,
        })
        .eq("id", latest.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("auth_otp_codes").insert({
        user_id: context.userId,
        purpose: data.purpose,
        code_hash: codeHash,
        target: data.target ?? null,
        expires_at: expiresAt,
        max_attempts: maxAttempts,
        user_agent: userAgent,
      });
      if (error) throw new Error(error.message);
    }

    let recipient = data.target;
    if (!recipient) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      recipient = authUser?.user?.email ?? undefined;
    }
    if (!recipient) throw new Error("No email address to send the code to");

    const result = await sendTemplateEmail("security-otp", recipient, {
      templateData: { code, purpose: data.purpose, expiryMinutes },
      idempotencyKey: `otp-${context.userId}-${data.purpose}-${now}`,
    });

    return { sent: result.sent, expiryMinutes, cooldownSeconds };
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
    const { otpCodeMatches } = await import("@/lib/otp.server");

    const { data: row, error } = await supabaseAdmin
      .from("auth_otp_codes")
      .select("id, code_hash, target, expires_at, attempts_used, max_attempts, consumed_at")
      .eq("user_id", context.userId)
      .eq("purpose", data.purpose)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("No pending code — request a new one");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("This code has expired — request a new one");
    }
    if (row.attempts_used >= row.max_attempts) {
      throw new Error("Too many incorrect attempts — request a new one");
    }

    if (!otpCodeMatches(data.code, row.code_hash)) {
      const attemptsUsed = row.attempts_used + 1;
      await supabaseAdmin
        .from("auth_otp_codes")
        .update({ attempts_used: attemptsUsed })
        .eq("id", row.id);
      const remaining = row.max_attempts - attemptsUsed;
      throw new Error(
        remaining > 0
          ? `Incorrect code (${remaining} attempt${remaining === 1 ? "" : "s"} left)`
          : "Too many incorrect attempts — request a new one",
      );
    }

    await supabaseAdmin
      .from("auth_otp_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);

    return { verified: true, target: row.target };
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
