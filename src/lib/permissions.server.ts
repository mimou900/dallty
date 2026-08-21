import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;
type AuthedContext = { supabase: AnySupabase; userId: string; claims: { session_id?: string } };

/**
 * Project 11 RBAC layer — resolves against the has_permission()/has_branch_access() Postgres
 * functions added in the project11_rbac_foundation migration. These consult
 * business_memberships -> platform_roles -> role_permissions (Project 01 schema, seeded but
 * never consulted before this project — see the migration header for the full history).
 *
 * Deliberately separate from assertCanManageBusiness (business-crm.server.ts), which stays
 * exactly as-is and keeps gating the pre-existing owner/manager-only surfaces — this file is
 * for the new, more granular Project 11 surfaces (confirmation center, walk-ins, branch-scoped
 * views, payment actions) that need receptionist/confirmation_member/specialist/custom-role
 * awareness, not just "owner or manager, or not".
 */

/** True if the caller holds `permissionKey` for this business (optionally scoped to a branch). */
export async function hasPermission(
  context: AuthedContext,
  businessId: string,
  permissionKey: string,
  branchId?: string | null,
): Promise<boolean> {
  const { data, error } = await context.supabase.rpc("has_permission", {
    _user_id: context.userId,
    _business_id: businessId,
    _permission_key: permissionKey,
    _branch_id: branchId ?? undefined,
  });
  if (error) return false;
  return Boolean(data);
}

/** True if the caller can act on this branch at all (business-wide or assigned to it). */
export async function hasBranchAccess(
  context: AuthedContext,
  businessId: string,
  branchId: string,
): Promise<boolean> {
  const { data, error } = await context.supabase.rpc("has_branch_access", {
    _user_id: context.userId,
    _business_id: businessId,
    _branch_id: branchId,
  });
  if (error) return false;
  return Boolean(data);
}

/**
 * Throws unless the caller holds `permissionKey` for this business (optionally branch-scoped).
 * Does not bundle a platform-admin bypass or step-up check — callers that need those combine
 * this with assertCanManageBusiness/is_platform_admin the same way existing code already ORs
 * owns_business() with is_platform_admin() at the call site, not inside the shared helper.
 */
export async function assertHasPermission(
  context: AuthedContext,
  businessId: string,
  permissionKey: string,
  branchId?: string | null,
) {
  const ok = await hasPermission(context, businessId, permissionKey, branchId);
  if (!ok) {
    const { logSecurityEvent } = await import("@/lib/security-event.server");
    const { adminClient } = await import("@/lib/platform.server");
    await logSecurityEvent(await adminClient(), {
      actorId: context.userId,
      action: "security.permission_denied",
      targetType: "business",
      targetId: businessId,
      riskLevel: "medium",
      outcome: "denied",
      details: { permissionKey, branchId: branchId ?? null },
    });
    throw new Error(`Forbidden: missing permission ${permissionKey}`);
  }
}

/**
 * Resolves the caller's role/permission set for a business — used by server functions that
 * need to branch behavior by permission (e.g. a specialist only sees their own earnings)
 * rather than a hard allow/deny gate. Returns null if the caller has no owner/membership
 * relationship to the business at all.
 */
export async function myBusinessRole(
  context: AuthedContext,
  businessId: string,
): Promise<{
  roleKey: string;
  isOwnerColumn: boolean;
  branchId: string | null;
  permissions: Array<{ key: string; scope: string }>;
} | null> {
  const { data: business } = await context.supabase
    .from("businesses")
    .select("owner_id")
    .eq("id", businessId)
    .single();

  if (business?.owner_id === context.userId) {
    return { roleKey: "owner", isOwnerColumn: true, branchId: null, permissions: [] };
  }

  const { data: membership } = await context.supabase
    .from("business_memberships")
    .select("role_id, branch_id, platform_roles!inner(key)")
    .eq("business_id", businessId)
    .eq("user_id", context.userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!membership) return null;

  const { data: perms } = await context.supabase
    .from("role_permissions")
    .select("scope, permissions!inner(key)")
    .eq("role_id", membership.role_id);

  return {
    roleKey: (membership.platform_roles as unknown as { key: string }).key,
    isOwnerColumn: false,
    branchId: membership.branch_id,
    permissions: (perms ?? []).map((p) => ({
      key: (p.permissions as unknown as { key: string }).key,
      scope: p.scope,
    })),
  };
}
