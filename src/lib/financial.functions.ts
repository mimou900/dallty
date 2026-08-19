import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";
import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/** Emits a notification-engine domain event (Project 07). Never throws — a notification
 * failure must never roll back a financial transaction that already committed (brief §80 of
 * Project 07, same principle as notifyBusinessStatus's "never throws" in Project 02).
 *
 * `dedupeKey` is threaded into `emit_notification_event`'s own `_dedupe_key` param, which
 * already enforces a real `ON CONFLICT (dedupe_key) ... DO NOTHING` at the DB level — that
 * protection existed but was never engaged, since every call site here previously passed
 * `null`. Callers should key on something that's freshly unique per real event (a row id
 * generated once for this specific occurrence), never on something that would collide across
 * two genuinely separate events. */
async function emitFinancialEvent(
  supabaseAdmin: AnySupabase,
  params: {
    eventType: "payment_received" | "refund_completed" | "extra_service_added";
    businessId: string;
    bookingId: string | null;
    paymentId: string | null;
    actorId: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
  },
) {
  try {
    await supabaseAdmin.rpc("emit_notification_event", {
      _event_type: params.eventType,
      _business_id: params.businessId,
      _booking_id: params.bookingId as never,
      _payment_id: params.paymentId as never,
      _actor_id: params.actorId,
      _payload: params.payload as never,
      _dedupe_key: params.dedupeKey,
    });
  } catch (error) {
    console.error("[financial] emitFinancialEvent failed", error);
  }
}

/**
 * Project 11: extended to also accept a granular has_permission() grant (e.g.
 * receptionist's payments.mark_paid/payments.create), not just owner/manager/platform-admin.
 * A missing/undefined permissionKey preserves the exact pre-Project-11 behavior for callers
 * that haven't been updated yet.
 */
async function assertCanManageBookingFinance(
  supabaseAdmin: AnySupabase,
  userId: string,
  businessId: string,
  permissionKey?: string,
  branchId?: string | null,
) {
  const { hasPermission } = await import("@/lib/permissions.server");
  const [{ data: owns }, { data: isAdmin }, permitted] = await Promise.all([
    supabaseAdmin.rpc("owns_business", { _user_id: userId, _salon_id: businessId }),
    supabaseAdmin.rpc("is_platform_admin", { _user_id: userId }),
    permissionKey
      ? hasPermission(
          { supabase: supabaseAdmin, userId } as never,
          businessId,
          permissionKey,
          branchId,
        )
      : Promise.resolve(false),
  ]);
  if (!owns && !isAdmin && !permitted) throw new Error("FORBIDDEN");
  return { isOwnerOrAdmin: true };
}

