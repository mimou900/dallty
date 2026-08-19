import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";

/**
 * Project 11: business_memberships CRUD (owner/manager/receptionist/confirmation_member/
 * specialist/custom roles) — the governance-role counterpart to staff-access.functions.ts's
 * specialist (service-delivery) invite flow. Deliberately a separate table/flow per the
 * Master Architecture §5: staff = service-delivery profile, business_memberships =
 * dashboard-access role. A person can hold both (e.g. an owner who's also a specialist).
 */

const SYSTEM_ROLE_KEYS = [
  "owner",
  "manager",
  "receptionist",
  "confirmation_member",
  "specialist",
] as const;

/** Owner/manager view: every active/invited membership for a business, plus its role name. */
export const listBusinessMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("business_memberships")
      .select(
        "id, user_id, role_id, branch_id, is_primary_owner, status, invited_at, accepted_at, platform_roles!inner(key, name), business_branches(name)",
      )
      .eq("business_id", data.businessId)
      .is("deleted_at", null)
      .order("created_at");
    if (error) throw new Error(sanitizeDbError(error));

    const emails = new Map<string, string>();
    for (const r of rows ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      if (u?.user?.email) emails.set(r.user_id, u.user.email);
    }

    return (rows ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      email: emails.get(r.user_id) ?? null,
      roleKey: (r.platform_roles as unknown as { key: string; name: string }).key,
      roleName: (r.platform_roles as unknown as { key: string; name: string }).name,
      branchId: r.branch_id,
      branchName: (r.business_branches as unknown as { name: string } | null)?.name ?? null,
      isPrimaryOwner: r.is_primary_owner,
      status: r.status,
      invitedAt: r.invited_at,
      acceptedAt: r.accepted_at,
    }));
  });

/** Every role a business can assign: the 5 assignable system roles + its own custom roles. */
export const listAssignableRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("platform_roles")
      .select("id, key, name, is_system")
      .or(`business_id.is.null,business_id.eq.${data.businessId}`)
      .in("key", [...SYSTEM_ROLE_KEYS])
      .order("is_system", { ascending: false });
    if (error) throw new Error(sanitizeDbError(error));

    // Business-defined custom roles (key not in the fixed system set).
    const { data: custom, error: customError } = await supabaseAdmin
      .from("platform_roles")
      .select("id, key, name, is_system")
      .eq("business_id", data.businessId);
    if (customError) throw new Error(sanitizeDbError(customError));

    const systemRows = (rows ?? []).filter((r) => SYSTEM_ROLE_KEYS.includes(r.key as never));
    const customRows = (custom ?? []).filter((r) => !r.is_system);
    return [...systemRows, ...customRows].map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isSystem: r.is_system,
    }));
  });

/** The full permission catalog (Super-Admin-controlled) — what a custom role can be built from. */
export const listPermissionCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("permissions")
      .select("id, key, description")
      .order("key");
    if (error) throw new Error(sanitizeDbError(error));
    return rows ?? [];
  });

/** Owner/manager creates a business-scoped custom role, initially with no permissions. */
export const createCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        key: z.string().trim().min(2).max(40),
        name: z.string().trim().min(2).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const key = data.key.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (SYSTEM_ROLE_KEYS.includes(key as never)) {
      throw new Error("That role name is reserved — choose a different one");
    }
    const { data: role, error } = await supabaseAdmin
      .from("platform_roles")
      .insert({ business_id: data.businessId, key, name: data.name, is_system: false })
      .select("id, key, name")
      .single();
    if (error) throw new Error(sanitizeDbError(error));
    return role;
  });

/**
 * Owner/manager sets a custom role's permission grants (full replace) — every key must exist
 * in the global permissions catalog (Super-Admin-controlled per the catalog table's own RLS:
 * only super_admin can INSERT a new permissions row), so a business can only compose from
 * permissions Super Admin has made available, never invent a new one.
 */
export const setCustomRolePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        roleId: z.string().uuid(),
        grants: z.array(
          z.object({
            permissionKey: z.string(),
            scope: z.enum(["business", "branch", "self"]),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: role, error: roleError } = await supabaseAdmin
      .from("platform_roles")
      .select("id, business_id, is_system")
      .eq("id", data.roleId)
      .single();
    if (roleError) throw new Error(sanitizeDbError(roleError));
    if (role.is_system || role.business_id !== data.businessId) {
      throw new Error("Only this business's own custom roles can be edited");
    }

    const { data: perms, error: permsError } = await supabaseAdmin
      .from("permissions")
      .select("id, key")
      .in(
        "key",
        data.grants.map((g) => g.permissionKey),
      );
    if (permsError) throw new Error(sanitizeDbError(permsError));
    const byKey = new Map((perms ?? []).map((p) => [p.key, p.id]));
    const missing = data.grants.filter((g) => !byKey.has(g.permissionKey));
    if (missing.length > 0) {
      throw new Error(
        `Unknown permission key(s): ${missing.map((g) => g.permissionKey).join(", ")}`,
      );
    }

    await supabaseAdmin.from("role_permissions").delete().eq("role_id", data.roleId);
    if (data.grants.length > 0) {
      const { error: insertError } = await supabaseAdmin.from("role_permissions").insert(
        data.grants.map((g) => ({
          role_id: data.roleId,
          permission_id: byKey.get(g.permissionKey)!,
          scope: g.scope,
        })),
      );
      if (insertError) throw new Error(sanitizeDbError(insertError));
    }
    return { ok: true };
  });

