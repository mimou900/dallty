import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/**
 * Resolves a business's main branch id. Every business always has exactly one (auto-created
 * by the `businesses_create_main_branch` trigger on insert — see
 * 20260818020000_branch_aware_schema_foundation.sql), so this should never return null for a
 * real business id.
 *
 * Minimal placeholder used by call sites not yet rewired onto real branch selection (Project
 * 09 Phase 2/3/6 will replace these call sites with actual branch-aware resolution — this
 * function exists only so the not-yet-rewired ones keep working correctly in the meantime,
 * rather than leaving `branch_id` unset).
 */
export async function resolveMainBranchId(
  supabaseAdmin: AnySupabase,
  businessId: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("business_branches")
    .select("id")
    .eq("business_id", businessId)
    .eq("is_main", true)
    .single();
  if (error || !data) throw new Error("BRANCH_NOT_FOUND");
  return data.id;
}

/** Resolves a staff member's primary branch, falling back to their business's main branch. */
export async function resolveStaffPrimaryBranchId(
  supabaseAdmin: AnySupabase,
  staffId: string,
  businessId: string,
): Promise<string> {
  const { data } = await supabaseAdmin
    .from("staff_branches")
    .select("branch_id")
    .eq("staff_id", staffId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data?.branch_id) return data.branch_id;
  return resolveMainBranchId(supabaseAdmin, businessId);
}
