/**
 * Sanitizes a raw Supabase/Postgres error before it leaves the server boundary.
 *
 * Found in the Project 03 security audit: the dominant pattern across this codebase's
 * server functions is `throw new Error(error.message)`, and TanStack Start's server-function
 * RPC layer serializes thrown errors straight back to the client by design — meaning a raw
 * Postgres error (which can reveal table/column/constraint names, e.g. the confirmed example
 * `duplicate key value violates unique constraint "profiles_phone_unique"`) reaches the
 * browser verbatim. The existing `src/lib/friendly-error.ts` only cleans this up on the
 * *client* side, in exactly 2 of the many call sites, and even there falls back to returning
 * the raw message unfiltered for anything under 140 characters.
 *
 * This stops the leak at the source instead: known-safe patterns get a real, helpful message
 * (mirroring friendly-error.ts's own mappings so the two stay consistent); everything else
 * gets a generic fallback, with the real error logged server-side only — matching exactly how
 * `errorMiddleware` in src/start.ts already handles unhandled SSR crashes, just applied here
 * to server-function errors too, which that middleware doesn't reach (see src/server.ts's
 * CSP-testing session notes for why: the RPC layer's own error serialization runs first).
 *
 * Applied across every server-function file in this project that previously threw a raw
 * Supabase/Postgres error back to the caller (customer/business/staff-facing surfaces and
 * Super-Admin-only ones alike) — see the Security & Anti-Fraud Foundation project's sweep
 * for the full file list. New server functions should use this from the start rather than
 * `throw error`/`throw new Error(error.message)`.
 */
export function sanitizeDbError(
  error: { message: string },
  fallback = "Something went wrong. Please try again.",
): string {
  const raw = error.message;
  console.error("[db-error]", raw);

  if (/profiles_phone_unique/i.test(raw)) {
    return "This phone number is already registered to another account.";
  }
  if (/already registered|already been registered|user already exists/i.test(raw)) {
    return "This email is already registered.";
  }
  if (/rate limit|too many/i.test(raw)) {
    return "Too many attempts — please wait a minute and try again.";
  }
  if (/business not found/i.test(raw)) {
    return "Business not found.";
  }
  if (/forbidden|not manage this business|super admin only/i.test(raw)) {
    return raw; // authorization messages are intentionally specific, not a schema leak
  }

  return fallback;
}
