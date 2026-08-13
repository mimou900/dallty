import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const userIdInput = z.object({ userId: z.string().uuid() });

/** Lists every auth user with their roles. Super Admin only. */
export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Error(error.message);

    const ids = data.users.map((u) => u.id);
    const [{ data: roles }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", ids),
    ]);

    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      phone: u.phone ?? "",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      emailConfirmed: Boolean(u.email_confirmed_at),
      suspended: Boolean(
        (u as unknown as { banned_until?: string | null }).banned_until &&
        new Date((u as unknown as { banned_until: string }).banned_until) > new Date(),
      ),
      fullName: profiles?.find((p) => p.id === u.id)?.full_name ?? "",
      roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as string),
    }));
  });

/** Suspends or restores a user account. Super Admin only. */
export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; suspended: boolean }) =>
    userIdInput.extend({ suspended: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot suspend your own account");
    const supabaseAdmin = await adminClient();

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.suspended ? "876000h" : "none",
    });
    if (error) throw new Error(error.message);
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      data.suspended ? "user.suspend" : "user.restore",
      "user",
      data.userId,
    );
    return { ok: true };
  });

/** Marks a user's email as verified. Super Admin only. */
export const verifyPlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => userIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await logAdminAction(supabaseAdmin, context.userId, "user.verify", "user", data.userId);
    return { ok: true };
  });

/** Permanently deletes a user account. Super Admin only. */
export const deletePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => userIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const supabaseAdmin = await adminClient();

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await logAdminAction(supabaseAdmin, context.userId, "user.delete", "user", data.userId);
    return { ok: true };
  });

const statusInput = z.object({
  salonId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "suspended"]),
  note: z.string().trim().max(500).optional(),
});

/** Lists every registered business with owner details. Super Admin only. */
export const listPlatformBusinesses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { data, error } = await supabaseAdmin
      .from("salons")
      .select(
        "id, name, status, plan, city, country, business_email, business_phone, employee_count, branch_count, trial_ends_at, created_at, owner_id",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const ownerIds = [...new Set((data ?? []).map((s) => s.owner_id).filter(Boolean))] as string[];
    const { data: owners } = ownerIds.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", ownerIds)
      : { data: [] as { id: string; full_name: string; phone: string | null }[] };

    return (data ?? []).map((s) => ({
      ...s,
      ownerName: owners?.find((o) => o.id === s.owner_id)?.full_name ?? "—",
      ownerPhone: owners?.find((o) => o.id === s.owner_id)?.phone ?? "",
    }));
  });

/** Approves, rejects or suspends a business. Super Admin only. */
export const setBusinessStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { salonId: string; status: string; note?: string }) =>
    statusInput.parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { data: salon, error } = await supabaseAdmin
      .from("salons")
      .update({
        status: data.status,
        is_active: data.status === "approved",
        marketplace_status:
          data.status === "approved"
            ? "approved"
            : data.status === "rejected"
              ? "rejected"
              : data.status === "suspended"
                ? "hidden"
                : "pending_review",
        marketplace_note: data.note ?? null,
      })
      .eq("id", data.salonId)
      .select("id, name, business_email, owner_id")
      .single();
    if (error) throw new Error(error.message);

    let ownerName: string | undefined;
    let ownerEmail = salon?.business_email ?? null;
    if (salon?.owner_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", salon.owner_id)
        .maybeSingle();
      ownerName = profile?.full_name || undefined;
      if (!ownerEmail) {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(salon.owner_id);
        ownerEmail = authUser?.user?.email ?? null;
      }
    }

    const { notifyBusinessStatus } = await import("@/lib/business-status-email.server");
    await notifyBusinessStatus({
      to: ownerEmail,
      businessName: salon?.name ?? "Your business",
      ownerName,
      status: data.status,
      note: data.note,
      salonId: data.salonId,
    });

    await logAdminAction(
      supabaseAdmin,
      context.userId,
      `business.${data.status}`,
      "salon",
      data.salonId,
      {
        note: data.note ?? "",
      },
    );
    return { ok: true };
  });

