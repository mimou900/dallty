import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/** Does this user's role require an OTP step-up on login, per the global + per-role policy? */
export async function isStepUpRequired(
  supabaseAdmin: AnySupabase,
  userId: string,
): Promise<boolean> {
  const { data: settings } = await supabaseAdmin
    .from("auth_settings")
    .select("otp_master_enabled")
    .eq("id", true)
    .single();
  if (!settings?.otp_master_enabled) return false;

  const { data: roleRows } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (roleRows ?? []).map((r) => r.role);
  if (!roles.length) return false;

  const { data: policies } = await supabaseAdmin
    .from("auth_role_policies")
    .select("otp_enabled")
    .in("role", roles);

  return (policies ?? []).some((p) => p.otp_enabled);
}

/**
 * Throws unless the caller's current session has completed OTP step-up (or their role
 * doesn't require it). This is the server-side backstop for what was previously only a
 * client-side redirect — see the migration comment on auth_step_up_sessions for context.
 * `sessionId` comes from the caller's JWT (`context.claims.session_id`, always present on a
 * Supabase Auth token) — never trust a client-supplied session identifier here.
 */
export async function assertStepUpComplete(
  supabaseAdmin: AnySupabase,
  userId: string,
  sessionId: string | undefined,
) {
  if (!(await isStepUpRequired(supabaseAdmin, userId))) return;

  if (!sessionId) {
    throw new Error("Security verification required — complete the OTP check at /verify-otp");
  }

  const { data } = await supabaseAdmin
    .from("auth_step_up_sessions")
    .select("session_id")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    throw new Error("Security verification required — complete the OTP check at /verify-otp");
  }
}
