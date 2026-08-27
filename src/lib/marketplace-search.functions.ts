import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Real, server-side, rate-limited, cursor-paginated marketplace search (Project 08) —
 * replaces the client-side-filtering approach `useLiveBusinesses()` used (still present,
 * still used by the homepage's "nearby" rail; not removed, see the architecture doc for why).
 * All ranking/visibility logic lives in `search_businesses_page()` (the core migration) —
 * this file is a thin, validated, rate-limited, anti-enumeration wrapper around it, never a
 * second copy of that logic (brief §46, §50).
 */

const SORTS = ["relevance", "distance", "rating"] as const;

const searchInput = z.object({
  countryCode: z.string().length(2),
  query: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  regionId: z.string().uuid().optional(),
  city: z.string().trim().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  instantOnly: z.boolean().optional(),
  verifiedOnly: z.boolean().optional(),
  sort: z.enum(SORTS).default("relevance"),
  cursorScore: z.number().optional(),
  cursorId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export type SearchBusinessesInput = z.infer<typeof searchInput>;

/**
 * Public discovery endpoint — no auth required (brief §47: public read only). Rate-limited
 * per IP (brief §14, §36) rather than unbounded, and every response page is hard-capped at
 * 50 rows regardless of what a caller requests (brief §15, §60) — there is no way to request
 * "all businesses" from this function, by construction, not just by convention.
 */
export const searchBusinesses = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => searchInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());

    // Rate-limit check and the actual search used to run sequentially (two full DB
    // round-trips back to back on every single call, unconditionally) — the search
    // query doesn't depend on the rate-limit result, so it can start immediately and
    // run alongside it instead of waiting behind it. `allSettled` (not `all`) so a
    // rate-limit rejection doesn't turn into an unhandled-rejection warning on the
    // still-in-flight search promise.
    const [rateLimitOutcome, searchOutcome] = await Promise.allSettled([
      // Generous enough for a real user paging through results/typing a query; tight
      // enough that a scripted bulk-extraction loop hits the wall quickly (brief §36).
      assertRateLimit(supabaseAdmin, `marketplace_search:${ip}`, 60, 10),
      supabaseAdmin.rpc("search_businesses_page", {
        _country_code: data.countryCode.toUpperCase(),
        _query: data.query || undefined,
        _category: data.category || undefined,
        _region_id: data.regionId || undefined,
        _city: data.city || undefined,
        _lat: data.lat ?? undefined,
        _lng: data.lng ?? undefined,
        _instant_only: data.instantOnly ?? false,
        _verified_only: data.verifiedOnly ?? false,
        _sort: data.sort,
        _cursor_score: data.cursorScore ?? undefined,
        _cursor_id: data.cursorId ?? undefined,
        _limit: data.limit ?? 20,
      }),
    ]);
    if (rateLimitOutcome.status === "rejected") throw rateLimitOutcome.reason;
    if (searchOutcome.status === "rejected") throw searchOutcome.reason;
    const { data: rows, error } = searchOutcome.value;
    if (error) throw new Error("SEARCH_FAILED");

    const rawResults = rows ?? [];
    const last = rawResults[rawResults.length - 1];
    const cursorField =
      data.sort === "distance" ? "distance_km" : data.sort === "rating" ? "rating" : "rank_score";
    const hasMore = rawResults.length === (data.limit ?? 20);
    const lastRecord = last as unknown as Record<string, number> | undefined;

    // The RPC's RETURNS TABLE carries fields no caller (compact or full business card)
    // ever reads — `description` in particular is full marketing copy, sent for every
    // row on every page load for a value nothing displays. Cursor pagination above
    // still uses the untrimmed `rawResults` (needs `rank_score`/`distance_km`/`rating`
    // cursor fields regardless of sort mode); only the client-facing payload is trimmed.
    const results = rawResults.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      name_ar: r.name_ar,
      city: r.city,
      district: r.district,
      area: r.area,
      area_ar: r.area_ar,
      image_url: r.image_url,
      rating: r.rating,
      review_count: r.review_count,
      price_range: r.price_range,
      is_verified: r.is_verified,
      instant_booking: r.instant_booking,
      open_now: r.open_now,
      country_code: r.country_code,
      business_type: r.business_type,
      latitude: r.latitude,
      longitude: r.longitude,
      distance_km: r.distance_km,
    }));

    return {
      results,
      nextCursor:
        hasMore && lastRecord
          ? { score: lastRecord[cursorField], id: lastRecord.id as unknown as string }
          : null,
    };
  });

const availabilityInput = z.object({ businessId: z.string().uuid() });

/**
 * A discovery hint ("Next available Thursday" / "Currently fully booked", brief §5, §23) —
 * deliberately NOT called as part of the bulk search page (would mean N extra queries per
 * results page); fetched per-card as it scrolls into view instead. Always defers to
 * get_available_slots() at actual booking time — this is informational only, never
 * booking-authoritative (brief §24).
 */
export const getBusinessAvailabilitySummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => availabilityInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `availability_summary:${ip}`, 120, 10);

    const { data: rows, error } = await supabaseAdmin.rpc("get_business_next_available", {
      _business_id: data.businessId,
      _days: 14,
    });
    if (error) throw new Error("AVAILABILITY_LOOKUP_FAILED");
    const row = rows?.[0];
    return {
      nextAvailableDay: row?.next_available_day ?? null,
      fullyBookedHorizon: row?.fully_booked_horizon ?? true,
    };
  });