/** Global marketplace data across every shop. Super Admin only. */
export const platformOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const [salons, services, staff, bookings, reviews, users] = await Promise.all([
      supabaseAdmin
        .from("salons")
        .select(
          "id, name, city, country, status, plan, is_listed, is_active, rating, review_count, created_at",
        ),
      supabaseAdmin.from("services").select("id, salon_id, is_active, price, discount_price"),
      supabaseAdmin.from("staff").select("id, salon_id, is_active"),
      supabaseAdmin
        .from("bookings")
        .select("id, salon_id, status, total_price, starts_at, customer_id")
        .order("starts_at", { ascending: false })
        .limit(5000),
      supabaseAdmin.from("reviews").select("id, salon_id, rating, is_hidden"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);

    const rows = (salons.data ?? []).map((s) => {
      const shopBookings = (bookings.data ?? []).filter((b) => b.salon_id === s.id);
      const completed = shopBookings.filter((b) => b.status === "completed");
      return {
        id: s.id,
        name: s.name,
        city: s.city,
        country: s.country,
        status: s.status,
        plan: s.plan,
        isListed: Boolean(s.is_listed),
        rating: Number(s.rating ?? 0),
        reviewCount: s.review_count ?? 0,
        services: (services.data ?? []).filter((v) => v.salon_id === s.id && v.is_active).length,
        staff: (staff.data ?? []).filter((v) => v.salon_id === s.id && v.is_active).length,
        bookings: shopBookings.length,
        cancelled: shopBookings.filter((b) => b.status === "cancelled").length,
        customers: new Set(shopBookings.map((b) => b.customer_id)).size,
        revenue: completed.reduce((sum, b) => sum + Number(b.total_price ?? 0), 0),
        createdAt: s.created_at,
      };
    });

    const roleCounts = (users.data ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.role as string] = (acc[r.role as string] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totals: {
        shops: rows.length,
        listedShops: rows.filter((r) => r.isListed && r.status === "approved").length,
        pendingShops: rows.filter((r) => r.status === "pending").length,
        services: (services.data ?? []).length,
        staff: (staff.data ?? []).length,
        bookings: (bookings.data ?? []).length,
        customers: new Set((bookings.data ?? []).map((b) => b.customer_id)).size,
        revenue: rows.reduce((sum, r) => sum + r.revenue, 0),
        reviews: (reviews.data ?? []).filter((r) => !r.is_hidden).length,
        accounts: new Set((users.data ?? []).map((u) => u.user_id)).size,
      },
      roleCounts,
      shops: rows.sort((a, b) => b.revenue - a.revenue),
    };
  });

/** Reads the global OTP settings singleton. Super Admin only. */
export const getAuthSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { data, error } = await supabaseAdmin
      .from("auth_settings")
      .select(
        "otp_master_enabled, otp_expiry_minutes, otp_resend_cooldown_seconds, otp_max_attempts",
      )
      .eq("id", true)
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

const authSettingsInput = z.object({
  otpMasterEnabled: z.boolean(),
  otpExpiryMinutes: z.number().int().min(1).max(60),
  otpResendCooldownSeconds: z.number().int().min(10).max(600),
  otpMaxAttempts: z.number().int().min(1).max(20),
});

/** Updates the global OTP settings singleton. Super Admin only. */
export const updateAuthSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof authSettingsInput>) => authSettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { error } = await supabaseAdmin
      .from("auth_settings")
      .update({
        otp_master_enabled: data.otpMasterEnabled,
        otp_expiry_minutes: data.otpExpiryMinutes,
        otp_resend_cooldown_seconds: data.otpResendCooldownSeconds,
        otp_max_attempts: data.otpMaxAttempts,
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    await logAdminAction(supabaseAdmin, context.userId, "auth_settings.update", "auth_settings");
    return { ok: true };
  });

/** Lists the per-role login OTP policy. Super Admin only. */
export const getAuthRolePolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { data, error } = await supabaseAdmin
      .from("auth_role_policies")
      .select("role, otp_enabled, is_locked")
      .order("role");
    if (error) throw new Error(error.message);
    return data;
  });

const authRolePolicyInput = z.object({
  role: z.enum(["client", "specialist", "salon_owner", "admin", "super_admin"]),
  otpEnabled: z.boolean(),
});

/** Toggles one role's login OTP requirement. Locked roles reject the change. Super Admin only. */
export const updateAuthRolePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof authRolePolicyInput>) => authRolePolicyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { data: existing, error: readError } = await supabaseAdmin
      .from("auth_role_policies")
      .select("is_locked")
      .eq("role", data.role)
      .single();
    if (readError) throw new Error(readError.message);
    if (existing.is_locked) throw new Error(`${data.role} requires OTP and cannot be changed`);

    const { error } = await supabaseAdmin
      .from("auth_role_policies")
      .update({ otp_enabled: data.otpEnabled })
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      data.otpEnabled ? "auth_role_policy.enable" : "auth_role_policy.disable",
      "auth_role_policies",
      null,
      { role: data.role },
    );
    return { ok: true };
  });

/** Paginated directory of every shop, specialist, service or appointment. */
export const platformDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        entity: z.enum(["shops", "staff", "services", "appointments"]),
        q: z.string().max(80).default(""),
        status: z.string().max(20).default(""),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(5).max(100).default(25),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    const { fetchDirectory } = await import("@/lib/platform-directory.server");
    return fetchDirectory(context.supabase, context.userId, data);
  });
