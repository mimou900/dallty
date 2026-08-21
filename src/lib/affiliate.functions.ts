import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";

/**
 * Project 12 Phase 4: affiliate foundation (brief §42-45). Confirmed genuinely zero before
 * this project. Auto-approved on application (brief §42); Super Admin controls
 * suspend/ban and commission-rule configuration. Referral attribution and commission
 * accrual are both real and ledger-backed; the *trigger* that converts a pending referral
 * into a paid commission ("becomes a paying subscriber") is explicitly Project 13's job —
 * subscriptions don't exist yet. activateAffiliateReferral is Super-Admin-callable now as an
 * honest manual stand-in, with a doc comment marking it as the hook a real subscription-
 * payment-success handler should call later, rather than fabricating a fake "paying" signal.
 */

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Any signed-in customer can apply — auto-approved (brief §42), reuses Project 10 auth, no separate affiliate login system. */
export const applyForAffiliate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("affiliates")
      .select("id, referral_code, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode();
      const { data, error } = await supabaseAdmin
        .from("affiliates")
        .insert({ user_id: context.userId, referral_code: code, status: "active" } as never)
        .select("id, referral_code, status")
        .single();
      if (!error) return data;
      const code23505 = (error as { code?: string }).code === "23505";
      if (!code23505) throw new Error(sanitizeDbError(error));
      // Referral code collision (rare, 33^8 space) — retry with a fresh code.
    }
    throw new Error("Could not generate a unique referral code — try again");
  });

/** The signed-in user's own affiliate profile, if any. */
export const getMyAffiliateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("affiliates")
      .select("id, referral_code, status, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(sanitizeDbError(error));
    return data;
  });

const statusInput = z.object({
  affiliateId: z.string().uuid(),
  status: z.enum(["active", "suspended", "banned"]),
});

/** Super Admin suspends/bans/reactivates an affiliate. */
export const updateAffiliateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => statusInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("affiliates")
      .update({ status: data.status } as never)
      .eq("id", data.affiliateId);
    if (error) throw new Error(sanitizeDbError(error));

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: `affiliate.${data.status}`,
      target_type: "affiliate",
      target_id: data.affiliateId,
      risk_level: data.status === "banned" ? "high" : "medium",
    } as never);
    return { ok: true };
  });

const commissionRuleInput = z.object({
  affiliateId: z.string().uuid().nullable().optional(),
  countryId: z.string().uuid().nullable().optional(),
  planKey: z.string().nullable().optional(),
  campaignKey: z.string().nullable().optional(),
  rateType: z.enum(["fixed", "percentage"]),
  rateValue: z.number().min(0),
  durationMonths: z.number().int().positive().default(1),
});

/** Super Admin creates an affiliate commission rule at whatever specificity they choose. */
export const createAffiliateCommissionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => commissionRuleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rule, error } = await supabaseAdmin
      .from("affiliate_commission_rules")
      .insert({
        affiliate_id: data.affiliateId ?? null,
        country_id: data.countryId ?? null,
        plan_key: data.planKey ?? null,
        campaign_key: data.campaignKey ?? null,
        rate_type: data.rateType,
        rate_value: data.rateValue,
        duration_months: data.durationMonths,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(sanitizeDbError(error));
    return rule;
  });

const claimReferralInput = z.object({
  referralCode: z.string().trim().min(1).max(20),
  businessId: z.string().uuid(),
});

/**
 * Records a business's attribution to an affiliate at signup (brief §44 — "preserve
 * attribution history"). The referral stays 'pending' until activateAffiliateReferral (or,
 * eventually, Project 13's own subscription-success hook) converts it.
 */
export const claimAffiliateReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => claimReferralInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: owns }, { data: affiliate }] = await Promise.all([
      supabaseAdmin.rpc("owns_business", {
        _user_id: context.userId,
        _salon_id: data.businessId,
      }),
      supabaseAdmin
        .from("affiliates")
        .select("id, status")
        .eq("referral_code", data.referralCode.toUpperCase())
        .maybeSingle(),
    ]);
    if (!owns) throw new Error("NOT_AUTHORIZED");
    if (!affiliate || affiliate.status !== "active") throw new Error("INVALID_REFERRAL_CODE");

    const { data: existing } = await supabaseAdmin
      .from("affiliate_referrals")
      .select("id")
      .eq("referred_business_id", data.businessId)
      .maybeSingle();
    if (existing) throw new Error("BUSINESS_ALREADY_ATTRIBUTED");

    const { data: referral, error } = await supabaseAdmin
      .from("affiliate_referrals")
      .insert({
        affiliate_id: affiliate.id,
        referred_business_id: data.businessId,
        referral_code: data.referralCode.toUpperCase(),
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(sanitizeDbError(error));
    return referral;
  });

