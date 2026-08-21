import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";
import type { Json } from "@/integrations/supabase/types";

/**
 * Project 13: the real subscription/billing architecture — plan -> pricing -> subscription
 * -> billing period -> payment/financial ledger -> entitlement -> upgrade/downgrade ->
 * cancellation -> renewal -> expiration -> affiliate commission trigger -> business referral
 * reward trigger. Every commercial value (price, limits, trial/grace duration) lives in the
 * editable `subscription_plans` reference table, never hardcoded here — see the schema
 * migration's own header for the full audit of what existed before this project
 * (businesses.plan was a bare, unconsumed enum column; trial length was hardcoded to 14 days
 * in business.functions.ts, fixed below). Reuses Project 12's ledger exactly as instructed —
 * no new payment/ledger/balance/payout system.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role client, shared across callers with slightly different generic bindings (matches affiliate.functions.ts's own core-function pattern)
type AnySupabase = any;

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Deliberately NOT owns_business() here: that RPC treats 'manager' as owner-equivalent
 * (checked live against the real schema — its own definition ORs in
 * `role.key IN ('owner','manager')`), which is correct for the "almost all daily operations"
 * surfaces it gates elsewhere but wrong for subscription actions specifically — the brief is
 * explicit that manager must be denied billing/subscription/ownership unless separately
 * granted, and subscription.manage/subscription.view are in fact only ever seeded to 'owner'
 * (business scope) and 'super_admin' (global scope), never 'manager'. Using owns_business()
 * here would have silently defeated that restriction regardless of what has_permission()
 * itself resolves to.
 */
