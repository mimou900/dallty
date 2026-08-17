import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";

/**
 * Pre-signup check: is this email's domain allowed? Called by every signup form before
 * `supabase.auth.signUp()`, mirroring the existing `checkSignupPassword` pattern ("signup
 * forms cannot be trusted to run the rules themselves" — same reasoning applies here). This
 * is the polished-UX path; `handle_new_user()`'s trigger-level hard block is the backstop
 * for anyone who bypasses this (see the email-trust-foundation migration).
 *
 * Returns only a boolean — never the internal category — so a public response can't be used
 * to map out which domains are trusted/disposable/blocked (§60.14 of the brief).
 */
export const checkEmailDomainAllowed = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `check_email_domain:${ip}`, 20, 10);

    const { data: allowed, error } = await supabaseAdmin.rpc("is_email_domain_allowed", {
      _email: data.email,
    });
    if (error) throw new Error(sanitizeDbError(error));

    if (!allowed) {
      // No authenticated actor exists yet at this point (pre-signup) — admin_audit_log.
      // actor_id is nullable specifically for this case (see the migration).
      await supabaseAdmin.from("admin_audit_log").insert({
        actor_id: null,
        action: "security.disposable_email_rejected",
        target_type: "signup_attempt",
        details: { domain: data.email.split("@")[1]?.toLowerCase() ?? null } as never,
      } as never);
    }

    return { allowed: Boolean(allowed) };
  });

const domainRuleInput = z.object({
  id: z.string().uuid().optional(),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a bare domain, e.g. example.com"),
  category: z.enum([
    "trusted_free_provider",
    "business_domain",
    "unknown_domain",
    "disposable_email",
    "blocked_domain",
    "high_risk_domain",
  ]),
  active: z.boolean().default(true),
  reason: z.string().trim().max(500).nullable().optional(),
});

/** Lists every email domain rule. Super Admin only — this list is never exposed publicly. */
export const listEmailDomainRulesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin
      .from("email_domain_rules")
      .select("*")
      .order("category")
      .order("domain");
    if (error) throw new Error(sanitizeDbError(error));
    return data;
  });

/** Creates or updates an email domain rule. Super Admin only. */
export const upsertEmailDomainRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => domainRuleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin
      .from("email_domain_rules")
      .upsert({ ...data, source: data.id ? undefined : "manual" } as never);
    if (error) throw new Error(sanitizeDbError(error));
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "email_domain_rule.upsert",
      "email_domain_rule",
      data.id ?? null,
      data,
    );
    return { ok: true };
  });
