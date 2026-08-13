import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

export type StaffContext = { staffId: string; salonId: string };

/** Resolves the signed-in account to their own staff row, or throws. */
export async function requireStaffRecord(
  supabase: AnySupabase,
  userId: string,
): Promise<StaffContext> {
  const { data, error } = await supabase
    .from("staff")
    .select("id, salon_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No specialist profile is linked to your account");
  return { staffId: data.id, salonId: data.salon_id };
}
