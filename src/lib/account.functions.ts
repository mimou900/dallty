import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { policyForRoles, validatePassword, type PasswordPolicyId } from "@/lib/password-policy";
import { sanitizeDbError } from "@/lib/db-error.server";

/**
 * Permanently deletes the signed-in user's auth account.
 * Profile, bookings and related rows cascade or are cleaned by the database.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(sanitizeDbError(error));
    return { ok: true };
  });

/**
 * Server-side password policy check used before an account is created.
 * Signup forms cannot be trusted to run the rules themselves.
 */
export const checkSignupPassword = createServerFn({ method: "POST" })
  .inputValidator((input: { password: string; accountType: PasswordPolicyId }) =>
    z
      .object({
        password: z.string().min(1).max(200),
        accountType: z.enum(["client", "privileged"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `check_signup_password:${ip}`, 60, 10);

    return validatePassword(data.password, data.accountType);
  });

/**
 * Changes the signed-in user's password, enforcing the policy that matches
 * their role (customers get the simple rules, business roles the strong ones).
 */
export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const policy = policyForRoles((roleRows ?? []).map((r) => r.role as string));

    const result = validatePassword(data.password, policy);
    if (!result.valid) throw new Error(result.errors[0] ?? "Password does not meet requirements");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) throw new Error(sanitizeDbError(error));
    return { ok: true, policy };
  });

/**
 * Does this email already belong to a Dallty account? Guest-callable (no
 * session yet), so the response is kept to a single boolean.
 */
export const checkEmailHasAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emailExists } = await import("@/lib/account.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    // Rate-limited by IP, not by the submitted email — the risk this guards against is
    // one source scanning many different addresses, not repeated checks of the same one.
    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `check_email:${ip}`, 20, 10);

    return { exists: await emailExists(supabaseAdmin, data.email) };
  });

/**
 * Does this phone number already belong to a Dallty account? Guest-callable
 * (no session yet), mirroring `checkEmailHasAccount` so signup forms can
 * surface a friendly error before hitting the `profiles_phone_unique`
 * constraint. Expects an already-normalized E.164 value.
 */
export const checkPhoneHasAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) =>
    z.object({ phone: z.string().trim().min(8).max(20) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `check_phone:${ip}`, 20, 10);

    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();
    if (error) throw new Error(sanitizeDbError(error));
    return { exists: Boolean(row) };
  });

/** Checks the signed-in user's current password. Gates the change-password and change-phone flows. */
export const verifyCurrentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password: string }) =>
    z.object({ password: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyPassword } = await import("@/lib/account.server");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = authUser?.user?.email;
    if (!email) throw new Error("Could not verify — no email on this account");

    return { valid: await verifyPassword(email, data.password) };
  });

/**
 * Step 1 of the change-email flow: rejects a duplicate target, then sends an
 * OTP to the *current* (old) address — proving whoever is making this
 * change actually controls the account, before the new address is ever
 * touched. `target` already holds the pending new address so step 2 knows
 * where to send the second code.
 */
export const requestEmailChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { newEmail: string }) =>
    z.object({ newEmail: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emailExists } = await import("@/lib/account.server");
    const { sendOtpCode } = await import("@/lib/otp.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const newEmail = data.newEmail.toLowerCase();
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const currentEmail = authUser?.user?.email;
    if (!currentEmail) throw new Error("Could not verify — no email on this account");
    if (currentEmail.toLowerCase() === newEmail) {
      throw new Error("That's already your current email");
    }
    if (await emailExists(supabaseAdmin, newEmail)) {
      throw new Error("This email is already registered to another account");
    }

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    return sendOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: "change_email",
      target: newEmail,
      recipient: currentEmail,
      userAgent,
    });
  });

const otpCodeInput = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

/**
 * Step 2: verifies the code sent to the *old* address, then sends a fresh
 * code to the pending new address (read from the just-verified row's own
 * target, not resupplied by the client).
 */
export const verifyOldEmailForChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => otpCodeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyOtpCode, sendOtpCode } = await import("@/lib/otp.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const result = await verifyOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: "change_email",
      code: data.code,
    });
    if (!result.target) throw new Error("No email change is pending — start over");

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    const sent = await sendOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: "change_email_new",
      target: result.target,
      recipient: result.target,
      userAgent,
    });
    return { ...sent, newEmail: result.target };
  });

/**
 * Step 3: verifies the code sent to the *new* address, then applies the
 * change using that row's own stored target — never a client-resupplied
 * value, so a stale or tampered client can't redirect the change elsewhere.
 * Notifies the *old* address afterward.
 */
