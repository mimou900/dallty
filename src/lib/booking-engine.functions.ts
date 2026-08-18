import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";
import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

const HOLD_DURATION_MINUTES = 15;

/**
 * Errors are thrown with these exact codes as the message so the client can map them to a
 * localized string (brief §64) rather than showing a raw/generic error. Never
 * "Something went wrong" when the reason is known and safe to share (§65).
 */
export const BOOKING_ERROR_CODES = [
  "SLOT_UNAVAILABLE",
  "HOLD_EXPIRED",
  "HOLD_NOT_FOUND",
  "HOLD_NOT_OWNED",
  "SERVICE_UNAVAILABLE",
  "SPECIALIST_UNAVAILABLE",
  "BUSINESS_CLOSED",
  "BOOKING_HORIZON_EXCEEDED",
  "MINIMUM_NOTICE_REQUIRED",
  "BOOKING_NOT_MODIFIABLE",
  "NO_ELIGIBLE_SPECIALIST",
] as const;

/**
 * Resolves selected services' effective duration/price server-side — never trusts a
 * client-supplied total. Reads staff_services.custom_price/custom_duration_minutes, which
 * existed in the schema since an earlier project but were never consulted by any booking
 * path (confirmed dead in Project 00's audit) — this is the first real consumer.
 */
async function resolveServiceLines(
  supabaseAdmin: AnySupabase,
  businessId: string,
  serviceIds: string[],
  staffId: string,
) {
  const { data: services, error: svcErr } = await supabaseAdmin
    .from("services")
    .select("id, name, name_ar, duration_minutes, price, discount_price, is_active, business_id")
    .in("id", serviceIds);
  if (svcErr) throw new Error(sanitizeDbError(svcErr));
  if (!services || services.length !== serviceIds.length) throw new Error("SERVICE_UNAVAILABLE");
  for (const s of services) {
    if (!s.is_active || s.business_id !== businessId) throw new Error("SERVICE_UNAVAILABLE");
  }

  const { data: overrides, error: ovErr } = await supabaseAdmin
    .from("staff_services")
    .select("service_id, custom_price, custom_duration_minutes")
    .eq("staff_id", staffId)
    .in("service_id", serviceIds);
  if (ovErr) throw new Error(sanitizeDbError(ovErr));
  const overrideByService = new Map(
    (overrides ?? []).map(
      (o: {
        service_id: string;
        custom_price: number | null;
        custom_duration_minutes: number | null;
      }) => [o.service_id, o],
    ),
  );

  // Preserve the order the client selected them in, not the DB's arbitrary return order.
  return serviceIds.map((id) => {
    const s = services.find((x: { id: string }) => x.id === id)!;
    const ov = overrideByService.get(id) as
      { custom_price?: number; custom_duration_minutes?: number } | undefined;
    return {
      serviceId: s.id,
      name: s.name as string,
      nameAr: s.name_ar as string | null,
      durationMinutes: ov?.custom_duration_minutes ?? s.duration_minutes,
      price: Number(ov?.custom_price ?? s.discount_price ?? s.price),
    };
  });
}

async function eligibleStaffIds(
  supabaseAdmin: AnySupabase,
  businessId: string,
  serviceIds: string[],
) {
  const { data, error } = await supabaseAdmin
    .from("staff_services")
    .select("staff_id, service_id, staff:staff_id(is_active)")
    .in("service_id", serviceIds);
  if (error) throw new Error(sanitizeDbError(error));
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const staff = row.staff as { is_active?: boolean } | null;
    if (!staff?.is_active) continue;
    counts.set(row.staff_id, (counts.get(row.staff_id) ?? 0) + 1);
  }
  // A staff member qualifies only if they're assigned to EVERY selected service (§16).
  return [...counts.entries()]
    .filter(([, count]) => count === serviceIds.length)
    .map(([staffId]) => staffId)
    .sort(); // stable, deterministic tie-breaker (§15) — not random.
}