async function isLiteralOwner(supabaseAdmin: AnySupabase, userId: string, businessId: string) {
  const { data } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Creates the initial 'trialing' subscription for a brand-new business, reading trial length
 * from the chosen plan's own configured `trial_duration_days` instead of a hardcoded number.
 * Called from business.functions.ts's registerBusiness — kept here (not duplicated there) so
 * the plan/pricing/subscription pipeline has exactly one entry point. Returns the computed
 * trial_ends_at so the caller can keep businesses.trial_ends_at (the pre-existing UI banner's
 * data source) in sync without a second query.
 */
export async function resolvePlanTrialEndsAt(
  supabaseAdmin: AnySupabase,
  planKey: string,
): Promise<{ planKey: string; trialDurationDays: number; trialEndsAt: string }> {
  const { data: plan, error: planErr } = await supabaseAdmin
    .from("subscription_plans")
    .select("plan_key, trial_duration_days")
    .eq("plan_key", planKey)
    .eq("is_active", true)
    .maybeSingle();
  if (planErr) throw new Error(sanitizeDbError(planErr));
  if (!plan) throw new Error("INVALID_PLAN");

  const trialEndsAt = new Date(
    Date.now() + plan.trial_duration_days * 24 * 60 * 60 * 1000,
  ).toISOString();
  return { planKey: plan.plan_key, trialDurationDays: plan.trial_duration_days, trialEndsAt };
}

export async function createSubscriptionForNewBusiness(
  supabaseAdmin: AnySupabase,
  params: { businessId: string; planKey: string; trialDurationDays: number; trialEndsAt: string },
): Promise<{ subscriptionId: string; trialEndsAt: string }> {
  const plan = { plan_key: params.planKey, trial_duration_days: params.trialDurationDays };
  const trialEndsAt = params.trialEndsAt;
  const now = new Date();

  const { data: sub, error } = await supabaseAdmin
    .from("business_subscriptions")
    .insert({
      business_id: params.businessId,
      plan_key: plan.plan_key,
      status: "trialing",
      trial_ends_at: trialEndsAt,
      current_period_start: now.toISOString(),
      current_period_end: trialEndsAt,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(sanitizeDbError(error));

  await supabaseAdmin.from("subscription_events").insert([
    {
      business_id: params.businessId,
      subscription_id: sub.id,
      event_type: "created",
      to_plan_key: plan.plan_key,
      details: {},
    },
    {
      business_id: params.businessId,
      subscription_id: sub.id,
      event_type: "trial_started",
      to_plan_key: plan.plan_key,
      details: { trialDurationDays: plan.trial_duration_days, trialEndsAt },
    },
  ] as never);

  return { subscriptionId: sub.id, trialEndsAt };
}

/** Resolves a business's active plan limits/entitlements — the real, queryable enforcement source. */
export async function getBusinessEntitlements(supabaseAdmin: AnySupabase, businessId: string) {
  const { data: sub, error } = await supabaseAdmin
    .from("business_subscriptions")
    .select(
      "status, plan_key, subscription_plans(staff_limit, branch_limit, monthly_booking_limit, customer_limit, feature_entitlements, advertising_eligible)",
    )
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(sanitizeDbError(error));
  const plan = sub?.subscription_plans as unknown as {
    staff_limit: number | null;
    branch_limit: number | null;
    monthly_booking_limit: number | null;
    customer_limit: number | null;
    feature_entitlements: Json;
    advertising_eligible: boolean;
  } | null;

  return {
    planKey: sub?.plan_key ?? null,
    status: sub?.status ?? null,
    // No subscription row (shouldn't happen for any business created after this project, but
    // pre-existing businesses predate it) -> fail safe to zero limits rather than unlimited.
    staffLimit: plan?.staff_limit ?? (sub ? null : 0),
    branchLimit: plan?.branch_limit ?? (sub ? null : 0),
    monthlyBookingLimit: plan?.monthly_booking_limit ?? (sub ? null : 0),
    customerLimit: plan?.customer_limit ?? (sub ? null : 0),
    featureEntitlements: plan?.feature_entitlements ?? {},
    advertisingEligible: plan?.advertising_eligible ?? false,
  };
}

/** Owner-facing entitlements + current usage (for a settings/billing page banner). */
export const getMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await adminClient();
    const { hasPermission } = await import("@/lib/permissions.server");

    const [owns, permitted] = await Promise.all([
      isLiteralOwner(supabaseAdmin, context.userId, data.businessId),
      hasPermission(context, data.businessId, "subscription.view"),
    ]);
    if (!owns && !permitted) throw new Error("NOT_AUTHORIZED");

    const [{ data: sub, error }, entitlements, { count: staffCount }, { count: branchCount }] =
      await Promise.all([
        supabaseAdmin
          .from("business_subscriptions")
          .select(
            "id, plan_key, billing_interval, status, trial_ends_at, current_period_start, current_period_end, grace_period_ends_at, cancel_at_period_end, canceled_at, subscription_plans(*)",
          )
          .eq("business_id", data.businessId)
          .maybeSingle(),
        getBusinessEntitlements(supabaseAdmin, data.businessId),
        supabaseAdmin
          .from("staff")
          .select("id", { count: "exact", head: true })
          .eq("business_id", data.businessId)
          .eq("is_active", true),
        supabaseAdmin
          .from("business_branches")
          .select("id", { count: "exact", head: true })
          .eq("business_id", data.businessId)
          .eq("status", "active"),
      ]);
    if (error) throw new Error(sanitizeDbError(error));

    return {
      subscription: sub,
      entitlements,
      usage: { staffCount: staffCount ?? 0, branchCount: branchCount ?? 0 },
    };
  });

const changePlanInput = z.object({
  businessId: z.string().uuid(),
  planKey: z.string().min(1),
  billingInterval: z.enum(["monthly", "yearly"]).optional(),
});

/**
 * Upgrade or downgrade — direction is derived from the two plans' monthly_price, never
 * assumed from the caller, so the event log stays honest even if plan pricing changes later.
 * Takes effect immediately (not at period end) — mirrors how most SaaS upgrade flows work;
 * downgrade-at-renewal is a real product nuance intentionally left for a future pass rather
 * than invented here.
 */
export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => changePlanInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await adminClient();
    const { hasPermission } = await import("@/lib/permissions.server");

    const [owns, permitted] = await Promise.all([
      isLiteralOwner(supabaseAdmin, context.userId, data.businessId),
      hasPermission(context, data.businessId, "subscription.manage"),
    ]);
    if (!owns && !permitted) throw new Error("NOT_AUTHORIZED");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("business_subscriptions")
      .select("id, plan_key, billing_interval, status")
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (subErr) throw new Error(sanitizeDbError(subErr));
    if (!sub) throw new Error("NO_SUBSCRIPTION");
    if (sub.status === "canceled" || sub.status === "expired") {
      throw new Error("SUBSCRIPTION_NOT_ACTIVE");
    }

    const [{ data: fromPlan }, { data: toPlan }] = await Promise.all([
      supabaseAdmin
        .from("subscription_plans")
        .select("plan_key, monthly_price")
        .eq("plan_key", sub.plan_key)
        .single(),
      supabaseAdmin
        .from("subscription_plans")
        .select("plan_key, monthly_price")
        .eq("plan_key", data.planKey)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    if (!toPlan) throw new Error("INVALID_PLAN");
    if (toPlan.plan_key === fromPlan?.plan_key && !data.billingInterval) {
      throw new Error("ALREADY_ON_THIS_PLAN");
    }

    const eventType = Number(toPlan.monthly_price) >= Number(fromPlan?.monthly_price ?? 0)
      ? "upgraded"
      : "downgraded";

    const { error } = await supabaseAdmin
      .from("business_subscriptions")
      .update({
        plan_key: toPlan.plan_key,
        billing_interval: data.billingInterval ?? sub.billing_interval,
      } as never)
      .eq("id", sub.id);
    if (error) throw new Error(sanitizeDbError(error));

    await supabaseAdmin.from("businesses").update({ plan: toPlan.plan_key } as never).eq(
      "id",
      data.businessId,
    );

    await supabaseAdmin.from("subscription_events").insert({
      business_id: data.businessId,
      subscription_id: sub.id,
      event_type: eventType,
      from_plan_key: fromPlan?.plan_key ?? null,
      to_plan_key: toPlan.plan_key,
      actor_id: context.userId,
      details: { billingInterval: data.billingInterval ?? sub.billing_interval },
    } as never);

    return { ok: true, eventType };
  });

const cancelInput = z.object({
  businessId: z.string().uuid(),
  immediately: z.boolean().default(false),
});

/** Graceful (default: at period end) or immediate cancellation. */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await adminClient();
    const { hasPermission } = await import("@/lib/permissions.server");

    const [owns, permitted] = await Promise.all([
      isLiteralOwner(supabaseAdmin, context.userId, data.businessId),
      hasPermission(context, data.businessId, "subscription.manage"),
    ]);
    if (!owns && !permitted) throw new Error("NOT_AUTHORIZED");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("business_subscriptions")
      .select("id, plan_key, status")
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (subErr) throw new Error(sanitizeDbError(subErr));
    if (!sub) throw new Error("NO_SUBSCRIPTION");
    if (sub.status === "canceled" || sub.status === "expired") {
      throw new Error("ALREADY_CANCELED");
    }

    const { error } = await supabaseAdmin
      .from("business_subscriptions")
      .update(
        data.immediately
          ? ({ status: "canceled", canceled_at: new Date().toISOString() } as never)
          : ({ cancel_at_period_end: true, canceled_at: new Date().toISOString() } as never),
      )
      .eq("id", sub.id);
    if (error) throw new Error(sanitizeDbError(error));

    await supabaseAdmin.from("subscription_events").insert({
      business_id: data.businessId,
      subscription_id: sub.id,
      event_type: "canceled",
      from_plan_key: sub.plan_key,
      to_plan_key: sub.plan_key,
      actor_id: context.userId,
      details: { immediately: data.immediately },
    } as never);

    return { ok: true };
  });

