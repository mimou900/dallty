import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;
export type BotChallengeLevel = "NO_CHALLENGE" | "RISK_CHALLENGE" | "REQUIRED_CHALLENGE";

/**
 * Provider-agnostic bot-challenge resolver. No CAPTCHA provider (Turnstile/hCaptcha) is
 * configured in this environment — `platform_security_settings.bot_challenge_provider`
 * defaults to `'none'`, so nothing in this codebase currently blocks a user on the result
 * of this function; it's consumed today only for risk-scored security-event logging (see
 * callers), ready to gate an actual challenge widget the moment a provider is enabled.
 *
 * Deterministic rule (per the Master Architecture: "do not build an AI fraud model, use
 * deterministic rules initially"), not a fabricated score: risk is the percentage of a
 * rate-limit bucket's budget already consumed within its window — a real, already-collected
 * signal (`rate_limit_hits`), not an invented one. A caller close to being throttled is
 * exactly the caller worth challenging before they hit the hard block.
 */
export async function resolveBotChallengeLevel(
  supabaseAdmin: AnySupabase,
  params: { bucket: string; maxHits: number; windowMinutes: number },
): Promise<BotChallengeLevel> {
  const { data: settings } = await supabaseAdmin
    .from("platform_security_settings")
    .select("risk_challenge_threshold, required_challenge_threshold")
    .eq("id", true)
    .single();
  const riskThreshold = settings?.risk_challenge_threshold ?? 60;
  const requiredThreshold = settings?.required_challenge_threshold ?? 90;

  const since = new Date(Date.now() - params.windowMinutes * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("rate_limit_hits")
    .select("*", { count: "exact", head: true })
    .eq("bucket", params.bucket)
    .gte("created_at", since);

  const usedPercent = ((count ?? 0) / params.maxHits) * 100;

  if (usedPercent >= requiredThreshold) return "REQUIRED_CHALLENGE";
  if (usedPercent >= riskThreshold) return "RISK_CHALLENGE";
  return "NO_CHALLENGE";
}
