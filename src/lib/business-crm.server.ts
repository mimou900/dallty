import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/** Throws unless the caller owns the business (or is a platform admin). */
export async function assertCanManageBusiness(
  supabase: AnySupabase,
  userId: string,
  businessId: string,
) {
  const [{ data: owns }, { data: isAdmin }] = await Promise.all([
    // owns_business's parameter is still named _salon_id (see the
    // business-rename plan's Task 3 correction note — Postgres won't let
    // CREATE OR REPLACE rename it without a risky DROP+CREATE against 41
    // live policy dependencies).
    supabase.rpc("owns_business", { _user_id: userId, _salon_id: businessId }),
    supabase.rpc("is_platform_admin", { _user_id: userId }),
  ]);
  if (!owns && !isAdmin) throw new Error("Forbidden: you do not manage this business");
}