const createHoldInput = z.object({
  businessId: z.string().uuid(),
  serviceIds: z.array(z.string().uuid()).min(1).max(10),
  staffId: z.string().uuid().nullable(), // null = "any specialist"
  startsAt: z.string().datetime(),
});

/**
 * Creates a server-side 15-minute hold. The ONLY thing that makes this safe under
 * concurrent requests is the `bookings_no_overlap` exclusion constraint (see the booking-
 * engine-core migration) — this function does not itself implement locking; it just issues
 * one INSERT per candidate and lets Postgres decide atomically. Never trusts client-supplied
 * price/duration/end-time (§12) — everything is recomputed here from `services`/
 * `staff_services`.
 */
export const createBookingHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createHoldInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { logSecurityEvent } = await import("@/lib/security-event.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    // Repeated-hold abuse guard (§63) — generous enough for normal browsing/retries.
    await assertRateLimit(supabaseAdmin, `create_hold:${context.userId}`, 20, 10);
    await assertRateLimit(supabaseAdmin, `create_hold_ip:${ip}`, 40, 10);

    await supabaseAdmin.rpc("sweep_expired_holds");

    const { data: business, error: bizErr } = await supabaseAdmin
      .from("businesses")
      .select(
        "id, timezone, currency, min_notice_hours, max_booking_days, booking_confirmation, hold_minutes, country_code",
      )
      .eq("id", data.businessId)
      .maybeSingle();
    if (bizErr) throw new Error(sanitizeDbError(bizErr));
    if (!business) throw new Error("BUSINESS_CLOSED");

    // Hold duration: business override -> country default -> hardcoded fallback (brief §26:
    // "Super-Admin/country configurable", same hierarchy shape as the buffer resolution).
    let holdMinutes = business.hold_minutes ?? HOLD_DURATION_MINUTES;
    if (business.hold_minutes == null) {
      const { data: country } = await supabaseAdmin
        .from("countries")
        .select("default_hold_minutes")
        .eq("iso_code", business.country_code)
        .maybeSingle();
      if (country?.default_hold_minutes != null) holdMinutes = country.default_hold_minutes;
    }

    // Every booking must resolve to a specific branch. Until Phase 6 adds a branch picker to
    // the customer flow, every hold is created at the business's Main branch — the same
    // placeholder pattern used everywhere else in Project 09 Phase 1/2.
    const { resolveMainBranchId } = await import("@/lib/branch.server");
    const branchId = await resolveMainBranchId(supabaseAdmin, data.businessId);

    const startsAt = new Date(data.startsAt);
    const minNoticeMs = (business.min_notice_hours ?? 0) * 3600_000;
    if (startsAt.getTime() < Date.now() + minNoticeMs) throw new Error("MINIMUM_NOTICE_REQUIRED");
    const horizonMs = (business.max_booking_days ?? 60) * 86_400_000;
    if (startsAt.getTime() > Date.now() + horizonMs) throw new Error("BOOKING_HORIZON_EXCEEDED");

    // Resolve candidate staff (either the one explicit choice, or every eligible "any
    // specialist" candidate) BEFORE resolving prices, since price/duration can differ per
    // staff member (custom overrides).
    let candidates: string[];
    if (data.staffId) {
      const eligible = await eligibleStaffIds(supabaseAdmin, data.businessId, data.serviceIds);
      if (!eligible.includes(data.staffId)) throw new Error("SPECIALIST_UNAVAILABLE");
      candidates = [data.staffId];
    } else {
      candidates = await eligibleStaffIds(supabaseAdmin, data.businessId, data.serviceIds);
      if (!candidates.length) throw new Error("NO_ELIGIBLE_SPECIALIST");
    }

    const expiresAt = new Date(Date.now() + holdMinutes * 60_000);
    let lastError: unknown = null;

    for (const staffId of candidates) {
      const lines = await resolveServiceLines(
        supabaseAdmin,
        data.businessId,
        data.serviceIds,
        staffId,
      );
      const totalDuration = lines.reduce((sum, l) => sum + l.durationMinutes, 0);
      const { data: bufferMinutes } = await supabaseAdmin.rpc("resolve_buffer_minutes", {
        _business_id: data.businessId,
        _branch_id: branchId,
        _service_id: lines[0].serviceId,
      });
      const endsAt = new Date(startsAt.getTime() + (totalDuration + (bufferMinutes ?? 0)) * 60_000);
      const totalPrice = lines.reduce((sum, l) => sum + l.price, 0);

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("bookings")
        .insert({
          customer_id: context.userId,
          business_id: data.businessId,
          branch_id: branchId,
          service_id: lines[0].serviceId,
          staff_id: staffId,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          status: "held",
          hold_expires_at: expiresAt.toISOString(),
          total_price: totalPrice,
        } as never)
        .select("id, reference")
        .single();

      if (!insertErr) {
        await supabaseAdmin.from("booking_items").insert(
          lines.map((l, i) => ({
            booking_id: inserted.id,
            service_id: l.serviceId,
            service_name: l.name,
            service_name_ar: l.nameAr,
            duration_minutes: l.durationMinutes,
            price: l.price,
            currency: business.currency,
            staff_id: staffId,
            business_id: data.businessId,
            sort_order: i,
          })) as never,
        );
        await supabaseAdmin.from("admin_audit_log").insert({
          actor_id: context.userId,
          action: "booking.held",
          target_type: "booking",
          target_id: inserted.id,
          business_id: data.businessId,
          details: { staffId, serviceIds: data.serviceIds, startsAt: data.startsAt } as never,
        } as never);

        return {
          holdId: inserted.id as string,
          reference: inserted.reference as string,
          staffId,
          expiresAt: expiresAt.toISOString(),
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          totalPrice,
          currency: business.currency,
          items: lines,
        };
      }

      lastError = insertErr;
      // 23505/23P01 = unique/exclusion violation -> this candidate's slot is taken, try the
      // next one. Any other error is a real failure, not a "try the next candidate" signal.
      const code = (insertErr as { code?: string }).code;
      if (code !== "23505" && code !== "23P01") throw new Error(sanitizeDbError(insertErr));
    }

    await logSecurityEvent(supabaseAdmin, {
      actorId: context.userId,
      action: "booking.slot_unavailable",
      targetType: "booking_hold",
      businessId: data.businessId,
      riskLevel: "low",
      outcome: "denied",
      details: { candidatesTried: candidates.length, lastError: (lastError as Error)?.message },
    });
    throw new Error("SLOT_UNAVAILABLE");
  });

