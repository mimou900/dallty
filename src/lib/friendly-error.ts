/** Turns raw backend/auth/Postgres errors into something a user can act on. */
export function friendlyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  // Server-side zod failures arrive as a JSON array of issues — surface the field.
  if (raw.trim().startsWith("[")) {
    try {
      const issues = JSON.parse(raw) as Array<{ message?: string; path?: (string | number)[] }>;
      const first = issues[0];
      if (first?.message) {
        const field = (first.path ?? []).filter((p) => typeof p === "string").pop();
        return field ? `${String(field)}: ${first.message}` : first.message;
      }
    } catch {
      /* fall through */
    }
  }
  const message = raw.toLowerCase();
  if (message.includes("already registered") || message.includes("already been registered"))
    return "This email is already registered. Sign in instead.";
  if (message.includes("user already exists")) return "This email is already registered.";
  if (message.includes("profiles_phone_unique") || message.includes("duplicate key value violates unique constraint \"profiles_phone_unique\""))
    return "This phone number is already registered to another account.";
  if (message.includes("rate limit") || message.includes("too many"))
    return "Too many attempts — please wait a minute and try again.";
  if (message.includes("invalid login credentials"))
    return "This email is already registered with a different password.";
  if (message.includes("password")) return raw;
  if (message.includes("already has a business")) return raw;
  if (message.includes("network") || message.includes("fetch"))
    return "Connection problem — please check your internet and try again.";
  return raw && raw.length < 140 ? raw : fallback;
}