const markCashPaymentInput = z.object({
  bookingId: z.string().uuid(),
  receivedAmount: z.number().positive(),
  differenceReason: z.enum(["tip", "extra_service", "discount_adjustment", "other"]).optional(),
  differenceNote: z.string().trim().max(500).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

/**
 * Records a cash payment against a booking — the centerpiece of this project. Supersedes
 * `useSetPaymentStatus` (src/lib/admin.ts), which just flipped `bookings.payment_status`
 * directly with no amount tracking, no ledger, no overage/underage handling (confirmed by
 * reading it before writing this). This function is the new authoritative path; the old
 * hook was not deleted (a UI cutover, not a DB migration, is out of this project's chosen
 * scope — see the architecture doc).
 *
 * Never trusts a client-supplied "expected" amount — it's always read fresh from
 * `bookings.total_price` (kept accurate by the booking engine / addExtraService). The
 * received amount is the only thing the caller supplies; every classification and every
 * ledger posting is computed here.
 */
export const markCashPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => markCashPaymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withIdempotency } = await import("@/lib/idempotency.server");
    const { postLedgerGroup, resolveCommissionRate, resolveStaffPayoutRule, computeStaffEarning } =
      await import("@/lib/ledger.server");

    return withIdempotency(
      supabaseAdmin,
      {
        actorId: context.userId,
        operation: "mark_cash_payment",
        key: data.idempotencyKey ?? data.bookingId,
      },
      async () => {
        const { data: booking, error: bookingErr } = await supabaseAdmin
          .from("bookings")
          .select(
            "id, business_id, branch_id, staff_id, service_id, total_price, payment_status, status",
          )
          .eq("id", data.bookingId)
          .maybeSingle();
        if (bookingErr) throw new Error(sanitizeDbError(bookingErr));
        if (!booking) throw new Error("BOOKING_NOT_FOUND");
        if (booking.status === "cancelled") throw new Error("BOOKING_NOT_MODIFIABLE");

        await assertCanManageBookingFinance(
          supabaseAdmin,
          context.userId,
          booking.business_id,
          "payments.mark_paid",
          booking.branch_id,
        );

        const { data: business } = await supabaseAdmin
          .from("businesses")
          .select("currency")
          .eq("id", booking.business_id)
          .single();
        const currency = business?.currency ?? "DZD";

        const expected = Number(booking.total_price);
        const received = data.receivedAmount;
        const difference = Math.round((received - expected) * 100) / 100;

        if (Math.abs(difference) > 0.005 && !data.differenceReason) {
          throw new Error("DIFFERENCE_REASON_REQUIRED");
        }
        if (data.differenceReason === "other" && !data.differenceNote?.trim()) {
          throw new Error("DIFFERENCE_NOTE_REQUIRED");
        }
        if (difference > 0.005 && data.differenceReason === "discount_adjustment") {
          throw new Error("INVALID_DIFFERENCE_REASON"); // a discount cannot explain an overpayment
        }
        if (
          difference < -0.005 &&
          (data.differenceReason === "tip" || data.differenceReason === "extra_service")
        ) {
          throw new Error("INVALID_DIFFERENCE_REASON"); // a tip/extra service cannot explain a shortfall
        }

        // Never inflate service revenue to match what was received (brief §10): a tip is
        // always its own ledger line, so the service line stays at `expected` regardless.
        // An overage explained by extra_service/other is unitemized extra revenue, folded
        // into the service line (received in full). A discount_adjustment or an
        // unexplained-but-authorized shortfall means the service line is only what was
        // actually received.
        const tipAmount = data.differenceReason === "tip" ? Math.max(difference, 0) : 0;
        const finalServiceRevenue = tipAmount > 0 ? expected : received;

        // A discount settles the booking in full at the lower amount — nothing remains
        // owed. Any other unexplained shortfall leaves a real remaining balance.
        const isPartial =
          received < expected - 0.005 && data.differenceReason !== "discount_adjustment";

        const { data: payment, error: paymentErr } = await supabaseAdmin
          .from("payments")
          .insert({
            booking_id: booking.id,
            business_id: booking.business_id,
            kind: isPartial ? "partial" : "full",
            method_code: "cash",
            status: isPartial ? "partially_paid" : "paid",
            expected_amount: expected,
            received_amount: received,
            currency,
            difference_reason: data.differenceReason ?? null,
            difference_note: data.differenceNote ?? null,
            created_by: context.userId,
            completed_at: new Date().toISOString(),
          } as never)
          .select("id")
          .single();
        if (paymentErr) throw new Error(sanitizeDbError(paymentErr));

        const commissionRate = await resolveCommissionRate(supabaseAdmin, booking.business_id);
        const commissionAmount =
          Math.round(finalServiceRevenue * (commissionRate / 100) * 100) / 100;

        const payoutRule = booking.staff_id
          ? await resolveStaffPayoutRule(
              supabaseAdmin,
              booking.business_id,
              booking.staff_id,
              booking.service_id,
            )
          : null;
        const staffEarning =
          Math.round(computeStaffEarning(payoutRule, finalServiceRevenue) * 100) / 100;

        const postings = [
          {
            accountType: "external_cash" as const,
            accountRef: booking.business_id,
            direction: "debit" as const,
            amount: finalServiceRevenue + tipAmount,
            type: "cash_received",
          },
          {
            accountType: "business_balance" as const,
            accountRef: booking.business_id,
            direction: "credit" as const,
            amount: finalServiceRevenue,
            type: "service_revenue",
          },
          {
            accountType: "business_balance" as const,
            accountRef: booking.business_id,
            direction: "credit" as const,
            amount: tipAmount,
            type: "tip",
          },
          {
            accountType: "business_balance" as const,
            accountRef: booking.business_id,
            direction: "debit" as const,
            amount: commissionAmount,
            type: "commission",
          },
          {
            accountType: "dallty_revenue" as const,
            accountRef: booking.business_id,
            direction: "credit" as const,
            amount: commissionAmount,
            type: "commission",
          },
          ...(booking.staff_id && staffEarning > 0
            ? [
                {
                  accountType: "business_balance" as const,
                  accountRef: booking.business_id,
                  direction: "debit" as const,
                  amount: staffEarning,
                  type: "staff_earning",
                },
                {
                  accountType: "staff_payable" as const,
                  accountRef: booking.staff_id,
                  direction: "credit" as const,
                  amount: staffEarning,
                  type: "staff_earning",
                },
              ]
            : []),
        ];

        await postLedgerGroup(supabaseAdmin, {
          postings,
          currency,
          businessId: booking.business_id,
          bookingId: booking.id,
          paymentId: payment.id,
          actorId: context.userId,
          reason: data.differenceReason,
          metadata: { commissionRate, expected, received, difference },
        });

        await supabaseAdmin
          .from("bookings")
          .update({
            payment_status: isPartial ? "partially_paid" : "paid",
            paid_at: new Date().toISOString(),
            paid_by: context.userId,
          } as never)
          .eq("id", booking.id);

        await supabaseAdmin.from("admin_audit_log").insert({
          actor_id: context.userId,
          action: "payment.cash_recorded",
          target_type: "payment",
          target_id: payment.id,
          business_id: booking.business_id,
          details: {
            bookingId: booking.id,
            expected,
            received,
            difference,
            reason: data.differenceReason,
          } as never,
        } as never);

        await emitFinancialEvent(supabaseAdmin, {
          eventType: "payment_received",
          businessId: booking.business_id,
          bookingId: booking.id,
          paymentId: payment.id,
          actorId: context.userId,
          payload: { amount: finalServiceRevenue + tipAmount, currency },
          dedupeKey: `payment_received:${payment.id}`,
        });

        return {
          paymentId: payment.id,
          status: isPartial ? "partially_paid" : "paid",
          expected,
          received,
          difference,
        };
      },
    );
  });

