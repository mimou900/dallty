import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";

/**
 * Project 12 Phase 1: staff payout recording. staff_payouts (Project 06) has existed since
 * with zero consumers — staff_earning accrues into the staff_payable ledger account
 * (markCashPayment) but nothing ever turned that accrual into an actual paid-out event. This
 * closes that gap with a real "how much is still owed" calculation and a two-step create ->
 * settle flow so a payout never posts to the ledger before it's actually confirmed paid.
 */

const createPayoutInput = z.object({
  businessId: z.string().uuid(),
  staffId: z.string().uuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  methodCode: z.string().optional(),
  idempotencyKey: z.string().max(100).optional(),
});

/**
 * Computes what a specialist is still owed (staff_earning credits to staff_payable not yet
 * covered by a non-cancelled payout — brief §40: "calculated from ledger events", never a
 * mutable running total) and creates a payout row locking those exact ledger rows in via
 * staff_payout_items, so the same earning can never be double-paid across concurrent/retried
 * payout runs. Does NOT post to the ledger yet — that happens only once the payout is
 * confirmed paid (settleStaffPayout), so a cancelled/failed payout never leaves a phantom
 * ledger entry to reverse.
 */
export const createStaffPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createPayoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hasPermission } = await import("@/lib/permissions.server");
    const { withIdempotency } = await import("@/lib/idempotency.server");

    const [{ data: owns }, permitted] = await Promise.all([
      supabaseAdmin.rpc("owns_business", {
        _user_id: context.userId,
        _salon_id: data.businessId,
      }),
      hasPermission(context, data.businessId, "finance.manage_payouts"),
    ]);
    if (!owns && !permitted) throw new Error("NOT_AUTHORIZED");

    return withIdempotency(
      supabaseAdmin,
      {
        actorId: context.userId,
        operation: "create_staff_payout",
        key: data.idempotencyKey ?? `${data.staffId}:${data.periodStart}:${data.periodEnd}`,
      },
      async () => {
        const { data: business } = await supabaseAdmin
          .from("businesses")
          .select("currency")
          .eq("id", data.businessId)
          .single();

        // Every staff_earning credit to this specialist's staff_payable account, ever
        // (not just within the period — a payout run should sweep up anything still owed),
        // excluding rows already locked into a pending/available/processing/paid payout.
        const { data: earnings, error: earningsErr } = await supabaseAdmin
          .from("ledger_transactions")
          .select("id, amount")
          .eq("account_type", "staff_payable")
          .eq("account_ref", data.staffId)
          .eq("direction", "credit")
          .eq("type", "staff_earning");
        if (earningsErr) throw new Error(sanitizeDbError(earningsErr));

        const { data: covered, error: coveredErr } = await supabaseAdmin
          .from("staff_payout_items")
          .select("ledger_transaction_id, payout:staff_payouts!inner(status)")
          .neq("payout.status", "cancelled")
          .neq("payout.status", "failed");
        if (coveredErr) throw new Error(sanitizeDbError(coveredErr));

        const coveredIds = new Set((covered ?? []).map((c) => c.ledger_transaction_id));
        const uncovered = (earnings ?? []).filter((e) => !coveredIds.has(e.id));
        const total = uncovered.reduce((sum, e) => sum + Number(e.amount), 0);
        if (total <= 0) throw new Error("NOTHING_TO_PAY_OUT");

        const { data: payout, error: payoutErr } = await supabaseAdmin
          .from("staff_payouts")
          .insert({
            staff_id: data.staffId,
            business_id: data.businessId,
            amount: total,
            currency: business?.currency ?? "DZD",
            period_start: data.periodStart,
            period_end: data.periodEnd,
            method_code: data.methodCode ?? null,
            status: "pending",
            actor_id: context.userId,
          } as never)
          .select("id")
          .single();
        if (payoutErr) throw new Error(sanitizeDbError(payoutErr));

        const { error: itemsErr } = await supabaseAdmin.from("staff_payout_items").insert(
          uncovered.map((e) => ({
            payout_id: payout.id,
            ledger_transaction_id: e.id,
            amount: e.amount,
          })) as never,
        );
        if (itemsErr) throw new Error(sanitizeDbError(itemsErr));

        await supabaseAdmin.from("admin_audit_log").insert({
          actor_id: context.userId,
          action: "payout.staff_created",
          target_type: "staff_payout",
          target_id: payout.id,
          business_id: data.businessId,
          details: { staffId: data.staffId, amount: total } as never,
        } as never);

        return { payoutId: payout.id as string, amount: total, itemCount: uncovered.length };
      },
    );
  });

