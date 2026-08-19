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
 * localized string (Project 10 brief §64-65) rather than showing a raw/generic error, RPC
 * name, or Postgres detail. Shared by both the signed-in and guest hold/confirm paths — a
 * guest and a signed-in customer hitting the same failure see the same code.
 */
export const BOOKING_ERROR_CODES = [
  "SLOT_UNAVAILABLE",
  "HOLD_EXPIRED",
  "BOOKING_NOT_FOUND",
  "UNAUTHORIZED_BOOKING",
  "BOOKING_ALREADY_CONFIRMED",
  "INVALID_BOOKING_CONTEXT",
  "SERVICE_UNAVAILABLE",
  "SPECIALIST_UNAVAILABLE",
  "BUSINESS_CLOSED",
  "BOOKING_HORIZON_EXCEEDED",
  "MINIMUM_NOTICE_REQUIRED",
  "BOOKING_NOT_MODIFIABLE",
  "NO_ELIGIBLE_SPECIALIST",
  "BOOKING_LIMIT_REACHED",
  "BOOKING_CONFIRMATION_FAILED",
] as const;

/**
 * Resolves a business-supplied (client-requested, never trusted blindly) branch id, or falls
 * back to the business's Main branch when the client didn't send one (e.g. single-branch
 * businesses never show a branch picker — Project 09 Phase 6). The browser is never
 * authoritative for which branch a booking lands in (Project 10 brief §2) — this re-validates
 * that the id, if supplied, is actually an active branch of THIS business before using it.
 */
