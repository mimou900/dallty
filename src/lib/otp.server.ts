import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;
export type OtpPurpose = "login_step_up" | "change_email" | "change_password";

/** Generates a 6-digit numeric code, zero-padded (e.g. "004821"). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function secret(): string {
  const value = process.env.OTP_HMAC_SECRET;
  if (!value) throw new Error("OTP_HMAC_SECRET is not configured");
  return value;
}

/** HMAC-SHA256(secret, code) as hex — never store or compare the raw code. */
export function hashOtpCode(code: string): string {
  return createHmac("sha256", secret()).update(code).digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function otpCodeMatches(code: string, hash: string): boolean {
  const submitted = Buffer.from(hashOtpCode(code), "hex");
  const stored = Buffer.from(hash, "hex");
  if (submitted.length !== stored.length) return false;
  return timingSafeEqual(submitted, stored);
}

/**
 * Sends a fresh 6-digit code for the given purpose to `target` (or the
 * user's own account email when `target` is omitted). Resends within the
 * cooldown window reuse and refresh the same row instead of creating a new
 * one, so `resend_count` tracks the whole session. Shared by the `requestOtp`
 * server function and every Phase C change-* flow that needs to trigger a
 * code send without re-running createServerFn middleware.
 */
export async function sendOtpCode(
  supabaseAdmin: AnySupabase,
  params: {
    userId: string;
    purpose: OtpPurpose;
    target?: string | null;
    userAgent?: string | null;
  },
): Promise<{ sent: boolean; expiryMinutes: number; cooldownSeconds: number }> {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

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
    .eq("user_id", params.userId)
    .eq("purpose", params.purpose)
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
  const target = params.target ?? null;

  if (latest && !latest.consumed_at) {
    const { error } = await supabaseAdmin
      .from("auth_otp_codes")
      .update({
        code_hash: codeHash,
        target,
        expires_at: expiresAt,
        attempts_used: 0,
        max_attempts: maxAttempts,
        last_sent_at: new Date(now).toISOString(),
        resend_count: latest.resend_count + 1,
        user_agent: params.userAgent ?? null,
      })
      .eq("id", latest.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("auth_otp_codes").insert({
      user_id: params.userId,
      purpose: params.purpose,
      code_hash: codeHash,
      target,
      expires_at: expiresAt,
      max_attempts: maxAttempts,
      user_agent: params.userAgent ?? null,
    });
    if (error) throw new Error(error.message);
  }

  let recipient = params.target;
  if (!recipient) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(params.userId);
    recipient = authUser?.user?.email ?? undefined;
  }
  if (!recipient) throw new Error("No email address to send the code to");

  const result = await sendTemplateEmail("security-otp", recipient, {
    templateData: { code, purpose: params.purpose, expiryMinutes },
    idempotencyKey: `otp-${params.userId}-${params.purpose}-${now}`,
  });

  return { sent: result.sent, expiryMinutes, cooldownSeconds };
}

/**
 * Verifies a submitted code for the given purpose, constant-time. Shared by
 * the `verifyOtp` server function and every Phase C confirm-* flow.
 */
export async function verifyOtpCode(
  supabaseAdmin: AnySupabase,
  params: { userId: string; purpose: OtpPurpose; code: string },
): Promise<{ verified: true; target: string | null }> {
  const { data: row, error } = await supabaseAdmin
    .from("auth_otp_codes")
    .select("id, code_hash, target, expires_at, attempts_used, max_attempts, consumed_at")
    .eq("user_id", params.userId)
    .eq("purpose", params.purpose)
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

  if (!otpCodeMatches(params.code, row.code_hash)) {
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
}
