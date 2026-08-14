import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

const ALLOWED_HOSTS = ["dallty.com", "www.dallty.com", "localhost", "127.0.0.1"];

/** Only allow password links pointing back at our own origins. */
export function safeOrigin(origin: string | null | undefined): string {
  const fallback = "https://dallty.com";
  if (!origin) return fallback;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    const ok = ALLOWED_HOSTS.includes(host) || host.endsWith(".lovable.app");
    return ok ? url.origin : fallback;
  } catch {
    return fallback;
  }
}

/** Creates (or reuses) an auth account for a staff email and returns its user id. */
export async function ensureStaffAuthUser(
  admin: any,
  email: string,
  fullName: string,
): Promise<{ userId: string; created: boolean }> {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "specialist" },
  });
  if (!error && created?.user) return { userId: created.user.id as string, created: true };

  // Already registered — find the existing account by email.
  const message = error?.message ?? "";
  if (!/registered|exists/i.test(message)) throw new Error(message || "Could not create account");

  for (let page = 1; page <= 10; page++) {
    const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listError) throw new Error(listError.message);
    const users = data?.users ?? [];
    const match = users.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return { userId: match.id as string, created: false };
    if (users.length < 200) break;
  }
  throw new Error("An account already uses that email but it could not be located");
}

/** Generates a password-setup / recovery link for an email. */
export async function passwordLink(admin: any, email: string, origin: string) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/reset-password` },
  });
  if (error) throw new Error(error.message);
  const link = data?.properties?.action_link as string | undefined;
  if (!link) throw new Error("Could not generate a password link");
  return link;
}

/** Throws unless the caller owns the business (or is a platform admin). */
export async function assertManagesSalon(supabase: AnySupabase, userId: string, businessId: string) {
  const [{ data: owns }, { data: isAdmin }] = await Promise.all([
    // owns_business's parameter is still named _salon_id (see the
    // business-rename plan's Task 3 correction note).
    supabase.rpc("owns_business", { _user_id: userId, _salon_id: businessId }),
    supabase.rpc("is_platform_admin", { _user_id: userId }),
  ]);
  if (!owns && !isAdmin) throw new Error("Forbidden: you do not manage this business");
}