export const confirmEmailChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => otpCodeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyOtpCode } = await import("@/lib/otp.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { securityAlertFields } = await import("@/lib/account.server");
    const { logAdminAction } = await import("@/lib/platform.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const result = await verifyOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: "change_email_new",
      code: data.code,
    });
    if (!result.target) throw new Error("No email change is pending — start over");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const oldEmail = authUser?.user?.email ?? null;

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      email: result.target,
      email_confirm: true,
    });
    if (error) throw new Error(sanitizeDbError(error));

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    if (oldEmail) {
      await sendTemplateEmail("account-change-notice", oldEmail, {
        templateData: {
          change: "email",
          detail: `New email: ${result.target}`,
          ...securityAlertFields(userAgent),
        },
        idempotencyKey: `email-changed-${context.userId}-${Date.now()}`,
      }).catch(() => {});
    }
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "security.email_changed",
      "user",
      context.userId,
      {
        newEmail: result.target,
      },
    );

    return { ok: true, newEmail: result.target };
  });

/**
 * Step 1 of the authenticated change-password flow (distinct from
 * `changeMyPassword`, which powers the forgot-password recovery-link flow
 * and has no current password to check). Validates the current password,
 * the new policy, and reuse-prevention before sending an OTP.
 */
export const requestPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { currentPassword: string; newPassword: string }) =>
    z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyPassword } = await import("@/lib/account.server");
    const { sendOtpCode } = await import("@/lib/otp.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = authUser?.user?.email;
    if (!email) throw new Error("Could not verify — no email on this account");

    if (!(await verifyPassword(email, data.currentPassword))) {
      throw new Error("Current password is incorrect");
    }

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const policy = policyForRoles((roleRows ?? []).map((r) => r.role as string));
    const result = validatePassword(data.newPassword, policy);
    if (!result.valid) throw new Error(result.errors[0] ?? "Password does not meet requirements");

    if (await verifyPassword(email, data.newPassword)) {
      throw new Error("New password must be different from your current password");
    }

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    return sendOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: "change_password",
      userAgent,
    });
  });

/**
 * Step 2 of the authenticated change-password flow: re-validates everything
 * (defense in depth — time has passed since step 1) and applies the change
 * on success. Does not sign out other sessions itself — the client does
 * that immediately after via `supabase.auth.signOut({ scope: "others" })`,
 * since only the calling session's own client can operate on its own
 * refresh-token family.
 */
export const confirmPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; newPassword: string }) =>
    z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/, "Enter the 6-digit code"),
        newPassword: z.string().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyOtpCode } = await import("@/lib/otp.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { securityAlertFields } = await import("@/lib/account.server");
    const { logAdminAction } = await import("@/lib/platform.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    await verifyOtpCode(supabaseAdmin, {
      userId: context.userId,
      purpose: "change_password",
      code: data.code,
    });

    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const policy = policyForRoles((roleRows ?? []).map((r) => r.role as string));
    const result = validatePassword(data.newPassword, policy);
    if (!result.valid) throw new Error(result.errors[0] ?? "Password does not meet requirements");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.newPassword,
    });
    if (error) throw new Error(sanitizeDbError(error));

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (authUser?.user?.email) {
      await sendTemplateEmail("account-change-notice", authUser.user.email, {
        templateData: { change: "password", ...securityAlertFields(userAgent) },
        idempotencyKey: `password-changed-${context.userId}-${Date.now()}`,
      }).catch(() => {});
    }
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "security.password_changed",
      "user",
      context.userId,
    );

    return { ok: true };
  });

/**
 * Sends the change-confirmation email for a phone number change. Called by
 * the client immediately after Supabase's native SMS-OTP phone-change flow
 * succeeds (`updateUser({phone})` + `verifyOtp({type:'phone_change'})`),
 * which has no server-side hook of its own to trigger this from.
 */
export const notifyPhoneChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { newPhone: string }) =>
    z.object({ newPhone: z.string().trim().min(8).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { securityAlertFields } = await import("@/lib/account.server");
    const { logAdminAction } = await import("@/lib/platform.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const userAgent = getRequest()?.headers.get("user-agent") ?? null;
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (authUser?.user?.email) {
      await sendTemplateEmail("account-change-notice", authUser.user.email, {
        templateData: {
          change: "phone",
          detail: `New phone: ${data.newPhone}`,
          ...securityAlertFields(userAgent),
        },
        idempotencyKey: `phone-changed-${context.userId}-${Date.now()}`,
      }).catch(() => {});
    }
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "security.phone_changed",
      "user",
      context.userId,
      {
        newPhone: data.newPhone,
      },
    );
    return { ok: true };
  });