/** Undoes a scheduled (not-yet-effective) cancellation. */
export const reactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await adminClient();
    const { hasPermission } = await import("@/lib/permissions.server");

    const [owns, permitted] = await Promise.all([
      isLiteralOwner(supabaseAdmin, context.userId, data.businessId),
      hasPermission(context, data.businessId, "subscription.manage"),
    ]);
    if (!owns && !permitted) throw new Error("NOT_AUTHORIZED");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("business_subscriptions")
      .select("id, plan_key, status, cancel_at_period_end")
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (subErr) throw new Error(sanitizeDbError(subErr));
    if (!sub) throw new Error("NO_SUBSCRIPTION");
    if (sub.status !== "active" && sub.status !== "trialing") throw new Error("NOTHING_TO_REACTIVATE");
    if (!sub.cancel_at_period_end) throw new Error("NOT_SCHEDULED_TO_CANCEL");

    const { error } = await supabaseAdmin
      .from("business_subscriptions")
      .update({ cancel_at_period_end: false, canceled_at: null } as never)
      .eq("id", sub.id);
    if (error) throw new Error(sanitizeDbError(error));

    await supabaseAdmin.from("subscription_events").insert({
      business_id: data.businessId,
      subscription_id: sub.id,
      event_type: "reactivated",
      from_plan_key: sub.plan_key,
      to_plan_key: sub.plan_key,
      actor_id: context.userId,
      details: {},
    } as never);

    return { ok: true };
  });