/**
 * Invites someone into a business's governance roles (owner/manager/receptionist/
 * confirmation_member/specialist-as-membership/custom). Creates or reuses their auth
 * account, grants the global `business_owner` app_role so the dashboard shell renders the
 * full admin nav for them (real per-page authorization stays scoped by business_memberships
 * + has_permission(), never by this global flag — same "hasRole() is UI/routing only"
 * convention documented in DALLTY_AI_IMPLEMENTATION_RULES.md), then emails a password-setup
 * link via the existing staff-invite template.
 */
export const inviteBusinessMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        email: z.string().email(),
        fullName: z.string().trim().min(1).max(100),
        roleId: z.string().uuid(),
        branchId: z.string().uuid().optional(),
        origin: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureStaffAuthUser, passwordLink, safeOrigin } =
      await import("@/lib/staff-access.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

    const { data: role, error: roleError } = await supabaseAdmin
      .from("platform_roles")
      .select("id, key, business_id")
      .eq("id", data.roleId)
      .single();
    if (roleError) throw new Error(sanitizeDbError(roleError));
    if (role.business_id !== null && role.business_id !== data.businessId) {
      throw new Error("That role does not belong to this business");
    }

    if (data.branchId) {
      const { data: branch } = await supabaseAdmin
        .from("business_branches")
        .select("id")
        .eq("id", data.branchId)
        .eq("business_id", data.businessId)
        .maybeSingle();
      if (!branch) throw new Error("That branch does not belong to this business");
    }

    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("name")
      .eq("id", data.businessId)
      .single();

    const email = data.email.trim().toLowerCase();
    const { userId } = await ensureStaffAuthUser(supabaseAdmin, email, data.fullName);

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "business_owner" }, { onConflict: "user_id,role" });

    const { error: membershipError } = await supabaseAdmin.from("business_memberships").upsert(
      {
        business_id: data.businessId,
        user_id: userId,
        role_id: role.id,
        branch_id: data.branchId ?? null,
        status: "invited",
        invited_by: context.userId,
        invited_at: new Date().toISOString(),
        deleted_at: null,
      },
      { onConflict: "business_id,user_id" },
    );
    if (membershipError) throw new Error(sanitizeDbError(membershipError));

    const url = await passwordLink(supabaseAdmin, email, safeOrigin(data.origin));
    const result = await sendTemplateEmail("staff-invite", email, {
      templateData: {
        staffName: data.fullName,
        salonName: business?.name ?? "Your business",
        actionUrl: url,
        mode: "invite",
      },
      idempotencyKey: `member-invite-${data.businessId}-${userId}-${Date.now()}`,
    });

    return { sent: result.sent, email };
  });

/** Owner/manager changes an existing member's role and/or branch scope. */
export const updateBusinessMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        membershipId: z.string().uuid(),
        roleId: z.string().uuid(),
        branchId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: membership, error } = await supabaseAdmin
      .from("business_memberships")
      .select("id, business_id, is_primary_owner")
      .eq("id", data.membershipId)
      .single();
    if (error) throw new Error(sanitizeDbError(error));
    if (membership.business_id !== data.businessId) throw new Error("Membership not found");
    if (membership.is_primary_owner) {
      throw new Error("The primary owner's role cannot be changed here");
    }

    const { error: updateError } = await supabaseAdmin
      .from("business_memberships")
      .update({ role_id: data.roleId, branch_id: data.branchId ?? null })
      .eq("id", data.membershipId);
    if (updateError) throw new Error(sanitizeDbError(updateError));
    return { ok: true };
  });

/** Owner/manager removes a member's access (soft delete — never the primary owner). */
export const removeBusinessMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: z.string().uuid(), membershipId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context, data.businessId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: membership, error } = await supabaseAdmin
      .from("business_memberships")
      .select("id, business_id, is_primary_owner")
      .eq("id", data.membershipId)
      .single();
    if (error) throw new Error(sanitizeDbError(error));
    if (membership.business_id !== data.businessId) throw new Error("Membership not found");
    if (membership.is_primary_owner) {
      throw new Error("The primary owner cannot be removed");
    }

    const { error: updateError } = await supabaseAdmin
      .from("business_memberships")
      .update({ status: "removed", deleted_at: new Date().toISOString() })
      .eq("id", data.membershipId);
    if (updateError) throw new Error(sanitizeDbError(updateError));
    return { ok: true };
  });