async function resolveBranchId(
  supabaseAdmin: AnySupabase,
  businessId: string,
  requestedBranchId: string | null | undefined,
) {
  if (!requestedBranchId) {
    const { resolveMainBranchId } = await import("@/lib/branch.server");
    return resolveMainBranchId(supabaseAdmin, businessId);
  }
  const { data, error } = await supabaseAdmin
    .from("business_branches")
    .select("id")
    .eq("id", requestedBranchId)
    .eq("business_id", businessId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(sanitizeDbError(error));
  if (!data) throw new Error("INVALID_BOOKING_CONTEXT");
  return data.id;
}

/**
 * Resolves selected services' effective duration/price server-side — never trusts a
 * client-supplied total. Branch-aware pricing hierarchy (most specific wins, same nullable-
 * override shape used everywhere else in the branch schema — Project 09 Phase 1):
 *   1. staff_services row scoped to THIS branch (staff_id, service_id, branch_id = _branchId)
 *   2. staff_services row with branch_id IS NULL (staff's global custom price/duration)
 *   3. branch_services row for (branchId, serviceId) — business's branch-level override
 *   4. services.discount_price / services.price / services.duration_minutes — the base default
 * Closes the previously-documented Project 09 gap: branch_services existed since Phase 1 but
 * was never consulted by the actual booking-price-resolution path (recorded PENDING in the
 * master architecture doc's Project 09 entry) — this is the first real consumer.
 */
async function resolveServiceLines(
  supabaseAdmin: AnySupabase,
  businessId: string,
  branchId: string,
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

  const [{ data: staffOverrides, error: ovErr }, { data: branchOverrides, error: brErr }] =
    await Promise.all([
      supabaseAdmin
        .from("staff_services")
        .select("service_id, branch_id, custom_price, custom_duration_minutes")
        .eq("staff_id", staffId)
        .in("service_id", serviceIds),
      supabaseAdmin
        .from("branch_services")
        .select("service_id, price, duration_minutes")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .in("service_id", serviceIds),
    ]);
  if (ovErr) throw new Error(sanitizeDbError(ovErr));
  if (brErr) throw new Error(sanitizeDbError(brErr));

  const branchOverrideByService = new Map((branchOverrides ?? []).map((o) => [o.service_id, o]));
  // Prefer the branch-specific staff_services row over the staff's global one when both exist.
  const staffOverrideByService = new Map<
    string,
    { custom_price: number | null; custom_duration_minutes: number | null }
  >();
  for (const o of staffOverrides ?? []) {
    const existing = staffOverrideByService.get(o.service_id);
    if (!existing || o.branch_id === branchId) {
      staffOverrideByService.set(o.service_id, o);
    }
  }

  // Preserve the order the client selected them in, not the DB's arbitrary return order.
  return serviceIds.map((id) => {
    const s = services.find((x: { id: string }) => x.id === id)!;
    const staffOv = staffOverrideByService.get(id);
    const branchOv = branchOverrideByService.get(id);
    return {
      serviceId: s.id,
      name: s.name as string,
      nameAr: s.name_ar as string | null,
      durationMinutes:
        staffOv?.custom_duration_minutes ?? branchOv?.duration_minutes ?? s.duration_minutes,
      price: Number(staffOv?.custom_price ?? branchOv?.price ?? s.discount_price ?? s.price),
    };
  });
}

/** Staff eligible for every selected service AND actually assigned to the requested branch —
 * never offers (or lets a hold be created against) a specialist who doesn't work there
 * (Project 10 brief §2: branch is never client-authoritative). */
async function eligibleStaffIds(
  supabaseAdmin: AnySupabase,
  branchId: string,
  serviceIds: string[],
) {
  const [{ data: svcRows, error: svcErr }, { data: branchRows, error: branchErr }] =
    await Promise.all([
      supabaseAdmin
        .from("staff_services")
        .select("staff_id, service_id, staff:staff_id(is_active)")
        .in("service_id", serviceIds),
      supabaseAdmin.from("staff_branches").select("staff_id").eq("branch_id", branchId),
    ]);
  if (svcErr) throw new Error(sanitizeDbError(svcErr));
  if (branchErr) throw new Error(sanitizeDbError(branchErr));

  const branchStaffIds = new Set((branchRows ?? []).map((r) => r.staff_id));
  const counts = new Map<string, number>();
  for (const row of svcRows ?? []) {
    const staff = row.staff as { is_active?: boolean } | null;
    if (!staff?.is_active || !branchStaffIds.has(row.staff_id)) continue;
    counts.set(row.staff_id, (counts.get(row.staff_id) ?? 0) + 1);
  }
  // A staff member qualifies only if they're assigned to EVERY selected service (§16).
  return [...counts.entries()]
    .filter(([, count]) => count === serviceIds.length)
    .map(([staffId]) => staffId)
    .sort(); // stable, deterministic tie-breaker (§15) — not random.
}

const holdInputShape = {
  businessId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  serviceIds: z.array(z.string().uuid()).min(1).max(10),
  staffId: z.string().uuid().nullable(), // null = "any specialist"
  startsAt: z.string().datetime(),
};
const createHoldInput = z.object(holdInputShape);
// Guest holds are created anonymously -- same as a signed-in customer's hold, the slot locks
// the instant a time is picked, before any contact details exist. Identity is collected only
// at confirm time (confirmGuestHoldInput below), never as a precondition of holding.
const createGuestHoldInput = z.object(holdInputShape);

type HoldParams = {
  businessId: string;
  branchId?: string | null;
  serviceIds: string[];
  staffId: string | null;
  startsAt: string;
  actorUserId: string | null;
  guestToken: string | null;
};

/**
 * Creates a server-side hold. The ONLY thing that makes this safe under concurrent requests is
 * the `bookings_no_overlap` exclusion constraint (see the booking-engine-core migration) — this
 * function does not itself implement locking; it just issues one INSERT per candidate and lets
 * Postgres decide atomically. Never trusts client-supplied price/duration/end-time/branch (§12)
 * — everything is recomputed here from `services`/`staff_services`/`branch_services`.
 *
 * Shared core for both the signed-in (createBookingHold) and guest (createGuestBookingHold)
 * entry points — same engine, same safety guarantees, different ownership mechanism only
 * (customer_id for signed-in, a random guest_hold_token for guests — Project 10 brief §12/§74).
 */
async function holdCore(supabaseAdmin: AnySupabase, params: HoldParams) {
  const { logSecurityEvent } = await import("@/lib/security-event.server");
  await supabaseAdmin.rpc("sweep_expired_holds");

  const { data: business, error: bizErr } = await supabaseAdmin
    .from("businesses")
    .select(
      "id, timezone, currency, min_notice_hours, max_booking_days, booking_confirmation, hold_minutes, country_code",
    )
    .eq("id", params.businessId)
    .maybeSingle();
  if (bizErr) throw new Error(sanitizeDbError(bizErr));
  if (!business) throw new Error("BUSINESS_CLOSED");

  // Hold duration: business override -> country default -> hardcoded fallback (brief §26).
  let holdMinutes = business.hold_minutes ?? HOLD_DURATION_MINUTES;
  if (business.hold_minutes == null) {
    const { data: country } = await supabaseAdmin
      .from("countries")
      .select("default_hold_minutes")
      .eq("iso_code", business.country_code)
      .maybeSingle();
    if (country?.default_hold_minutes != null) holdMinutes = country.default_hold_minutes;
  }

  const branchId = await resolveBranchId(supabaseAdmin, params.businessId, params.branchId);

  const startsAt = new Date(params.startsAt);
  const minNoticeMs = (business.min_notice_hours ?? 0) * 3600_000;
  if (startsAt.getTime() < Date.now() + minNoticeMs) throw new Error("MINIMUM_NOTICE_REQUIRED");
  const horizonMs = (business.max_booking_days ?? 60) * 86_400_000;
  if (startsAt.getTime() > Date.now() + horizonMs) throw new Error("BOOKING_HORIZON_EXCEEDED");

  // Resolve candidate staff (either the one explicit choice, or every eligible "any
  // specialist" candidate) BEFORE resolving prices, since price/duration can differ per
  // staff member (custom overrides).
  let candidates: string[];
  const eligible = await eligibleStaffIds(supabaseAdmin, branchId, params.serviceIds);
  if (params.staffId) {
    if (!eligible.includes(params.staffId)) throw new Error("SPECIALIST_UNAVAILABLE");
    candidates = [params.staffId];
  } else {
    if (!eligible.length) throw new Error("NO_ELIGIBLE_SPECIALIST");
    candidates = eligible;
  }

  const expiresAt = new Date(Date.now() + holdMinutes * 60_000);
  let lastError: unknown = null;

  for (const staffId of candidates) {
    const lines = await resolveServiceLines(
      supabaseAdmin,
      params.businessId,
      branchId,
      params.serviceIds,
      staffId,
    );
    const totalDuration = lines.reduce((sum, l) => sum + l.durationMinutes, 0);
    const { data: bufferMinutes } = await supabaseAdmin.rpc("resolve_buffer_minutes", {
      _business_id: params.businessId,
      _branch_id: branchId,
      _service_id: lines[0].serviceId,
    });
    const endsAt = new Date(startsAt.getTime() + (totalDuration + (bufferMinutes ?? 0)) * 60_000);
    // A coupon, if any, is resolved and applied at CONFIRM time (confirmCore), not here — the
    // hold is created the instant a time is picked, before the customer has reached the
    // confirmation step where they'd even type a code, and price must be re-validated at
    // confirm regardless of what it was at hold time (a code can expire/exhaust in between).
    const totalPrice = lines.reduce((sum, l) => sum + l.price, 0);

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        customer_id: params.actorUserId,
        guest_hold_token: params.guestToken,
        business_id: params.businessId,
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
          business_id: params.businessId,
          sort_order: i,
        })) as never,
      );
      if (params.actorUserId) {
        await supabaseAdmin.from("admin_audit_log").insert({
          actor_id: params.actorUserId,
          action: "booking.held",
          target_type: "booking",
          target_id: inserted.id,
          business_id: params.businessId,
          details: {
            staffId,
            branchId,
            serviceIds: params.serviceIds,
            startsAt: params.startsAt,
          } as never,
        } as never);
      }

      return {
        holdId: inserted.id as string,
        reference: inserted.reference as string,
        staffId,
        branchId,
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
    actorId: params.actorUserId,
    action: "booking.slot_unavailable",
    targetType: "booking_hold",
    businessId: params.businessId,
    riskLevel: "low",
    outcome: "denied",
    details: { candidatesTried: candidates.length, lastError: (lastError as Error)?.message },
  });
  throw new Error("SLOT_UNAVAILABLE");
}