/**
 * Creates a booking for a signed-out customer. Runs entirely server-side via
 * the service-role client — there is no anon INSERT policy on `bookings` by
 * design (a public write policy would let any browser insert arbitrary rows
 * with no server-side price/slot validation). Price/discount are recomputed
 * here from the service + promo code rather than trusted from the client.
 *
 * NOTE: requires the `customer_name`/`customer_phone`/`customer_email`
 * columns and the nullable `customer_id` added by the guest-checkout
 * migration — will fail until that migration has been applied.
 */
export const createGuestBooking = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      businessId: string;
      serviceId: string;
      staffId: string;
      slot: string;
      name: string;
      phone: string;
      email?: string;
      couponCode?: string;
    }) =>
      z
        .object({
          businessId: z.string().uuid(),
          serviceId: z.string().uuid(),
          staffId: z.string().uuid(),
          slot: z.string().min(1),
          name: z.string().trim().min(1).max(120),
          phone: z
            .string()
            .trim()
            .regex(/^\+[1-9]\d{7,14}$/, "Invalid phone"),
          email: z.string().trim().email().max(255).optional(),
          couponCode: z.string().trim().max(40).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `guest_booking:${ip}`, 5, 10);

    const { data: service, error: svcErr } = await supabaseAdmin
      .from("services")
      .select("id, price, discount_price, duration_minutes, is_active, business_id")
      .eq("id", data.serviceId)
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (svcErr) throw new Error(sanitizeDbError(svcErr));
    if (!service || !service.is_active) throw new Error("Service not found");

    let totalPrice = Number(service.discount_price ?? service.price);
    let originalPrice: number | null = null;
    let discountAmount = 0;
    let promotionId: string | null = null;

    if (data.couponCode) {
      const { data: rows, error } = await supabaseAdmin.rpc("check_promo_code", {
        _salon_id: data.businessId,
        _code: data.couponCode,
        _amount: totalPrice,
      });
      if (error) throw new Error(sanitizeDbError(error));
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.valid && row.promotion_id) {
        originalPrice = totalPrice;
        discountAmount = Number(row.discount);
        totalPrice = Number(row.final_price);
        promotionId = row.promotion_id;
      }
    }

    const { resolveMainBranchId } = await import("@/lib/branch.server");
    const branchId = await resolveMainBranchId(supabaseAdmin, data.businessId);

    const starts = new Date(data.slot);
    const ends = new Date(starts.getTime() + service.duration_minutes * 60_000);
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        customer_id: null,
        customer_name: data.name,
        customer_phone: data.phone,
        customer_email: data.email ?? null,
        business_id: data.businessId,
        branch_id: branchId,
        service_id: service.id,
        staff_id: data.staffId,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        total_price: totalPrice,
        original_price: originalPrice,
        discount_amount: discountAmount,
        promotion_id: promotionId,
      } as never)
      .select()
      .single();
    if (error) throw new Error(sanitizeDbError(error));
    return booking as { id: string };
  });

/**
 * Fires Supabase's `invite` auth email (routed through the branded template
 * pipeline in `src/routes/auth/email-hook.ts`) so a guest who booked with a
 * fresh email has a way to create their account. Must never block or roll
 * back an already-confirmed booking — callers should treat this as
 * fire-and-forget.
 */
export const sendGuestAccountInvite = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; fullName?: string }) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        fullName: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName ?? "", role: "client" },
    });
    if (error && !/registered|exists/i.test(error.message)) throw new Error(sanitizeDbError(error));
    return { ok: true };
  });

/**
 * Attaches any unclaimed guest bookings placed under the signed-in user's
 * email to their account. Safe to call on every login — a no-op when there's
 * nothing to claim. This is the "existing account, chose Log In" path; the
 * "brand-new account" path is covered by the DB trigger in the guest-
 * checkout migration instead, since signup doesn't always round-trip through
 * this app's own post-login code (magic link / OAuth can land elsewhere).
 */
export const claimGuestBookingsForCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let email = (context.claims as { email?: string } | undefined)?.email;
    if (!email) {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      if (error) throw new Error(sanitizeDbError(error));
      email = data.user?.email ?? undefined;
    }
    if (!email) return { claimed: 0 };

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({ customer_id: context.userId } as never)
      .is("customer_id", null)
      .ilike("customer_email", email)
      .select("id");
    if (error) throw new Error(sanitizeDbError(error));
    return { claimed: data?.length ?? 0 };
  });
