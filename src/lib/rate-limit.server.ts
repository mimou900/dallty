import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/**
 * Best-effort client IP for rate-limiting unauthenticated endpoints. Deployment is
 * Cloudflare Workers (via Nitro) per the Master Architecture, so `cf-connecting-ip` is the
 * reliable signal; `x-forwarded-for`'s first hop is a fallback for other environments (e.g.
 * local dev). Never trust this for anything beyond throttling — it's attacker-influenceable
 * on `x-forwarded-for`, which is exactly why it's only ever used as a rate-limit bucket key,
 * never as an identity or authorization signal.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Throws a generic error if `bucket` has exceeded `maxHits` within `windowMinutes`.
 * Fails open (allows the request) if the rate-limit check itself errors — an outage in
 * this table must never take down signup/booking, only degrade its abuse protection.
 */
export async function assertRateLimit(
  supabaseAdmin: AnySupabase,
  bucket: string,
  maxHits: number,
  windowMinutes: number,
) {
  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    _bucket: bucket,
    _max_hits: maxHits,
    _window_minutes: windowMinutes,
  });
  if (error) {
    console.error(`[rate-limit] check failed for bucket "${bucket}":`, error.message);
    return;
  }
  if (!data) {
    const { logSecurityEvent } = await import("@/lib/security-event.server");
    await logSecurityEvent(supabaseAdmin, {
      actorId: null,
      action: "security.rate_limit_triggered",
      targetType: "rate_limit_bucket",
      riskLevel: "medium",
      outcome: "blocked",
      details: { bucket, maxHits, windowMinutes },
    });
    throw new Error("Too many requests — please try again in a few minutes");
  }
}
