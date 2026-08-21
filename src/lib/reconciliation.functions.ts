import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";

/**
 * Project 12 Phase 3: reconciliation (brief §61-62, §98). No such tooling existed before
 * this — `account_balances` is always computed live from `ledger_transactions` (never a
 * cached column to drift), so this isn't "cache vs source" reconciliation; it's a real
 * integrity check between two independently-written record sets that should always agree:
 * every dollar `payments` says was received should have a matching external_cash debit in
 * the ledger, since markCashPayment/collectDepositPayment always write both in the same
 * transaction. A mismatch here means a real bug, not an expected drift — Super Admin only.
 */
export const runReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ businessId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let paymentsQuery = supabaseAdmin
      .from("payments")
      .select("business_id, received_amount")
      .in("status", ["paid", "partially_paid"]);
    let ledgerQuery = supabaseAdmin
      .from("ledger_transactions")
      .select("business_id, amount")
      .eq("account_type", "external_cash")
      .eq("direction", "debit")
      .not("business_id", "is", null);
    if (data.businessId) {
      paymentsQuery = paymentsQuery.eq("business_id", data.businessId);
      ledgerQuery = ledgerQuery.eq("business_id", data.businessId);
    }

    const [{ data: payments, error: paymentsErr }, { data: ledgerRows, error: ledgerErr }] =
      await Promise.all([paymentsQuery, ledgerQuery]);
    if (paymentsErr) throw new Error(sanitizeDbError(paymentsErr));
    if (ledgerErr) throw new Error(sanitizeDbError(ledgerErr));

    const paidByBusiness = new Map<string, number>();
    for (const p of payments ?? []) {
      paidByBusiness.set(
        p.business_id,
        (paidByBusiness.get(p.business_id) ?? 0) + Number(p.received_amount),
      );
    }
    const ledgerByBusiness = new Map<string, number>();
    for (const l of ledgerRows ?? []) {
      const businessId = l.business_id as string;
      ledgerByBusiness.set(businessId, (ledgerByBusiness.get(businessId) ?? 0) + Number(l.amount));
    }

    const businessIds = new Set([...paidByBusiness.keys(), ...ledgerByBusiness.keys()]);
    const { data: businesses } = await supabaseAdmin
      .from("businesses")
      .select("id, name")
      .in("id", [...businessIds]);
    const nameById = new Map((businesses ?? []).map((b) => [b.id, b.name]));

    const rows = [...businessIds].map((id) => {
      const paymentsTotal = Math.round((paidByBusiness.get(id) ?? 0) * 100) / 100;
      const ledgerTotal = Math.round((ledgerByBusiness.get(id) ?? 0) * 100) / 100;
      return {
        businessId: id,
        businessName: nameById.get(id) ?? "Unknown business",
        paymentsTotal,
        ledgerTotal,
        difference: Math.round((paymentsTotal - ledgerTotal) * 100) / 100,
        match: Math.abs(paymentsTotal - ledgerTotal) <= 0.005,
      };
    });

    return {
      rows: rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)),
      checkedAt: new Date().toISOString(),
    };
  });
