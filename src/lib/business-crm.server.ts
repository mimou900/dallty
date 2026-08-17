import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;
type AuthedContext = { supabase: AnySupabase; userId: string; claims: { session_id?: string } };

/**
 * Throws unless the caller owns the business (or is a platform admin) AND (if their role
 * requires it) has completed OTP step-up for this session. This is the single ownership
 * check every business-scoped server function funnels through — see
 * staff-access.server.ts's assertManagesSalon, which delegates here rather than
 * duplicating the logic.
 */
export async function assertCanManageBusiness(context: AuthedContext, businessId: string) {
  const { supabase, userId } = context;
  const [{ data: owns }, { data: isAdmin }] = await Promise.all([
    // owns_business's parameter is still named _salon_id (see the
    // business-rename plan's Task 3 correction note — Postgres won't let
    // CREATE OR REPLACE rename it without a risky DROP+CREATE against 41
    // live policy dependencies).
    supabase.rpc("owns_business", { _user_id: userId, _salon_id: businessId }),
    supabase.rpc("is_platform_admin", { _user_id: userId }),
  ]);
  if (!owns && !isAdmin) {
    const { logSecurityEvent } = await import("@/lib/security-event.server");
    const { adminClient } = await import("@/lib/platform.server");
    await logSecurityEvent(await adminClient(), {
      actorId: userId,
      action: "security.bola_attempt",
      targetType: "business",
      targetId: businessId,
      riskLevel: "high",
      outcome: "denied",
    });
    throw new Error("Forbidden: you do not manage this business");
  }

  const { assertStepUpComplete } = await import("@/lib/step-up.server");
  const { adminClient } = await import("@/lib/platform.server");
  await assertStepUpComplete(await adminClient(), userId, context.claims.session_id);
}
