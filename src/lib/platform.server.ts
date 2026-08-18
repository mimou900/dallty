import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { sanitizeDbError } from "@/lib/db-error.server";

type AnySupabase = SupabaseClient<Database>;
type AuthedContext = { supabase: AnySupabase; userId: string; claims: { session_id?: string } };

/**
 * Throws unless the caller holds the platform-level super_admin role AND (if their role
 * requires it) has completed OTP step-up for this session. Super Admin is the highest-risk
 * role in the platform, so this is where step-up enforcement matters most — see
 * step-up.server.ts and the auth_step_up_sessions migration for why a client-side redirect
 * alone wasn't sufficient.
 */
export async function assertSuperAdmin(context: AuthedContext) {
  const { data, error } = await context.supabase.rpc("is_super_admin", {
    _user_id: context.userId,
  });
  if (error) throw new Error(sanitizeDbError(error));
  if (!data) {
    const { logSecurityEvent } = await import("@/lib/security-event.server");
    await logSecurityEvent(await adminClient(), {
      actorId: context.userId,
      action: "security.permission_denied",
      targetType: "super_admin_action",
      riskLevel: "high",
      outcome: "denied",
    });
    throw new Error("Forbidden: Super Admin only");
  }

  const { assertStepUpComplete } = await import("@/lib/step-up.server");
  await assertStepUpComplete(await adminClient(), context.userId, context.claims.session_id);
}

export async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnySupabase;
}

export async function logAdminAction(
  supabase: AnySupabase,
  actorId: string,
  action: string,
  targetType: string,
  targetId?: string | null,
  details: Record<string, unknown> = {},
) {
  await supabase.from("admin_audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    details: details as never,
  });
}