export const createBookingHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createHoldInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    // Repeated-hold abuse guard (§63) — generous enough for normal browsing/retries.
    await assertRateLimit(supabaseAdmin, `create_hold:${context.userId}`, 20, 10);
    await assertRateLimit(supabaseAdmin, `create_hold_ip:${ip}`, 40, 10);

    return holdCore(supabaseAdmin, { ...data, actorUserId: context.userId, guestToken: null });
  });

/**
 * Guest equivalent of createBookingHold — no Supabase session at all. Ownership of the hold is
 * proven by a server-generated random token (never client-supplied, never guessable) returned
 * once in this response and required back on confirm/cancel, the same shape as every other
 * capability-token pattern in this codebase (Project 10 brief §12/§74: guests are not exempt
 * from the hold->confirm rework).
 */
export const createGuestBookingHold = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createGuestHoldInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `create_guest_hold_ip:${ip}`, 15, 10);

    const guestToken = crypto.randomUUID();
    const result = await holdCore(supabaseAdmin, { ...data, actorUserId: null, guestToken });
    return { ...result, guestToken };
  });

const confirmHoldInput = z.object({
  holdId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(100).optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().max(20).optional(),
  couponCode: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

type ConfirmParams = {
  holdId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  couponCode?: string;
  notes?: string | null;
  ownerCheck: (hold: { customer_id: string | null; guest_hold_token: string | null }) => boolean;
  actorUserId: string | null;
};

/**
 * Confirms a held slot into a real booking. Re-validates everything — never trusts the hold
 * blindly, and never assumes that because a hold existed a moment ago it's still valid without
 * checking again right now (§ "never assume a hold is still valid"). Shared core for both the
 * signed-in and guest confirm entry points.
 */
async function confirmCore(supabaseAdmin: AnySupabase, params: ConfirmParams) {
  const { data: hold, error: holdErr } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, status, hold_expires_at, customer_id, guest_hold_token, business_id, staff_id, total_price",
    )
    .eq("id", params.holdId)
    .maybeSingle();
  if (holdErr) throw new Error(sanitizeDbError(holdErr));
  if (!hold) throw new Error("BOOKING_NOT_FOUND");
  if (!params.ownerCheck(hold)) throw new Error("UNAUTHORIZED_BOOKING");
  if (hold.status === "pending" || hold.status === "confirmed") {
    throw new Error("BOOKING_ALREADY_CONFIRMED");
  }
  if (hold.status !== "held") throw new Error("BOOKING_NOT_FOUND");
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
  const finalStatus = business?.booking_confirmation === "automatic" ? "confirmed" : "pending";

  // Coupon is resolved fresh from the live promotions table right now, at confirm time — never
  // trusted from what the client showed earlier, and never carried over from hold creation
  // (the hold predates the confirm step in the UI, so it was never applied there). A code that
  // was valid a moment ago but has since expired/exhausted is simply not applied, same as the
  // pre-existing checkPromoCode preview behavior — this never blocks the booking itself.
  const basePrice = Number(hold.total_price);
  let finalPrice = basePrice;
  let originalPrice: number | null = null;
  let discountAmount = 0;
  let promotionId: string | null = null;
  if (params.couponCode) {
    const { data: rows } = await supabaseAdmin.rpc("check_promo_code", {
      _salon_id: hold.business_id,
      _code: params.couponCode,
      _amount: basePrice,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.valid && row.promotion_id) {
      originalPrice = basePrice;
      discountAmount = Number(row.discount);
      finalPrice = Number(row.final_price);
      promotionId = row.promotion_id;
    }
  }

  // The WHERE clause (status='held' AND hold_expires_at > now()) is the actual
  // concurrency-safe re-check, not the SELECT above — the SELECT is only for a friendly
  // error message. If two confirm calls raced for the same hold, only one UPDATE matches.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("bookings")
    .update({
      status: finalStatus,
      hold_expires_at: null,
      total_price: finalPrice,
      original_price: originalPrice,
      discount_amount: discountAmount,
      promotion_id: promotionId,
      customer_name: params.customerName ?? null,
      customer_phone: params.customerPhone ?? null,
      customer_email: params.customerEmail ?? null,
      notes: params.notes ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", hold.id)
    .eq("status", "held")
    .gt("hold_expires_at", new Date().toISOString())
    .select("id, reference, starts_at, ends_at, status, total_price")
    .single();
  if (updateErr || !updated) throw new Error("HOLD_EXPIRED");

  if (params.actorUserId) {
    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: params.actorUserId,
      action: "booking.confirmed",
      target_type: "booking",
      target_id: hold.id,
      business_id: hold.business_id,
      details: { finalStatus } as never,
    } as never);
  }

  return updated;
}

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
      () =>
        confirmCore(supabaseAdmin, {
          holdId: data.holdId,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          couponCode: data.couponCode,
          notes: data.notes,
          actorUserId: context.userId,
          ownerCheck: (hold) => hold.customer_id === context.userId,
        }),
    );
  });