const confirmHoldInput = z.object({
  holdId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(100).optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** Confirms a held slot into a real booking. Re-validates everything — never trusts the hold blindly. */
export const confirmBookingHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => confirmHoldInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withIdempotency } = await import("@/lib/idempotency.server");

    return withIdempotency(
      supabaseAdmin,
      {
        actorId: context.userId,
        operation: "confirm_booking_hold",
        key: data.idempotencyKey ?? data.holdId,
      },
      async () => {
        const { data: hold, error: holdErr } = await supabaseAdmin
          .from("bookings")
          .select("id, status, hold_expires_at, customer_id, business_id, staff_id")
          .eq("id", data.holdId)
          .maybeSingle();
        if (holdErr) throw new Error(sanitizeDbError(holdErr));
        if (!hold) throw new Error("HOLD_NOT_FOUND");
        if (hold.customer_id !== context.userId) throw new Error("HOLD_NOT_OWNED");
        if (hold.status !== "held") throw new Error("HOLD_NOT_FOUND");
        if (!hold.hold_expires_at || new Date(hold.hold_expires_at) <= new Date()) {
          await supabaseAdmin
            .from("bookings")
            .update({ status: "expired" } as never)
            .eq("id", hold.id);
          throw new Error("HOLD_EXPIRED");
        }

        const { data: business } = await supabaseAdmin
          .from("businesses")
          .select("booking_confirmation")
          .eq("id", hold.business_id)
          .single();
        const finalStatus =
          business?.booking_confirmation === "automatic" ? "confirmed" : "pending";

        // The WHERE clause (status='held' AND hold_expires_at > now()) is the actual
        // concurrency-safe re-check, not the SELECT above — the SELECT is only for a
        // friendly error message. If two confirm calls raced (shouldn't happen for the
        // same hold owned by one customer, but defense in depth), only one UPDATE matches.
        const { data: updated, error: updateErr } = await supabaseAdmin
          .from("bookings")
          .update({
            status: finalStatus,
            hold_expires_at: null,
            customer_name: data.customerName ?? null,
            customer_phone: data.customerPhone ?? null,
            notes: data.notes ?? null,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("id", hold.id)
          .eq("status", "held")
          .gt("hold_expires_at", new Date().toISOString())
          .select("id, reference, starts_at, ends_at, status, total_price")
          .single();
        if (updateErr || !updated) throw new Error("HOLD_EXPIRED");

        await supabaseAdmin.from("admin_audit_log").insert({
          actor_id: context.userId,
          action: "booking.confirmed",
          target_type: "booking",
          target_id: hold.id,
          business_id: hold.business_id,
          details: { finalStatus } as never,
        } as never);

        return updated;
      },
    );
  });

const cancelHoldInput = z.object({ holdId: z.string().uuid() });

/** Releases a hold early (customer backed out before it expired). */
export const cancelBookingHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => cancelHoldInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "expired" } as never)
      .eq("id", data.holdId)
      .eq("customer_id", context.userId)
      .eq("status", "held");
    if (error) throw new Error(sanitizeDbError(error));
    return { ok: true };
  });

