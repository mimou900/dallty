import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";

/**
 * Project 12 Phase 5: business referrals (brief §46) — distinct from affiliates (§42): a
 * business refers another business once, for a one-off Dallty-balance credit, not an
 * ongoing per-person commission relationship. Confirmed genuinely zero before this project.
 * Same Project-13 boundary as affiliate conversion: "becomes a paying subscriber" isn't a
 * real signal yet, so activation is Super-Admin-callable now with a documented hook for a
 * real subscription-payment-success handler to call later.
 */

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Owner gets (or creates, first call) their business's referral code. */
export const getOrCreateBusinessReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owns } = await supabaseAdmin.rpc("owns_business", {
      _user_id: context.userId,
      _salon_id: data.businessId,
    });
    if (!owns) throw new Error("NOT_AUTHORIZED");

    const { data: existing } = await supabaseAdmin
      .from("business_referrals")
      .select("id, referral_code")
      .eq("referring_business_id", data.businessId)
      .is("referred_business_id", null)
      .maybeSingle();
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode();
      const { data: created, error } = await supabaseAdmin
        .from("business_referrals")
        .insert({ referring_business_id: data.businessId, referral_code: code } as never)
        .select("id, referral_code")
        .single();
      if (!error) return created;
      if ((error as { code?: string }).code !== "23505") throw new Error(sanitizeDbError(error));
    }
    throw new Error("Could not generate a unique referral code — try again");
  });

const claimInput = z.object({
  referralCode: z.string().trim().min(1).max(20),
  businessId: z.string().uuid(),
});

/** Attributes a newly-created business to whichever other business referred it. */
export const claimBusinessReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => claimInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owns } = await supabaseAdmin.rpc("owns_business", {
      _user_id: context.userId,
      _salon_id: data.businessId,
    });
    if (!owns) throw new Error("NOT_AUTHORIZED");

    const { data: pending, error: findErr } = await supabaseAdmin
      .from("business_referrals")
      .select("id, referring_business_id")
      .eq("referral_code", data.referralCode.toUpperCase())
      .is("referred_business_id", null)
      .maybeSingle();
    if (findErr) throw new Error(sanitizeDbError(findErr));
    if (!pending) throw new Error("INVALID_REFERRAL_CODE");
    if (pending.referring_business_id === data.businessId) {
      throw new Error("CANNOT_REFER_YOURSELF");
    }

    const { error } = await supabaseAdmin
      .from("business_referrals")
      .update({ referred_business_id: data.businessId } as never)
      .eq("id", pending.id)
      .is("referred_business_id", null);
    if (error) throw new Error(sanitizeDbError(error));
    return { ok: true };
  });

const activateInput = z.object({
  referralId: z.string().uuid(),
  rewardAmount: z.number().positive(),
  currency: z.string().length(3),
});

/**
 * Credits the referring business's Dallty balance (promotional_credit — explicitly NOT the
 * same account as business_balance's real cash revenue, brief §47) once the referred
 * business is confirmed a paying subscriber. Shared core so both the Super-Admin manual
 * server function below AND Project 13's real subscription-payment-success handler
 * (recordSubscriptionPayment) call the exact same logic — the hook this file's own prior doc
 * comment said a real handler should call once one existed.
 */
export async function activateBusinessReferralCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role client, shared across callers with slightly different generic bindings
  supabaseAdmin: any,
  params: { referralId: string; rewardAmount: number; currency: string; actorId: string | null },
): Promise<{ ok: true }> {
  const { postLedgerGroup } = await import("@/lib/ledger.server");

  const { data: referral, error: refErr } = await supabaseAdmin
    .from("business_referrals")
    .select("id, referring_business_id, referred_business_id, status")
    .eq("id", params.referralId)
    .maybeSingle();
  if (refErr) throw new Error(sanitizeDbError(refErr));
  if (!referral) throw new Error("REFERRAL_NOT_FOUND");
  if (referral.status !== "pending") throw new Error("REFERRAL_NOT_PENDING");
  if (!referral.referred_business_id) throw new Error("NOT_YET_CLAIMED_BY_A_BUSINESS");

  await postLedgerGroup(supabaseAdmin, {
    postings: [
      {
        accountType: "dallty_payable",
        accountRef: referral.referring_business_id,
        direction: "debit",
        amount: params.rewardAmount,
        type: "referral_reward",
      },
      {
        accountType: "promotional_credit",
        accountRef: referral.referring_business_id,
        direction: "credit",
        amount: params.rewardAmount,
        type: "referral_reward",
      },
    ],
    currency: params.currency,
    businessId: referral.referring_business_id,
    actorId: params.actorId,
    reason: `business_referral:${referral.id}`,
  });

  const { error } = await supabaseAdmin
    .from("business_referrals")
    .update({
      status: "activated",
      activated_at: new Date().toISOString(),
      reward_amount: params.rewardAmount,
      reward_currency: params.currency,
    } as never)
    .eq("id", referral.id)
    .eq("status", "pending");
  if (error) throw new Error(sanitizeDbError(error));

  await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: params.actorId,
    action: "business_referral.activated",
    target_type: "business_referral",
    target_id: referral.id,
    business_id: referral.referring_business_id,
    details: { rewardAmount: params.rewardAmount } as never,
  } as never);

  return { ok: true };
}

/** Super-Admin-facing manual trigger — wraps the shared core above with the auth gate. */
export const activateBusinessReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => activateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return activateBusinessReferralCore(supabaseAdmin, { ...data, actorId: context.userId });
  });