const confirmGuestHoldInput = z.object({
  holdId: z.string().uuid(),
  guestToken: z.string().min(1).max(100),
  idempotencyKey: z.string().min(1).max(100).optional(),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Invalid phone"),
  customerEmail: z.string().trim().email().max(255).optional(),
  couponCode: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/**
 * Guest equivalent of confirmBookingHold. Ownership is the guest_hold_token returned by
 * createGuestBookingHold — never a client-supplied customer id (§ "never trust a forged
 * customer_id"). Idempotency keys the guest as `actor_id = null`, which is safe because the
 * key itself defaults to the (globally unique) holdId — two different guests can never collide.
 */
export const confirmGuestBookingHold = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => confirmGuestHoldInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withIdempotency } = await import("@/lib/idempotency.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `confirm_guest_hold_ip:${ip}`, 20, 10);

    return withIdempotency(
      supabaseAdmin,
      {
        actorId: null,
        operation: "confirm_booking_hold_guest",
        key: data.idempotencyKey ?? data.holdId,
      },
      () =>
        confirmCore(supabaseAdmin, {
          holdId: data.holdId,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail,
          couponCode: data.couponCode,
          notes: data.notes,
          actorUserId: null,
          ownerCheck: (hold) =>
            hold.customer_id === null && hold.guest_hold_token === data.guestToken,
        }),
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

const cancelGuestHoldInput = z.object({
  holdId: z.string().uuid(),
  guestToken: z.string().min(1).max(100),
});

/** Guest equivalent of cancelBookingHold — same guest_hold_token ownership check as confirm. */
export const cancelGuestBookingHold = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => cancelGuestHoldInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "expired" } as never)
      .eq("id", data.holdId)
      .eq("guest_hold_token", data.guestToken)
      .is("customer_id", null)
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

const recordConfirmationInput = z.object({
  bookingId: z.string().uuid(),
  outcome: z.enum(["confirmed", "unreachable", "declined"]),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Records the outcome of a pre-appointment confirmation call (Project 09 Phase 4). Any staff
 * member or the owner of the booking's business can record it — front-desk staff typically
 * make these calls, not necessarily the assigned specialist. Refuses bookings whose
 * confirmation_status is 'not_required': either the business never opted into confirmation
 * calls, or this booking predates that opt-in — recording an outcome for either would be
 * meaningless and could mask the real state to whoever reads it next.
 */
export const recordBookingConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordConfirmationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .select("id, business_id, confirmation_status")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (bookingErr) throw new Error(sanitizeDbError(bookingErr));
    if (!booking) throw new Error("BOOKING_NOT_MODIFIABLE");
    if (booking.confirmation_status === "not_required") throw new Error("BOOKING_NOT_MODIFIABLE");

    const [{ data: owns }, { data: staffRow }] = await Promise.all([
      supabaseAdmin.rpc("owns_business", {
        _user_id: context.userId,
        _salon_id: booking.business_id,
      }),
      supabaseAdmin
        .from("staff")
        .select("id")
        .eq("user_id", context.userId)
        .eq("business_id", booking.business_id)
        .maybeSingle(),
    ]);
    if (!owns && !staffRow) throw new Error("BOOKING_NOT_MODIFIABLE");

    const { error } = await supabaseAdmin
      .from("bookings")
      .update({
        confirmation_status: data.outcome,
        confirmation_attempted_at: new Date().toISOString(),
        confirmed_by: context.userId,
        confirmation_notes: data.notes ?? null,
      } as never)
      .eq("id", data.bookingId);
    if (error) throw new Error(sanitizeDbError(error));

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "booking.confirmation_recorded",
      target_type: "booking",
      target_id: data.bookingId,
      business_id: booking.business_id,
      details: { outcome: data.outcome } as never,
    } as never);

    return { ok: true };
  });

