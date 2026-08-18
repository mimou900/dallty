import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Rate-limited server-side wrappers for the public business-detail page's read RPCs.
 *
 * These RPCs (`get_business_public_staff`, `get_business_availability_summary`,
 * `get_staff_day_availability`, `get_available_slots`, `check_promo_code`) were previously
 * called directly from the browser via `supabase.rpc(...)` with no rate limiting at all —
 * anyone could script a loop against them. This file gives each one a validated,
 * server-side-enforced rate limit, matching the pattern `marketplace-search.functions.ts`
 * already established for search. The underlying SQL functions are unchanged; this is a
 * thin wrapper, never a second copy of their logic.
 *
 * `check_promo_code` gets a much tighter limit than the others — it's a brute-force target
 * (guessing valid promo codes), not just a scraping target.
 */

const businessIdInput = z.object({ businessId: z.string().uuid() });

export const getBusinessPublicStaff = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => businessIdInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `business_staff:${ip}`, 60, 10);

    const { data: rows, error } = await supabaseAdmin.rpc("get_business_public_staff", {
      _salon_id: data.businessId,
    });
    if (error) throw new Error("STAFF_LOOKUP_FAILED");
    return rows ?? [];
  });

const daysInput = businessIdInput.extend({
  branchId: z.string().uuid(),
  days: z.number().int().min(1).max(60).default(14),
});

export const getBusinessAvailabilityOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => daysInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `business_availability_overview:${ip}`, 60, 10);

    const { data: rows, error } = await supabaseAdmin.rpc("get_business_availability_summary", {
      _salon_id: data.businessId,
      _branch_id: data.branchId,
      _days: data.days,
    });
    if (error) throw new Error("AVAILABILITY_OVERVIEW_FAILED");
    return rows ?? [];
  });

const staffDayInput = z.object({
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  days: z.number().int().min(1).max(60).default(14),
});

export const getStaffDayAvailability = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => staffDayInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `staff_day_availability:${ip}`, 120, 10);

    const { data: rows, error } = await supabaseAdmin.rpc("get_staff_day_availability", {
      _staff_id: data.staffId,
      _branch_id: data.branchId,
      _service_id: data.serviceId,
      _days: data.days,
    });
    if (error) throw new Error("DAY_AVAILABILITY_FAILED");
    return rows ?? [];
  });

const slotsInput = z.object({
  staffId: z.string().uuid(),
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  day: z.string(),
});

export const getAvailableSlots = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => slotsInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `available_slots:${ip}`, 120, 10);

    const { data: rows, error } = await supabaseAdmin.rpc("get_available_slots", {
      _staff_id: data.staffId,
      _branch_id: data.branchId,
      _service_id: data.serviceId,
      _day: data.day,
    });
    if (error) throw new Error("SLOTS_LOOKUP_FAILED");
    return rows ?? [];
  });

const promoInput = z.object({
  businessId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  amount: z.number().nonnegative(),
});

/**
 * Deliberately much tighter than the other lookups here: a promo code is a secret the
 * business intends only legitimate customers to have. Without a strict per-IP limit this
 * RPC is a brute-force oracle for guessing valid codes.
 */
export const checkPromoCode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => promoInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `promo_code_check:${ip}`, 10, 10);

    const { data: rows, error } = await supabaseAdmin.rpc("check_promo_code", {
      _salon_id: data.businessId,
      _code: data.code,
      _amount: data.amount,
    });
    if (error) throw new Error("PROMO_CHECK_FAILED");
    return rows?.[0] ?? { valid: false, reason: "not_found" };
  });
