import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * "Professionnels" search mode (Search redesign, §16) — there is no
 * marketplace-wide staff search anywhere in the app today; every existing
 * `staff` query is scoped to a single business (its own booking page). This
 * is a new, deliberately simple query rather than a new RPC: `staff` and
 * `businesses` are both already publicly readable under RLS ("Anyone reads
 * staff" / the public businesses policy — confirmed live), so a plain
 * embedded-join select does the job without a database migration. Same
 * security shape as `searchBusinesses` (public, rate-limited, hard-capped
 * page size) — just built on PostgREST's join instead of an RPC.
 *
 * Rating: there is no per-staff rating aggregate anywhere at marketplace
 * scale (the one that exists, in `business.$businessSlug.tsx`, scans the
 * `reviews` table for a single business at a time — not safe to run
 * unbounded across the whole marketplace). Each professional's card shows
 * their business's real aggregate rating instead of a fabricated per-staff
 * number — an honest proxy, not invented precision.
 */

const SORTS = ["relevance", "distance", "rating"] as const;

const searchInput = z.object({
  countryCode: z.string().length(2),
  query: z.string().trim().max(120).optional(),
  regionState: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  sort: z.enum(SORTS).default("relevance"),
  limit: z.number().int().min(1).max(50).optional(),
});

export type SearchProfessionalsInput = z.infer<typeof searchInput>;

export const searchProfessionals = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => searchInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    const eff_limit = Math.min(Math.max(data.limit ?? 20, 1), 50);

    const [rateLimitOutcome, staffOutcome] = await Promise.allSettled([
      assertRateLimit(supabaseAdmin, `marketplace_professionals:${ip}`, 60, 10),
      (() => {
        let q = supabaseAdmin
          .from("staff")
          .select(
            `id, full_name, full_name_ar, title, title_ar, avatar_url, business_id,
             businesses!inner(id, slug, name, name_ar, city, district, area, area_ar,
               latitude, longitude, rating, review_count, is_listed, is_active,
               country_code, business_type)`,
          )
          .eq("is_active", true)
          .eq("businesses.is_listed", true)
          .eq("businesses.is_active", true)
          .eq("businesses.country_code", data.countryCode.toUpperCase())
          .limit(eff_limit);
        if (data.city) q = q.eq("businesses.city", data.city);
        if (data.regionState) q = q.eq("businesses.district", data.regionState);
        if (data.query) q = q.ilike("full_name", `%${data.query}%`);
        return q;
      })(),
    ]);
    if (rateLimitOutcome.status === "rejected") throw rateLimitOutcome.reason;
    if (staffOutcome.status === "rejected") throw staffOutcome.reason;
    const { data: rows, error } = staffOutcome.value;
    if (error) throw new Error("PROFESSIONAL_SEARCH_FAILED");

    const staffRows = (rows ?? []) as unknown as Array<{
      id: string;
      full_name: string;
      full_name_ar: string | null;
      title: string | null;
      title_ar: string | null;
      avatar_url: string | null;
      business_id: string;
      businesses: {
        id: string;
        slug: string;
        name: string;
        name_ar: string | null;
        city: string | null;
        district: string | null;
        area: string | null;
        area_ar: string | null;
        latitude: number | null;
        longitude: number | null;
        rating: number | null;
        review_count: number | null;
        country_code: string;
        business_type: string | null;
      };
    }>;

    const staffIds = staffRows.map((s) => s.id);
    let topServicesByStaff = new Map<string, { name: string; price: number }[]>();
    let startingPriceByStaff = new Map<string, number>();
    if (staffIds.length > 0) {
      const { data: svcRows } = await supabaseAdmin
        .from("staff_services")
        .select("staff_id, custom_price, services(name, name_ar, price)")
        .in("staff_id", staffIds);
      for (const row of (svcRows ?? []) as unknown as Array<{
        staff_id: string;
        custom_price: number | null;
        services: { name: string; name_ar: string | null; price: number } | null;
      }>) {
        if (!row.services) continue;
        const price = row.custom_price ?? row.services.price;
        const list = topServicesByStaff.get(row.staff_id) ?? [];
        if (list.length < 3) list.push({ name: row.services.name, price });
        topServicesByStaff.set(row.staff_id, list);
        const current = startingPriceByStaff.get(row.staff_id);
        if (current === undefined || price < current) startingPriceByStaff.set(row.staff_id, price);
      }
    }

    const results = staffRows.map((s) => ({
      id: s.id,
      businessId: s.business_id,
      businessSlug: s.businesses.slug,
      fullName: s.full_name,
      fullNameAr: s.full_name_ar,
      title: s.title,
      titleAr: s.title_ar,
      avatarUrl: s.avatar_url,
      businessName: s.businesses.name,
      businessNameAr: s.businesses.name_ar,
      city: s.businesses.city,
      area: s.businesses.area,
      areaAr: s.businesses.area_ar,
      latitude: s.businesses.latitude,
      longitude: s.businesses.longitude,
      // Business-level aggregate — see file doc comment on why this isn't per-staff.
      rating: s.businesses.rating,
      reviewCount: s.businesses.review_count,
      countryCode: s.businesses.country_code,
      businessType: s.businesses.business_type,
      topServices: topServicesByStaff.get(s.id) ?? [],
      startingPrice: startingPriceByStaff.get(s.id) ?? null,
    }));

    if (data.sort === "rating") results.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    // "distance"/"relevance" sorting happens client-side against the visitor's
    // real coordinates, same as `/search` already does for businesses today —
    // this query has no PostGIS distance calc to sort by server-side.

    return { results };
  });