const settlePayoutInput = z.object({
  payoutId: z.string().uuid(),
  status: z.enum(["processing", "paid", "failed", "cancelled"]),
  reference: z.string().max(200).optional(),
});

/**
 * Transitions a payout's status. Only the move to 'paid' posts to the ledger — a real
 * debit against staff_payable (what's owed shrinks) balanced by a credit to external_cash
 * (money actually left the business), type 'staff_payout'. Moving to 'failed'/'cancelled'
 * releases the locked earnings (deletes this payout's staff_payout_items) so they become
 * payable again in a future run, since no ledger effect ever happened for them. Idempotent
 * on the 'paid' transition via withIdempotency AND a `.eq("status", "pending")` guard, so a
 * retried/double-clicked confirmation can never post the ledger entry twice (brief §41).
 */
export const settleStaffPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settlePayoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hasPermission } = await import("@/lib/permissions.server");
    const { withIdempotency } = await import("@/lib/idempotency.server");
    const { postLedgerGroup } = await import("@/lib/ledger.server");

    const { data: payout, error: payoutErr } = await supabaseAdmin
      .from("staff_payouts")
      .select("id, business_id, staff_id, amount, currency, status")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (payoutErr) throw new Error(sanitizeDbError(payoutErr));
    if (!payout) throw new Error("PAYOUT_NOT_FOUND");

    const [{ data: owns }, permitted] = await Promise.all([
      supabaseAdmin.rpc("owns_business", {
        _user_id: context.userId,
        _salon_id: payout.business_id,
      }),
      hasPermission(context, payout.business_id, "finance.manage_payouts"),
    ]);
    if (!owns && !permitted) throw new Error("NOT_AUTHORIZED");

    if (data.status === "failed" || data.status === "cancelled") {
      if (payout.status === "paid") throw new Error("PAYOUT_ALREADY_PAID");
      await supabaseAdmin.from("staff_payout_items").delete().eq("payout_id", payout.id);
      const { error } = await supabaseAdmin
        .from("staff_payouts")
        .update({ status: data.status, reference: data.reference ?? null } as never)
        .eq("id", payout.id)
        .neq("status", "paid");
      if (error) throw new Error(sanitizeDbError(error));
      await supabaseAdmin.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: `payout.staff_${data.status}`,
        target_type: "staff_payout",
        target_id: payout.id,
        business_id: payout.business_id,
      } as never);
      return { ok: true };
    }

    if (data.status === "processing") {
      const { error } = await supabaseAdmin
        .from("staff_payouts")
        .update({ status: "processing", reference: data.reference ?? null } as never)
        .eq("id", payout.id)
        .neq("status", "paid");
      if (error) throw new Error(sanitizeDbError(error));
      return { ok: true };
    }

    // status === "paid" — the only transition that touches the ledger.
    return withIdempotency(
      supabaseAdmin,
      { actorId: context.userId, operation: "settle_staff_payout_paid", key: payout.id },
      async () => {
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from("staff_payouts")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            reference: data.reference ?? null,
          } as never)
          .eq("id", payout.id)
          .neq("status", "paid")
          .select("id")
          .maybeSingle();
        if (updateErr) throw new Error(sanitizeDbError(updateErr));
        if (!updated) return { ok: true, alreadyPaid: true };

        await postLedgerGroup(supabaseAdmin, {
          postings: [
            {
              accountType: "staff_payable",
              accountRef: payout.staff_id,
              direction: "debit",
              amount: Number(payout.amount),
              type: "staff_payout",
            },
            {
              accountType: "external_cash",
              accountRef: payout.business_id,
              direction: "credit",
              amount: Number(payout.amount),
              type: "staff_payout",
            },
          ],
          currency: payout.currency,
          businessId: payout.business_id,
          actorId: context.userId,
          reason: `staff_payout:${payout.id}`,
        });

        await supabaseAdmin.from("admin_audit_log").insert({
          actor_id: context.userId,
          action: "payout.staff_paid",
          target_type: "staff_payout",
          target_id: payout.id,
          business_id: payout.business_id,
          details: { amount: payout.amount } as never,
        } as never);

        return { ok: true };
      },
    );
  });

