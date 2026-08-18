import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { sanitizeDbError } from "@/lib/db-error.server";

type AnySupabase = SupabaseClient<Database>;
type AccountType = Database["public"]["Enums"]["ledger_account_type"];
type Direction = Database["public"]["Enums"]["ledger_direction"];

export type LedgerPosting = {
  accountType: AccountType;
  accountRef: string;
  direction: Direction;
  amount: number;
  type: string;
};

/**
 * Posts a balanced group of ledger transactions atomically — a group where debits equal
 * credits (verified before insert, not just hoped for) shares one `transaction_group_id`.
 * This is the ONLY way anything in this codebase writes to `ledger_transactions`; nothing
 * posts a single one-sided row. Amounts under 0.005 are treated as zero rounding noise
 * (currency has 2 decimal places for DZD) rather than a balance mismatch.
 */
export async function postLedgerGroup(
  supabaseAdmin: AnySupabase,
  params: {
    postings: LedgerPosting[];
    currency: string;
    businessId?: string | null;
    bookingId?: string | null;
    paymentId?: string | null;
    actorId: string | null;
    reason?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const debits = params.postings
    .filter((p) => p.direction === "debit")
    .reduce((sum, p) => sum + p.amount, 0);
  const credits = params.postings
    .filter((p) => p.direction === "credit")
    .reduce((sum, p) => sum + p.amount, 0);
  if (Math.abs(debits - credits) > 0.005) {
    throw new Error(
      `Ledger posting not balanced: debits=${debits.toFixed(2)} credits=${credits.toFixed(2)}`,
    );
  }

  const groupId = crypto.randomUUID();
  const rows = params.postings
    .filter((p) => p.amount > 0.005) // skip zero-amount lines (e.g. no tip given)
    .map((p) => ({
      transaction_group_id: groupId,
      account_type: p.accountType,
      account_ref: p.accountRef,
      direction: p.direction,
      amount: Number(p.amount.toFixed(2)),
      currency: params.currency,
      type: p.type,
      business_id: params.businessId ?? null,
      booking_id: params.bookingId ?? null,
      payment_id: params.paymentId ?? null,
      actor_id: params.actorId,
      reason: params.reason ?? null,
      metadata: (params.metadata ?? {}) as never,
    }));

  if (!rows.length) return { groupId, rows: [] };

  const { data, error } = await supabaseAdmin
    .from("ledger_transactions")
    .insert(rows as never)
    .select();
  if (error) throw new Error(sanitizeDbError(error));
  return { groupId, rows: data };
}

/** Resolves the applicable commission rate: business override -> country -> global default. */
export async function resolveCommissionRate(
  supabaseAdmin: AnySupabase,
  businessId: string,
): Promise<number> {
  const { data: business } = await supabaseAdmin
    .from("businesses")
    .select("country_code")
    .eq("id", businessId)
    .single();

  const { data: businessRule } = await supabaseAdmin
    .from("commission_rules")
    .select("rate_percent")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (businessRule) return Number(businessRule.rate_percent);

  if (business?.country_code) {
    const { data: country } = await supabaseAdmin
      .from("countries")
      .select("id")
      .eq("iso_code", business.country_code)
      .maybeSingle();
    if (country) {
      const { data: countryRule } = await supabaseAdmin
        .from("commission_rules")
        .select("rate_percent")
        .eq("country_id", country.id)
        .is("business_id", null)
        .eq("active", true)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (countryRule) return Number(countryRule.rate_percent);
    }
  }

  const { data: globalRule } = await supabaseAdmin
    .from("commission_rules")
    .select("rate_percent")
    .is("country_id", null)
    .is("business_id", null)
    .eq("active", true)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(globalRule?.rate_percent ?? 0);
}

/** Resolves the staff payout rule: staff+service specific -> staff-wide -> business default. */
export async function resolveStaffPayoutRule(
  supabaseAdmin: AnySupabase,
  businessId: string,
  staffId: string,
  serviceId: string,
): Promise<{ fixedAmount: number | null; percentage: number | null } | null> {
  const { data: rules } = await supabaseAdmin
    .from("staff_payout_rules")
    .select("staff_id, service_id, fixed_amount, percentage")
    .eq("business_id", businessId)
    .eq("active", true)
    .or(`staff_id.eq.${staffId},staff_id.is.null`);
  if (!rules?.length) return null;

  const staffAndService = rules.find((r) => r.staff_id === staffId && r.service_id === serviceId);
  if (staffAndService)
    return { fixedAmount: staffAndService.fixed_amount, percentage: staffAndService.percentage };
  const staffWide = rules.find((r) => r.staff_id === staffId && r.service_id === null);
  if (staffWide) return { fixedAmount: staffWide.fixed_amount, percentage: staffWide.percentage };
  const businessDefault = rules.find((r) => r.staff_id === null && r.service_id === null);
  if (businessDefault)
    return { fixedAmount: businessDefault.fixed_amount, percentage: businessDefault.percentage };
  return null;
}

export function computeStaffEarning(
  rule: { fixedAmount: number | null; percentage: number | null } | null,
  serviceRevenue: number,
): number {
  if (!rule) return 0;
  if (rule.percentage != null) return serviceRevenue * (rule.percentage / 100);
  if (rule.fixedAmount != null) return rule.fixedAmount;
  return 0;
}
