import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { policyForRoles, validatePassword, type PasswordPolicyId } from "@/lib/password-policy";

/**
 * Permanently deletes the signed-in user's auth account.
 * Profile, bookings and related rows cascade or are cleaned by the database.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
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
  .handler(async ({ data }) => validatePassword(data.password, data.accountType));

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
    if (error) throw new Error(error.message);
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
    const target = data.email.toLowerCase();
    for (let page = 1; page <= 10; page++) {
      const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(error.message);
      const users = list?.users ?? [];
      if (users.some((u) => u.email?.toLowerCase() === target)) return { exists: true };
      if (users.length < 200) break;
    }
    return { exists: false };
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
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { exists: Boolean(row) };
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
      salonId: string;
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
          salonId: z.string().uuid(),
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

    const { data: service, error: svcErr } = await supabaseAdmin
      .from("services")
      .select("id, price, discount_price, duration_minutes, is_active, salon_id")
      .eq("id", data.serviceId)
      .eq("salon_id", data.salonId)
      .maybeSingle();
    if (svcErr) throw new Error(svcErr.message);
    if (!service || !service.is_active) throw new Error("Service not found");

    let totalPrice = Number(service.discount_price ?? service.price);
    let originalPrice: number | null = null;
    let discountAmount = 0;
    let promotionId: string | null = null;

    if (data.couponCode) {
      const { data: rows, error } = await supabaseAdmin.rpc("check_promo_code", {
        _salon_id: data.salonId,
        _code: data.couponCode,
        _amount: totalPrice,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row?.valid && row.promotion_id) {
        originalPrice = totalPrice;
        discountAmount = Number(row.discount);
        totalPrice = Number(row.final_price);
        promotionId = row.promotion_id;
      }
    }

    const starts = new Date(data.slot);
    const ends = new Date(starts.getTime() + service.duration_minutes * 60_000);
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        customer_id: null,
        customer_name: data.name,
        customer_phone: data.phone,
        customer_email: data.email ?? null,
        salon_id: data.salonId,
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
    if (error) throw new Error(error.message);
    return booking as { id: string };
  });

/**
 * Fires Supabase's `invite` auth email (routed through the branded template
 * pipeline in `src/routes/lovable/email/auth/webhook.ts`) so a guest who
 * booked with a fresh email has a way to create their account. Must never
 * block or roll back an already-confirmed booking — callers should treat
 * this as fire-and-forget.
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
    if (error && !/registered|exists/i.test(error.message)) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
      email = data.user?.email ?? undefined;
    }
    if (!email) return { claimed: 0 };

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .update({ customer_id: context.userId } as never)
      .is("customer_id", null)
      .ilike("customer_email", email)
      .select("id");
    if (error) throw new Error(error.message);
    return { claimed: data?.length ?? 0 };
  });