const walkInInput = z
  .object({
    businessId: z.string().uuid(),
    branchId: z.string().uuid().optional(), // omit -> business's Main branch
    serviceIds: z.array(z.string().uuid()).min(1).max(10),
    staffId: z.string().uuid(),
    startsAt: z.string().datetime().optional(), // omit -> right now
    customerId: z.string().uuid().optional(), // a returning customer with no appointment
    customerName: z.string().trim().min(1).max(120).optional(),
    customerPhone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, "Invalid phone")
      .optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.customerId || (v.customerName && v.customerPhone), {
    message: "A walk-in needs either an existing customer or a name and phone number",
  });

/**
 * Books a walk-in — someone being served (or about to be) who never went through the online
 * hold flow, whether or not they have a Dallty account (brief §31: staff walk-ins, guest
 * customers). Any staff member or the business owner can create one for any specialist at the
 * business, not just their own calendar — reception typically books walk-ins on behalf of
 * whichever specialist is free, which createMyAppointment (staff-desk.functions.ts) doesn't
 * cover since it's scoped to the signed-in specialist's own bookings only.
 *
 * Goes straight to 'confirmed', skipping the hold-then-confirm dance entirely: the customer is
 * already physically present (or about to be), so there's nothing to hold a slot against. The
 * bookings_no_overlap exclusion constraint still protects against double-booking the specialist
 * against a concurrent online booking.
 *
 * Explicitly exempted from the Project 10 customer-facing hold->confirm rework (brief §75) —
 * this is a staff-authorized workflow, not a customer-facing one, so it keeps its own shape.
 */
