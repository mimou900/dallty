import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

export type StaffContext = { staffId: string; businessId: string };

/** Resolves the signed-in account to their own staff row, or throws. */
export async function requireStaffRecord(
  supabase: AnySupabase,
  userId: string,
): Promise<StaffContext> {
  const { data, error } = await supabase
    .from("staff")
    .select("id, business_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No specialist profile is linked to your account");
  return { staffId: data.id, businessId: data.business_id };
}