const addExtraServiceInput = z.object({
  bookingId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

/** Adds a service to an existing booking (brief §33-34) — original items stay unchanged. */
export const addExtraService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addExtraServiceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("id, business_id, branch_id, staff_id, total_price")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingErr) throw new Error(sanitizeDbError(bookingErr));
    if (!booking) throw new Error("BOOKING_NOT_FOUND");

    await assertCanManageBookingFinance(
      supabaseAdmin,
      context.userId,
      booking.business_id,
      "payments.create",
      booking.branch_id,
    );

    const { data: service, error: svcErr } = await supabaseAdmin
      .from("services")
      .select("id, name, name_ar, duration_minutes, price, discount_price, is_active, business_id")
      .eq("id", data.serviceId)
      .maybeSingle();
    if (svcErr) throw new Error(sanitizeDbError(svcErr));
    if (!service || !service.is_active || service.business_id !== booking.business_id) {
      throw new Error("SERVICE_UNAVAILABLE");
    }

    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("currency")
      .eq("id", booking.business_id)
      .single();
    const price = Number(service.discount_price ?? service.price);

    const { data: item, error: itemErr } = await supabaseAdmin
      .from("booking_items")
      .insert({
        booking_id: booking.id,
        service_id: service.id,
        service_name: service.name,
        service_name_ar: service.name_ar,
        duration_minutes: service.duration_minutes,
        price,
        currency: business?.currency ?? "DZD",
        staff_id: booking.staff_id,
        business_id: booking.business_id,
        kind: "extra_service",
        added_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (itemErr) throw new Error(sanitizeDbError(itemErr));

    const newTotal = Number(booking.total_price) + price;
    await supabaseAdmin
      .from("bookings")
      .update({ total_price: newTotal } as never)
      .eq("id", booking.id);

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "booking.extra_service_added",
      target_type: "booking",
      target_id: booking.id,
      business_id: booking.business_id,
      details: { serviceId: service.id, price } as never,
    } as never);

    await emitFinancialEvent(supabaseAdmin, {
      eventType: "extra_service_added",
      businessId: booking.business_id,
      bookingId: booking.id,
      paymentId: null,
      actorId: context.userId,
      payload: {
        serviceName: service.name,
        amount: newTotal,
        currency: business?.currency ?? "DZD",
      },
      // item.id is a fresh id generated once for this specific addition — never reused,
      // so this only dedupes a true retry of the same insert, not two separate additions
      // of the same service.
      dedupeKey: `extra_service_added:${item.id}`,
    });

    return { itemId: item.id, newTotal };
  });

