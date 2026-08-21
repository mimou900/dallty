import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";
import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/**
 * Project 11 Phase 2: the operational booking actions the Confirmation Center / calendar /
 * appointments dashboard needs that had no real server function before this project —
 * confirmation call history, no-show marking, and a unified staff-side cancellation. Kept in
 * a dedicated file (booking-engine.functions.ts is already the largest domain file in the
 * repo) rather than growing that one further, per the "one file per domain" convention —
 * this is its own operational-actions domain, not core hold/reschedule engine logic.
 *
 * Every mutation here goes through has_permission() (Project 11 Phase 1's resolver) with an
 * owns_business()/legacy-staff-row fallback, matching the same transitional pattern used in
 * rescheduleBooking's fix and createWalkInBooking — real permission enforcement where a
 * business has real membership rows, unchanged access for businesses that don't yet.
 */

async function assertBookingAction(
  supabaseAdmin: AnySupabase,
  context: { userId: string },
  businessId: string,
  branchId: string | null,
  permissionKey: string,
) {
  const { hasPermission } = await import("@/lib/permissions.server");
  const [permitted, { data: owns }, { data: staffRow }] = await Promise.all([
    hasPermission(context as never, businessId, permissionKey, branchId),
    supabaseAdmin.rpc("owns_business", { _user_id: context.userId, _salon_id: businessId }),
    supabaseAdmin
      .from("staff")
      .select("id")
      .eq("user_id", context.userId)
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);
  if (!permitted && !owns && !staffRow) {
    const { logSecurityEvent } = await import("@/lib/security-event.server");
    await logSecurityEvent(supabaseAdmin, {
      actorId: context.userId,
      action: "security.bola_attempt",
      targetType: "business",
      targetId: businessId,
      businessId,
      riskLevel: "high",
      outcome: "denied",
      details: { permissionKey },
    });
    throw new Error("NOT_AUTHORIZED");
  }
}

const recordCallInput = z.object({
  bookingId: z.string().uuid(),
  outcome: z.enum([
    "pending",
    "called",
    "no_answer",
    "confirmed",
    "reschedule_requested",
    "cancelled",
    "wrong_number",
  ]),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Records one confirmation-call attempt (brief §5-7: full call queue history, not the single
 * overwritten summary column recordBookingConfirmation left behind). Also updates the
 * booking's summary confirmation_status to keep it consistent with the richer call-level
 * outcome, using the same summary enum recordBookingConfirmation already writes
 * (not_required/pending/confirmed/unreachable/declined) — reschedule_requested and cancelled
 * outcomes intentionally leave the summary at 'pending' (a reschedule/cancellation is a
 * separate action the UI triggers next, not something this call alone performs).
 */
export const recordConfirmationCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordCallInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("id, business_id, branch_id, confirmation_status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingErr) throw new Error(sanitizeDbError(bookingErr));
    if (!booking) throw new Error("BOOKING_NOT_MODIFIABLE");
    if (booking.confirmation_status === "not_required") throw new Error("BOOKING_NOT_MODIFIABLE");

    await assertBookingAction(
      supabaseAdmin,
      context,
      booking.business_id,
      booking.branch_id,
      "booking.confirm",
    );

    const summaryByOutcome: Record<string, "pending" | "confirmed" | "unreachable" | "declined"> = {
      pending: "pending",
      called: "pending",
      no_answer: "unreachable",
      confirmed: "confirmed",
      reschedule_requested: "pending",
      cancelled: "declined",
      wrong_number: "unreachable",
    };

    const [{ error: callError }] = await Promise.all([
      supabaseAdmin.from("booking_confirmation_calls").insert({
        booking_id: data.bookingId,
        business_id: booking.business_id,
        staff_user_id: context.userId,
        outcome: data.outcome,
        note: data.note ?? null,
      } as never),
      supabaseAdmin
        .from("bookings")
        .update({
          confirmation_status: summaryByOutcome[data.outcome],
          confirmation_attempted_at: new Date().toISOString(),
          confirmed_by: context.userId,
          confirmation_notes: data.note ?? null,
        } as never)
        .eq("id", data.bookingId),
    ]);
    if (callError) throw new Error(sanitizeDbError(callError));

    return { ok: true };
  });

/** Every recorded call attempt for a booking, newest first — the queue's history panel. */
export const listConfirmationCalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("business_id, branch_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingErr) throw new Error(sanitizeDbError(bookingErr));
    if (!booking) return [];

    await assertBookingAction(
      supabaseAdmin,
      context,
      booking.business_id,
      booking.branch_id,
      "booking.confirm",
    );

    const { data: rows, error } = await supabaseAdmin
      .from("booking_confirmation_calls")
      .select("id, staff_user_id, outcome, note, created_at")
      .eq("booking_id", data.bookingId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(sanitizeDbError(error));
    return rows ?? [];
  });

const noShowInput = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Marks a booking as a no-show (brief §28). booking_status.no_show has existed since Project
 * 05 but nothing ever set it — this is its first real writer. The bookings_no_overlap
 * exclusion constraint only covers held/pending/confirmed (see the booking-engine-core
 * migration), so flipping to no_show automatically frees the slot with zero extra logic,
 * same as cancellation.
 *
 * Project 12: reads the business's no_show_charge_policy (brief §87-88 — business/country
 * policy determines financial treatment, never hardcoded) and records which one applied.
 * 'retain_deposit' needs no ledger action — a deposit already collected simply isn't
 * refunded, which is already this codebase's default (no automatic refund exists anywhere).
 * 'full_charge' is recorded as intent only: no payment gateway exists in this environment to
 * actually collect from a no-show customer, so this is honestly a flag for staff to follow
 * up manually, not a fabricated auto-charge.
 */
export const markNoShow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => noShowInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("id, business_id, branch_id, status, payment_status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingErr) throw new Error(sanitizeDbError(bookingErr));
    if (!booking) throw new Error("BOOKING_NOT_MODIFIABLE");
    if (booking.status !== "confirmed") throw new Error("BOOKING_NOT_MODIFIABLE");

    await assertBookingAction(
      supabaseAdmin,
      context,
      booking.business_id,
      booking.branch_id,
      "booking.no_show",
    );

    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("no_show_charge_policy")
      .eq("id", booking.business_id)
      .single();
    const policy = business?.no_show_charge_policy ?? "no_charge";

    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "no_show" } as never)
      .eq("id", data.bookingId)
      .eq("status", "confirmed");
    if (error) throw new Error(sanitizeDbError(error));

    const policyNote =
      policy === "no_charge"
        ? null
        : policy === "retain_deposit"
          ? "Policy: deposit retained (no refund issued)."
          : "Policy: full charge — no payment gateway exists, follow up manually to collect.";

    await Promise.all([
      supabaseAdmin.from("booking_status_history").insert({
        booking_id: data.bookingId,
        business_id: booking.business_id,
        from_status: booking.status,
        to_status: "no_show",
        actor_id: context.userId,
        reason: [data.reason, policyNote].filter(Boolean).join(" ") || null,
      } as never),
      supabaseAdmin.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: "booking.no_show",
        target_type: "booking",
        target_id: data.bookingId,
        business_id: booking.business_id,
        details: {
          reason: data.reason ?? null,
          noShowChargePolicy: policy,
          paymentStatusAtNoShow: booking.payment_status,
        } as never,
      } as never),
    ]);

    return { ok: true, noShowChargePolicy: policy };
  });

