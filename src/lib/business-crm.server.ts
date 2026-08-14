import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/** Throws unless the caller owns the salon (or is a platform admin). */
export async function assertCanManageSalon(
  supabase: AnySupabase,
  userId: string,
  salonId: string,
) {
  const [{ data: owns }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("owns_salon", { _user_id: userId, _salon_id: salonId }),
    supabase.rpc("is_platform_admin", { _user_id: userId }),
  ]);
  if (!owns && !isAdmin) throw new Error("Forbidden: you do not manage this business");
}