export const createWalkInBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => walkInInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: owns }, { data: staffRow }] = await Promise.all([
      supabaseAdmin.rpc("owns_business", {
        _user_id: context.userId,
        _salon_id: data.businessId,
      }),
      supabaseAdmin
        .from("staff")
        .select("id")
        .eq("user_id", context.userId)
        .eq("business_id", data.businessId)
        .maybeSingle(),
    ]);
    if (!owns && !staffRow) throw new Error("NOT_AUTHORIZED");

    const { resolveMainBranchId } = await import("@/lib/branch.server");
    const branchId = data.branchId ?? (await resolveMainBranchId(supabaseAdmin, data.businessId));

    const { data: staffBranch } = await supabaseAdmin
      .from("staff_branches")
      .select("staff_id")
      .eq("staff_id", data.staffId)
      .eq("branch_id", branchId)
      .maybeSingle();
    if (!staffBranch) throw new Error("SPECIALIST_UNAVAILABLE");

    const lines = await resolveServiceLines(
      supabaseAdmin,
      data.businessId,
      branchId,
      data.serviceIds,
      data.staffId,
    );
    const totalDuration = lines.reduce((sum, l) => sum + l.durationMinutes, 0);
    const { data: bufferMinutes } = await supabaseAdmin.rpc("resolve_buffer_minutes", {
      _business_id: data.businessId,
      _branch_id: branchId,
      _service_id: lines[0].serviceId,
    });
    const startsAt = data.startsAt ? new Date(data.startsAt) : new Date();
    const endsAt = new Date(startsAt.getTime() + (totalDuration + (bufferMinutes ?? 0)) * 60_000);
    const totalPrice = lines.reduce((sum, l) => sum + l.price, 0);

    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("currency")
      .eq("id", data.businessId)
      .single();

    const { data: inserted, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        customer_id: data.customerId ?? null,
        customer_name: data.customerId ? null : (data.customerName ?? null),
        customer_phone: data.customerId ? null : (data.customerPhone ?? null),
        business_id: data.businessId,
        branch_id: branchId,
        service_id: lines[0].serviceId,
        staff_id: data.staffId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "confirmed",
        total_price: totalPrice,
        notes: data.notes ?? null,
      } as never)
      .select("id, reference")
      .single();
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505" || code === "23P01") throw new Error("SLOT_UNAVAILABLE");
      throw new Error(sanitizeDbError(error));
    }

    await supabaseAdmin.from("booking_items").insert(
      lines.map((l, i) => ({
        booking_id: inserted.id,
        service_id: l.serviceId,
        service_name: l.name,
        service_name_ar: l.nameAr,
        duration_minutes: l.durationMinutes,
        price: l.price,
        currency: business?.currency ?? "USD",
        staff_id: data.staffId,
        business_id: data.businessId,
        sort_order: i,
      })) as never,
    );

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_id: context.userId,
      action: "booking.walk_in_created",
      target_type: "booking",
      target_id: inserted.id,
      business_id: data.businessId,
      details: {
        staffId: data.staffId,
        serviceIds: data.serviceIds,
        isGuest: !data.customerId,
      } as never,
    } as never);

    return { id: inserted.id as string, reference: inserted.reference as string };
  });