const refundInput = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().max(100).optional(),
});

/**
 * Issues a refund (brief §39-43). Owner/platform-admin only — an ordinary specialist
 * cannot self-authorize a refund, matching §41. Never a bare `refunded = true` flip: this
 * creates a `refunds` row referencing the original payment, plus a reversing ledger group.
 */
export const createRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => refundInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withIdempotency } = await import("@/lib/idempotency.server");
    const { postLedgerGroup } = await import("@/lib/ledger.server");

    return withIdempotency(
      supabaseAdmin,
      {
        actorId: context.userId,
        operation: "create_refund",
        key: data.idempotencyKey ?? data.paymentId,
      },
      async () => {
        const { data: payment, error: paymentErr } = await supabaseAdmin
          .from("payments")
          .select("id, business_id, booking_id, received_amount, currency, status")
          .eq("id", data.paymentId)
          .maybeSingle();
        if (paymentErr) throw new Error(sanitizeDbError(paymentErr));
        if (!payment) throw new Error("PAYMENT_NOT_FOUND");
        if (payment.status !== "paid" && payment.status !== "partially_paid") {
          throw new Error("PAYMENT_NOT_REFUNDABLE");
        }

        // Owner/platform-admin only -- NOT is_business_staff, deliberately narrower than
        // assertCanManageBookingFinance used elsewhere (brief §41: ordinary specialists
        // cannot refund).
        const { data: owns } = await supabaseAdmin.rpc("owns_business", {
          _user_id: context.userId,
          _salon_id: payment.business_id,
        });
        const { data: isSuperAdmin } = await supabaseAdmin.rpc("is_super_admin", {
          _user_id: context.userId,
        });
        if (!owns && !isSuperAdmin) throw new Error("FORBIDDEN");

        const alreadyRefunded = await supabaseAdmin
          .from("refunds")
          .select("amount")
          .eq("payment_id", payment.id)
          .eq("status", "succeeded");
        const refundedSoFar = (alreadyRefunded.data ?? []).reduce(
          (s, r) => s + Number(r.amount),
          0,
        );
        const receivedAmount = Number(payment.received_amount ?? 0);
        if (refundedSoFar + data.amount > receivedAmount + 0.005) {
          throw new Error("REFUND_EXCEEDS_PAYMENT");
        }

        const { data: refund, error: refundErr } = await supabaseAdmin
          .from("refunds")
          .insert({
            payment_id: payment.id,
            amount: data.amount,
            currency: payment.currency,
            reason: data.reason,
            status: "succeeded", // cash refund is immediate/manual; an online-provider refund would stay 'pending' until a webhook confirms it (not built — no provider exists)
            actor_id: context.userId,
            completed_at: new Date().toISOString(),
          } as never)
          .select("id")
          .single();
        if (refundErr) throw new Error(sanitizeDbError(refundErr));

        await postLedgerGroup(supabaseAdmin, {
          postings: [
            {
              accountType: "business_balance",
              accountRef: payment.business_id,
              direction: "debit",
              amount: data.amount,
              type: "refund",
            },
            {
              accountType: "external_cash",
              accountRef: payment.business_id,
              direction: "credit",
              amount: data.amount,
              type: "refund",
            },
          ],
          currency: payment.currency,
          businessId: payment.business_id,
          bookingId: payment.booking_id,
          paymentId: payment.id,
          actorId: context.userId,
          reason: data.reason,
        });

        const newStatus =
          refundedSoFar + data.amount >= receivedAmount - 0.005 ? "refunded" : "partially_refunded";
        await supabaseAdmin
          .from("payments")
          .update({ status: newStatus } as never)
          .eq("id", payment.id);
        if (payment.booking_id) {
          await supabaseAdmin
            .from("bookings")
            .update({ payment_status: newStatus } as never)
            .eq("id", payment.booking_id);
        }

        await supabaseAdmin.from("admin_audit_log").insert({
          actor_id: context.userId,
          action: "payment.refund_succeeded",
          target_type: "refund",
          target_id: refund.id,
          business_id: payment.business_id,
          risk_level: "medium",
          details: { paymentId: payment.id, amount: data.amount, reason: data.reason } as never,
        } as never);

        await emitFinancialEvent(supabaseAdmin, {
          eventType: "refund_completed",
          businessId: payment.business_id,
          bookingId: payment.booking_id,
          paymentId: payment.id,
          actorId: context.userId,
          payload: { amount: data.amount, currency: payment.currency },
          dedupeKey: `refund_completed:${refund.id}`,
        });

        return { refundId: refund.id, status: newStatus };
      },
    );
  });