const cancelInput = z.object({
  bookingId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Unified staff-side cancellation (brief §27) — replaces the raw client-side
 * `.update({status:"cancelled"})` calls in admin/appointments.tsx with a real, audited,
 * permission-checked function. Deliberately does NOT touch the customer-facing cancellation
 * path (bookings.tsx's own direct update) — that flow was extensively hardened and live-
 * tested in Project 10 days before this project started; migrating it onto this function too
 * is real, separate follow-up work, not bundled in here to avoid destabilizing a just-shipped
 * customer surface for a staff-dashboard-scoped brief.
 */
export const cancelBookingStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("id, business_id, branch_id, status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingErr) throw new Error(sanitizeDbError(bookingErr));
    if (!booking) throw new Error("BOOKING_NOT_MODIFIABLE");
    if (!["pending", "confirmed", "held"].includes(booking.status)) {
      throw new Error("BOOKING_NOT_MODIFIABLE");
    }

    await assertBookingAction(
      supabaseAdmin,
      context,
      booking.business_id,
      booking.branch_id,
      "booking.cancel",
    );

    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "cancelled" } as never)
      .eq("id", data.bookingId)
      .eq("status", booking.status);
    if (error) throw new Error(sanitizeDbError(error));

    await Promise.all([
      supabaseAdmin.from("booking_status_history").insert({
        booking_id: data.bookingId,
        business_id: booking.business_id,
        from_status: booking.status,
        to_status: "cancelled",
        actor_id: context.userId,
        actor_role: "staff",
        reason: data.reason ?? null,
      } as never),
      supabaseAdmin.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: "booking.cancelled_by_staff",
        target_type: "booking",
        target_id: data.bookingId,
        business_id: booking.business_id,
        details: { reason: data.reason ?? null } as never,
      } as never),
    ]);

    return { ok: true };
  });

/** Immutable operational history for a booking — created/confirmed/rescheduled/cancelled/etc. */
export const listBookingHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("business_id, branch_id, customer_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingErr) throw new Error(sanitizeDbError(bookingErr));
    if (!booking) return [];

    if (booking.customer_id !== context.userId) {
      await assertBookingAction(
        supabaseAdmin,
        context,
        booking.business_id,
        booking.branch_id,
        "booking.view",
      );
    }

    const { data: rows, error } = await supabaseAdmin
      .from("booking_status_history")
      .select("id, from_status, to_status, actor_id, actor_role, reason, created_at")
      .eq("booking_id", data.bookingId)
      .order("created_at");
    if (error) throw new Error(sanitizeDbError(error));
    return rows ?? [];
  });