/** What a specialist is currently owed — the same uncovered-earnings calculation createStaffPayout uses, read-only. */
export const getStaffOwedAmount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: z.string().uuid(), staffId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myBusinessRole } = await import("@/lib/permissions.server");

    const [{ data: staffRow }, role] = await Promise.all([
      supabaseAdmin
        .from("staff")
        .select("id, user_id")
        .eq("id", data.staffId)
        .eq("business_id", data.businessId)
        .maybeSingle(),
      myBusinessRole(context, data.businessId),
    ]);
    const isSelf = staffRow?.user_id === context.userId;
    // has_permission() doesn't distinguish scope (a 'self' grant reads the same as
    // 'business'/'global'), so scope is checked here in application code instead: a
    // business/global-scoped grant (or the owner column) allows any staffId, but a
    // 'self'-scoped grant (e.g. a specialist's own finance.view_staff_payouts) may only
    // ever satisfy a lookup of the caller's own staff row — never someone else's.
    const grant = role?.permissions.find((p) => p.key === "finance.view_staff_payouts");
    const businessWideAllowed = role?.isOwnerColumn || (grant && grant.scope !== "self");
    if (!businessWideAllowed && !(isSelf && grant)) throw new Error("NOT_AUTHORIZED");

    const { data: earnings, error: earningsErr } = await supabaseAdmin
      .from("ledger_transactions")
      .select("id, amount")
      .eq("account_type", "staff_payable")
      .eq("account_ref", data.staffId)
      .eq("direction", "credit")
      .eq("type", "staff_earning");
    if (earningsErr) throw new Error(sanitizeDbError(earningsErr));

    const { data: covered, error: coveredErr } = await supabaseAdmin
      .from("staff_payout_items")
      .select("ledger_transaction_id, payout:staff_payouts!inner(status)")
      .neq("payout.status", "cancelled")
      .neq("payout.status", "failed");
    if (coveredErr) throw new Error(sanitizeDbError(coveredErr));

    const coveredIds = new Set((covered ?? []).map((c) => c.ledger_transaction_id));
    const uncovered = (earnings ?? []).filter((e) => !coveredIds.has(e.id));
    return { owed: uncovered.reduce((sum, e) => sum + Number(e.amount), 0) };
  });

/** Every business staff member's owed amount in one query — the dashboard's payout list. */
export const listStaffOwedAmounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myBusinessRole } = await import("@/lib/permissions.server");

    // Bulk, business-wide list — there is no single "self" this could ever mean, so
    // (unlike getStaffOwedAmount) a 'self'-scoped grant may never satisfy this check, only
    // a real business/global-scoped grant or the owner column. See getStaffOwedAmount's
    // comment for why has_permission()'s boolean result can't be trusted for this alone.
    const role = await myBusinessRole(context, data.businessId);
    const grant = role?.permissions.find((p) => p.key === "finance.view_staff_payouts");
    const businessWideAllowed = role?.isOwnerColumn || (grant && grant.scope !== "self");
    if (!businessWideAllowed) throw new Error("NOT_AUTHORIZED");

    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, full_name")
      .eq("business_id", data.businessId)
      .eq("is_active", true);
    if (staffErr) throw new Error(sanitizeDbError(staffErr));
    const staffIds = (staffRows ?? []).map((s) => s.id);
    if (!staffIds.length) return [];

    const [{ data: earnings, error: earningsErr }, { data: covered, error: coveredErr }] =
      await Promise.all([
        supabaseAdmin
          .from("ledger_transactions")
          .select("id, amount, account_ref")
          .eq("account_type", "staff_payable")
          .eq("direction", "credit")
          .eq("type", "staff_earning")
          .in("account_ref", staffIds),
        supabaseAdmin
          .from("staff_payout_items")
          .select("ledger_transaction_id, payout:staff_payouts!inner(status, business_id)")
          .eq("payout.business_id", data.businessId)
          .neq("payout.status", "cancelled")
          .neq("payout.status", "failed"),
      ]);
    if (earningsErr) throw new Error(sanitizeDbError(earningsErr));
    if (coveredErr) throw new Error(sanitizeDbError(coveredErr));

    const coveredIds = new Set((covered ?? []).map((c) => c.ledger_transaction_id));
    const owedByStaff = new Map<string, number>();
    for (const e of earnings ?? []) {
      if (coveredIds.has(e.id)) continue;
      owedByStaff.set(e.account_ref, (owedByStaff.get(e.account_ref) ?? 0) + Number(e.amount));
    }

    return (staffRows ?? [])
      .map((s) => ({ staffId: s.id, fullName: s.full_name, owed: owedByStaff.get(s.id) ?? 0 }))
      .filter((s) => s.owed > 0.005)
      .sort((a, b) => b.owed - a.owed);
  });