const calculateDepositInput = z.object({
  businessId: z.string().uuid(),
  totalAmount: z.number().positive(),
});

/**
 * Server-side deposit calculation (brief §13-15) — never trusts a client-submitted deposit
 * amount. Reads the business's own deposit configuration (existing `require_deposit`/
 * `deposit_percent` columns on `businesses`, added in an earlier project); no country- or
 * plan-level override table exists yet (no consumer for one — every business today can
 * only set its own flat percentage), so the hierarchy described in the brief is
 * schema-ready (a future `country`/`plan`-scoped table can be added without touching this
 * function's contract) but not built beyond the business level in this project.
 */
export const calculateDeposit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => calculateDepositInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: business, error } = await supabaseAdmin
      .from("businesses")
      .select("require_deposit, deposit_percent, currency")
      .eq("id", data.businessId)
      .maybeSingle();
    if (error) throw new Error(sanitizeDbError(error));
    if (!business?.require_deposit) {
      return {
        required: false,
        depositAmount: 0,
        remainingAmount: data.totalAmount,
        currency: business?.currency ?? "DZD",
      };
    }
    const percent = Number(business.deposit_percent ?? 0);
    const depositAmount = Math.round(data.totalAmount * (percent / 100) * 100) / 100;
    return {
      required: true,
      depositAmount,
      remainingAmount: Math.round((data.totalAmount - depositAmount) * 100) / 100,
      currency: business.currency,
    };
  });

const adjustBalanceInput = z.object({
  accountType: z.enum(["customer_balance", "business_balance", "promotional_credit"]),
  accountRef: z.string().uuid(),
  amount: z.number().refine((v) => v !== 0, "Amount cannot be zero"),
  currency: z.string().length(3),
  reason: z.string().trim().min(1).max(500),
});

/** Manual balance adjustment (brief §63) — Super Admin only, always requires a reason. */
export const adjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adjustBalanceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    const { postLedgerGroup } = await import("@/lib/ledger.server");

    await assertSuperAdmin(context);

    const direction = data.amount > 0 ? "credit" : "debit";
    const amount = Math.abs(data.amount);

    await postLedgerGroup(supabaseAdmin, {
      postings: [
        {
          accountType: data.accountType,
          accountRef: data.accountRef,
          direction,
          amount,
          type: "adjustment",
        },
        {
          accountType: "dallty_payable",
          accountRef: data.accountRef,
          direction: direction === "credit" ? "debit" : "credit",
          amount,
          type: "adjustment",
        },
      ],
      currency: data.currency,
      actorId: context.userId,
      reason: data.reason,
    });

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "balance.adjusted",
      target_type: data.accountType,
      target_id: data.accountRef,
      risk_level: "high",
      details: { amount: data.amount, currency: data.currency, reason: data.reason } as never,
    } as never);

    return { ok: true };
  });