const recordPaymentInput = z.object({
  businessId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  billingInterval: z.enum(["monthly", "yearly"]).optional(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

/**
 * Records a subscription payment. TEMPORARY, manual mechanism: no real payment gateway is
 * configured for Dallty subscriptions (confirmed via a repo-wide + .env audit before writing
 * this project), so a business paying happens off-platform and Super Admin confirms it
 * happened here — this is explicitly NOT an automated gateway and must never be presented as
 * one. Super-Admin-only (not owner-recordable): a business attesting its own payment
 * happened would be trivially forgeable, unlike e.g. markCashPayment where a staff member
 * confirms a customer's cash in front of them.
 *
 * On a business's FIRST successful payment ever ("becomes a paying subscriber"), this is
 * also the real trigger Project 12's activateAffiliateReferral/activateBusinessReferral were
 * built to be called from — fires both if a pending referral exists for this business,
 * closing the loop those functions' own doc comments left open.
 */
export const recordSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordPaymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const supabaseAdmin = await adminClient();
    const { postLedgerGroup } = await import("@/lib/ledger.server");
    const { withIdempotency } = await import("@/lib/idempotency.server");

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("business_subscriptions")
      .select("id, plan_key, billing_interval, status, current_period_end")
      .eq("business_id", data.businessId)
      .maybeSingle();
    if (subErr) throw new Error(sanitizeDbError(subErr));
    if (!sub) throw new Error("NO_SUBSCRIPTION");
    if (sub.status === "canceled") throw new Error("SUBSCRIPTION_CANCELED");

    const billingInterval = data.billingInterval ?? sub.billing_interval;

    return withIdempotency(
      supabaseAdmin,
      {
        actorId: context.userId,
        operation: "record_subscription_payment",
        key: data.idempotencyKey ?? `${data.businessId}:${new Date().toISOString().slice(0, 7)}`,
      },
      async () => {
        // Was this business ever a paying subscriber before this payment? Determines
        // whether the affiliate/business-referral "first paying subscriber" triggers fire.
        const { count: priorPayments } = await supabaseAdmin
          .from("subscription_payments")
          .select("id", { count: "exact", head: true })
          .eq("business_id", data.businessId);
        const isFirstPayment = (priorPayments ?? 0) === 0;

        const now = new Date();
        const periodStart =
          sub.current_period_end && new Date(sub.current_period_end) > now
            ? new Date(sub.current_period_end)
            : now;
        const periodEnd = new Date(periodStart);
        if (billingInterval === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        else periodEnd.setMonth(periodEnd.getMonth() + 1);

        const { data: payment, error: paymentErr } = await supabaseAdmin
          .from("subscription_payments")
          .insert({
            business_id: data.businessId,
            subscription_id: sub.id,
            plan_key: sub.plan_key,
            billing_interval: billingInterval,
            amount: data.amount,
            currency: data.currency,
            period_start: periodStart.toISOString(),
            period_end: periodEnd.toISOString(),
            payment_method: "manual_admin_recorded",
            recorded_by: context.userId,
            notes: data.notes ?? null,
          } as never)
          .select("id")
          .single();
        if (paymentErr) throw new Error(sanitizeDbError(paymentErr));

        // Reuses Project 12's ledger exactly — no new ledger/payment/balance system. Cash
        // leaves the business's own real-world account (external_cash), Dallty's own
        // platform revenue increases (dallty_revenue) — mirrors the account-type shape
        // already established for booking cash payments, just in the reverse commercial
        // direction (business -> Dallty, not customer -> business).
        const { groupId } = await postLedgerGroup(supabaseAdmin, {
          postings: [
            {
              accountType: "external_cash",
              accountRef: data.businessId,
              direction: "debit",
              amount: data.amount,
              type: "subscription_payment",
            },
            {
              accountType: "dallty_revenue",
              accountRef: data.businessId,
              direction: "credit",
              amount: data.amount,
              type: "subscription_payment",
            },
          ],
          currency: data.currency,
          businessId: data.businessId,
          // NOT paymentId: postLedgerGroup's paymentId param has a foreign key to the
          // `payments` table specifically (booking payments) -- confirmed live via a real
          // insert attempt, which failed with a FK violation. subscription_payments is an
          // unrelated table; traceability instead goes through `reason` below, matching how
          // every other ledger consumer without a `payments` row already does it.
          actorId: context.userId,
          reason: `subscription_payment:${payment.id}`,
        });

        await supabaseAdmin
          .from("subscription_payments")
          .update({ ledger_group_id: groupId } as never)
          .eq("id", payment.id);

        const { error: updateErr } = await supabaseAdmin
          .from("business_subscriptions")
          .update({
            status: "active",
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            grace_period_ends_at: null,
          } as never)
          .eq("id", sub.id);
        if (updateErr) throw new Error(sanitizeDbError(updateErr));

        await supabaseAdmin.from("businesses").update({ plan: sub.plan_key } as never).eq(
          "id",
          data.businessId,
        );

        await supabaseAdmin.from("subscription_events").insert({
          business_id: data.businessId,
          subscription_id: sub.id,
          event_type: "renewed",
          from_plan_key: sub.plan_key,
          to_plan_key: sub.plan_key,
          actor_id: context.userId,
          details: { paymentId: payment.id, amount: data.amount, isFirstPayment },
        } as never);
        await supabaseAdmin.from("subscription_events").insert({
          business_id: data.businessId,
          subscription_id: sub.id,
          event_type: "payment_recorded",
          from_plan_key: sub.plan_key,
          to_plan_key: sub.plan_key,
          actor_id: context.userId,
          details: { paymentId: payment.id, amount: data.amount, currency: data.currency },
        } as never);

        const triggers: { affiliateFired: boolean; businessReferralFired: boolean } = {
          affiliateFired: false,
          businessReferralFired: false,
        };

        if (isFirstPayment) {
          const [{ data: pendingAffiliateReferral }, { data: pendingBusinessReferral }] =
            await Promise.all([
              supabaseAdmin
                .from("affiliate_referrals")
                .select("id")
                .eq("referred_business_id", data.businessId)
                .eq("status", "pending")
                .maybeSingle(),
              supabaseAdmin
                .from("business_referrals")
                .select("id")
                .eq("referred_business_id", data.businessId)
                .eq("status", "pending")
                .maybeSingle(),
            ]);

          if (pendingAffiliateReferral) {
            const { activateAffiliateReferralCore } = await import("@/lib/affiliate.functions");
            await activateAffiliateReferralCore(supabaseAdmin, {
              referralId: pendingAffiliateReferral.id,
              subscriptionAmount: data.amount,
              currency: data.currency,
              actorId: context.userId,
            });
            triggers.affiliateFired = true;
          }

          if (pendingBusinessReferral) {
            const { data: settings } = await supabaseAdmin
              .from("subscription_settings")
              .select("business_referral_reward_percent")
              .eq("id", true)
              .single();
            const rewardPercent = Number(settings?.business_referral_reward_percent ?? 10);
            const rewardAmount = Math.round(data.amount * (rewardPercent / 100) * 100) / 100;
            if (rewardAmount > 0) {
              const { activateBusinessReferralCore } = await import(
                "@/lib/business-referral.functions"
              );
              await activateBusinessReferralCore(supabaseAdmin, {
                referralId: pendingBusinessReferral.id,
                rewardAmount,
                currency: data.currency,
                actorId: context.userId,
              });
              triggers.businessReferralFired = true;
            }
          }
        }

        return { ok: true, paymentId: payment.id, isFirstPayment, triggers };
      },
    );
  });

const planFieldsInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  nameAr: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  descriptionAr: z.string().trim().max(2000).nullable().optional(),
  monthlyPrice: z.number().min(0).optional(),
  yearlyPrice: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  trialDurationDays: z.number().int().min(0).optional(),
  gracePeriodDays: z.number().int().min(0).optional(),
  staffLimit: z.number().int().positive().nullable().optional(),
  branchLimit: z.number().int().positive().nullable().optional(),
  monthlyBookingLimit: z.number().int().positive().nullable().optional(),
  customerLimit: z.number().int().positive().nullable().optional(),
  featureEntitlements: z.record(z.string(), z.unknown()).optional(),
  advertisingEligible: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isProvisional: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Every configured plan, active or not — the Super Admin config screen's source of truth. */
export const listSubscriptionPlansAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin
      .from("subscription_plans")
      .select("*")
      .order("sort_order");
    if (error) throw new Error(sanitizeDbError(error));
    return data ?? [];
  });

