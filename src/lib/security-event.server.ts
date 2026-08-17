import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;
export type RiskLevel = "low" | "medium" | "high" | "critical";

/**
 * Records a risk-scored security event. Reuses admin_audit_log (extended with
 * ip/risk_level/outcome in the security-foundation migration) rather than creating a
 * second audit system — see the Master Architecture's explicit instruction against that.
 * `actorId` may be null for pre-authentication events (failed login by email, rejected
 * signup, anonymous rate-limit trip).
 */
export async function logSecurityEvent(
  supabaseAdmin: AnySupabase,
  params: {
    actorId: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    businessId?: string | null;
    ip?: string | null;
    riskLevel?: RiskLevel;
    outcome?: string;
    details?: Record<string, unknown>;
  },
) {
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: params.actorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    business_id: params.businessId ?? null,
    ip: params.ip ?? null,
    risk_level: params.riskLevel ?? null,
    outcome: params.outcome ?? null,
    details: (params.details ?? {}) as never,
  } as never);
}