const activateReferralInput = z.object({
  referralId: z.string().uuid(),
  subscriptionAmount: z.number().positive(),
  currency: z.string().length(3),
});

/**
 * Converts a pending referral into an earned, ledger-posted commission. Shared core so both
 * the Super-Admin-facing manual server function below AND Project 13's real subscription-
 * payment-success handler (a business's first successful payment — see
 * subscription.functions.ts's recordSubscriptionPayment) call the exact same logic instead
 * of duplicating it — this is the hook this file's own prior doc comment said a real handler
 * should call once one existed.
 */
export async function activateAffiliateReferralCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role client, shared across callers with slightly different generic bindings
  supabaseAdmin: any,
  params: { referralId: string; subscriptionAmount: number; currency: string; actorId: string | null },
): Promise<{ ok: true; commissionAmount: number }> {
  const { postLedgerGroup } = await import("@/lib/ledger.server");

  const { data: referral, error: refErr } = await supabaseAdmin
    .from("affiliate_referrals")
    .select("id, affiliate_id, status, referred_business_id")
    .eq("id", params.referralId)
    .maybeSingle();
  if (refErr) throw new Error(sanitizeDbError(refErr));
  if (!referral) throw new Error("REFERRAL_NOT_FOUND");
  if (referral.status !== "pending") throw new Error("REFERRAL_NOT_PENDING");
  if (!referral.referred_business_id) throw new Error("REFERRED_BUSINESS_NO_LONGER_EXISTS");

  const { data: businessRow } = await supabaseAdmin
    .from("businesses")
    .select("country_code")
    .eq("id", referral.referred_business_id)
    .maybeSingle();
  const { data: countryRow } = businessRow?.country_code
    ? await supabaseAdmin
        .from("countries")
        .select("id")
        .eq("iso_code", businessRow.country_code)
        .maybeSingle()
    : { data: null };

  // Precedence: affiliate-specific -> country-specific -> global default (mirrors
  // commission_rules' own hierarchy, brief §34).
  const { data: rules } = await supabaseAdmin
    .from("affiliate_commission_rules")
    .select("rate_type, rate_value, duration_months, affiliate_id, country_id")
    .eq("active", true)
    .or(`affiliate_id.eq.${referral.affiliate_id},affiliate_id.is.null`)
    .lte("effective_from", new Date().toISOString());
  const candidates = rules ?? [];
  const rule =
    candidates.find((r: { affiliate_id: string | null }) => r.affiliate_id === referral.affiliate_id) ??
    candidates.find(
      (r: { country_id: string | null }) => r.country_id && r.country_id === countryRow?.id,
    ) ??
    candidates.find((r: { affiliate_id: string | null; country_id: string | null }) => !r.affiliate_id && !r.country_id);
  if (!rule) throw new Error("NO_COMMISSION_RULE_CONFIGURED");

  const commissionAmount =
    rule.rate_type === "fixed"
      ? Number(rule.rate_value)
      : Math.round(params.subscriptionAmount * (Number(rule.rate_value) / 100) * 100) / 100;

  await postLedgerGroup(supabaseAdmin, {
    postings: [
      {
        accountType: "dallty_revenue",
        accountRef: referral.referred_business_id,
        direction: "debit",
        amount: commissionAmount,
        type: "affiliate_commission",
      },
      {
        accountType: "affiliate_payable",
        accountRef: referral.affiliate_id,
        direction: "credit",
        amount: commissionAmount,
        type: "affiliate_commission",
      },
    ],
    currency: params.currency,
    actorId: params.actorId,
    reason: `affiliate_referral:${referral.id}`,
    metadata: {
      durationMonths: rule.duration_months,
      subscriptionAmount: params.subscriptionAmount,
    },
  });

  const { error: updateErr } = await supabaseAdmin
    .from("affiliate_referrals")
    .update({ status: "converted", converted_at: new Date().toISOString() } as never)
    .eq("id", referral.id)
    .eq("status", "pending");
  if (updateErr) throw new Error(sanitizeDbError(updateErr));

  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: params.actorId,
    action: "affiliate.referral_converted",
    target_type: "affiliate_referral",
    target_id: referral.id,
    details: { commissionAmount } as never,
  } as never);

  return { ok: true, commissionAmount };
}

/** Super-Admin-facing manual trigger — wraps the shared core above with the auth gate. */
export const activateAffiliateReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateReferralInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return activateAffiliateReferralCore(supabaseAdmin, { ...data, actorId: context.userId });
  });