const rescheduleInput = z.object({
  bookingId: z.string().uuid(),
  newStartsAt: z.string().datetime(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Reschedules via the atomic `reschedule_booking()` DB function (see the booking-engine-
 * core migration) — the new slot is secured before the old one is released, in one
 * transaction, so a failed reschedule never loses the customer's original booking (§43).
 */
export const rescheduleBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rescheduleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: old, error: oldErr } = await supabaseAdmin
      .from("bookings")
      .select("id, service_id, staff_id, branch_id")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (oldErr) throw new Error(sanitizeDbError(oldErr));
    if (!old) throw new Error("BOOKING_NOT_MODIFIABLE");

    const { data: svc } = await supabaseAdmin
      .from("services")
      .select("duration_minutes")
      .eq("id", old.service_id)
      .single();
    const { data: staffRow } = await supabaseAdmin
      .from("staff")
      .select("business_id")
      .eq("id", old.staff_id)
      .single();
    if (!staffRow) throw new Error("BOOKING_NOT_MODIFIABLE");
    const { data: bufferMinutes } = await supabaseAdmin.rpc("resolve_buffer_minutes", {
      _business_id: staffRow.business_id,
      _branch_id: old.branch_id,
      _service_id: old.service_id,
    });
    const newStart = new Date(data.newStartsAt);
    const newEnd = new Date(
      newStart.getTime() + ((svc?.duration_minutes ?? 30) + (bufferMinutes ?? 0)) * 60_000,
    );

    const { data: result, error } = await supabaseAdmin.rpc("reschedule_booking", {
      _booking_id: data.bookingId,
      _new_starts_at: newStart.toISOString(),
      _new_ends_at: newEnd.toISOString(),
      _actor_id: context.userId,
      _reason: data.reason,
    });
    if (error) {
      if (error.code === "23P01") throw new Error("SLOT_UNAVAILABLE");
      throw new Error(sanitizeDbError(error));
    }
    return result;
  });