/**
 * Creates a brand-new plan key (brief: "Treat these as the initial plan keys only" — more
 * can be added later without a code change) or updates an existing one's configuration.
 * Every commercial field is optional on update so a partial PATCH never clobbers unrelated
 * columns.
 */
export const upsertSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ planKey: z.string().trim().min(1).max(40) }).and(planFieldsInput).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const supabaseAdmin = await adminClient();

    const planKey = data.planKey.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const row: Record<string, unknown> = { plan_key: planKey };
    if (data.name !== undefined) row.name = data.name;
    if (data.nameAr !== undefined) row.name_ar = data.nameAr;
    if (data.description !== undefined) row.description = data.description;
    if (data.descriptionAr !== undefined) row.description_ar = data.descriptionAr;
    if (data.monthlyPrice !== undefined) row.monthly_price = data.monthlyPrice;
    if (data.yearlyPrice !== undefined) row.yearly_price = data.yearlyPrice;
    if (data.currency !== undefined) row.currency = data.currency;
    if (data.trialDurationDays !== undefined) row.trial_duration_days = data.trialDurationDays;
    if (data.gracePeriodDays !== undefined) row.grace_period_days = data.gracePeriodDays;
    if (data.staffLimit !== undefined) row.staff_limit = data.staffLimit;
    if (data.branchLimit !== undefined) row.branch_limit = data.branchLimit;
    if (data.monthlyBookingLimit !== undefined) row.monthly_booking_limit = data.monthlyBookingLimit;
    if (data.customerLimit !== undefined) row.customer_limit = data.customerLimit;
    if (data.featureEntitlements !== undefined) row.feature_entitlements = data.featureEntitlements;
    if (data.advertisingEligible !== undefined) row.advertising_eligible = data.advertisingEligible;
    if (data.isActive !== undefined) row.is_active = data.isActive;
    if (data.isProvisional !== undefined) row.is_provisional = data.isProvisional;
    if (data.sortOrder !== undefined) row.sort_order = data.sortOrder;

    const { data: existing } = await supabaseAdmin
      .from("subscription_plans")
      .select("plan_key")
      .eq("plan_key", planKey)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("subscription_plans")
        .update(row as never)
        .eq("plan_key", planKey);
      if (error) throw new Error(sanitizeDbError(error));
    } else {
      if (!data.name) throw new Error("A new plan needs at least a name");
      const { error } = await supabaseAdmin.from("subscription_plans").insert(row as never);
      if (error) throw new Error(sanitizeDbError(error));
    }

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: existing ? "subscription_plan.updated" : "subscription_plan.created",
      target_type: "subscription_plan",
      target_id: planKey,
      details: row as never,
    } as never);

    return { ok: true, planKey };
  });

/** The single business-referral reward setting Super Admin can tune. */
export const updateSubscriptionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessReferralRewardPercent: z.number().min(0).max(100),
        isProvisional: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const supabaseAdmin = await adminClient();

    const row: Record<string, unknown> = {
      business_referral_reward_percent: data.businessReferralRewardPercent,
    };
    if (data.isProvisional !== undefined) row.is_provisional = data.isProvisional;

    const { error } = await supabaseAdmin
      .from("subscription_settings")
      .update(row as never)
      .eq("id", true);
    if (error) throw new Error(sanitizeDbError(error));

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "subscription_settings.updated",
      target_type: "subscription_settings",
      target_id: "singleton",
      details: row as never,
    } as never);

    return { ok: true };
  });
