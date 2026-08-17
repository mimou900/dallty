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
    const ok = ALLOWED_HOSTS.includes(host);
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

/**
 * Throws unless the caller owns the business (or is a platform admin) and has completed
 * OTP step-up where required. Delegates to assertCanManageBusiness (business-crm.server.ts)
 * instead of duplicating the same ownership + step-up check a second time — flagged as
 * duplication in the Project 00 audit, consolidated here in Project 02.
 */
export async function assertManagesSalon(
  context: { supabase: AnySupabase; userId: string; claims: { session_id?: string } },
  businessId: string,
) {
  const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
  await assertCanManageBusiness(context, businessId);
}
