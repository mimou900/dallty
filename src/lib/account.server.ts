import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/** Does any account already use this email? Shared by signup and change-email duplicate checks. */
export async function emailExists(supabaseAdmin: AnySupabase, email: string): Promise<boolean> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = list?.users ?? [];
    if (users.some((u) => u.email?.toLowerCase() === target)) return true;
    if (users.length < 200) break;
  }
  return false;
}

/**
 * Checks a password against an account's email using a throwaway,
 * non-persisting client — never the shared singleton, which would race
 * under concurrent requests since Supabase JS keeps the session it just
 * signed in with on the client instance itself.
 */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}
