import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

/**
 * After sign-up, guarantee the user is authenticated.
 * Supabase returns a session directly when email auto-confirm is on; if it
 * doesn't (edge cases, race on confirmation), we immediately sign in with the
 * same credentials so the user never has to log in again manually.
 */
export async function ensureSessionAfterSignUp(
  email: string,
  password: string,
  existing?: Session | null,
): Promise<Session | null> {
  if (existing) return existing;
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: signedIn } = await supabase.auth.signInWithPassword({ email, password });
  return signedIn.session ?? null;
}
