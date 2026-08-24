import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { provinceOfCity } from "@/lib/arab-cities";
import type { Business } from "@/lib/dallty-content";
import { getDefaultCountry } from "@/lib/reference-data";
import { searchBusinesses } from "@/lib/marketplace-search.functions";

export type LiveBusiness = Business & {
  countryCode: string;
  state: string;
  city: string;
  businessType: string;
  lat: number | null;
  lng: number | null;
};

/**
 * Project 14 Phase 2: was a raw, unbounded, client-side `supabase.from("businesses")` query —
 * confirmed via the Project 14 audit to be missing `marketplace_status`/`deleted_at`/`is_test`
 * checks entirely (only `is_active`/`is_listed`), with no server-side rate limiting (a direct
 * anon-client REST call) and a hardcoded `.limit(500)` its own prior comment already called a
 * "stopgap, not a real pagination solution." Now calls the real, secure, rate-limited
 * `searchBusinesses()` (Project 08's `search_businesses_page()` RPC) instead — same output
 * shape (`LiveBusiness[]`) preserved exactly so `search.tsx`/`index.tsx` need no changes.
 *
 * Scoped to a single country per call, since `search_businesses_page()` requires one (it's
 * gated per-business per `countries.marketplace_enabled`, and only Algeria is enabled today —
 * confirmed live during the audit). Defaults to `getDefaultCountry()` when no `countryCode` is
 * passed. A real country-selector UX (brief §9's `/country/` URL strategy) is a distinct,
 * larger follow-up — not attempted in this pass, since there is currently exactly one
 * marketplace-enabled country to test against either way.
 */
export function useLiveBusinesses(countryCode?: string) {
  const search = useServerFn(searchBusinesses);
  const resolvedCountry = countryCode ?? getDefaultCountry().iso_code;

  return useQuery({
    queryKey: ["businesses", resolvedCountry],
    queryFn: async (): Promise<LiveBusiness[]> => {
      const { results } = await search({
        data: { countryCode: resolvedCountry, limit: 50 },
      });
      return results.map((b) => ({
        id: b.id,
        slug: b.slug,
        image: b.image_url ?? "/salons/hair.jpg",
        en: { name: b.name, area: b.area ?? "", tags: `${b.area ?? ""} · ${b.city ?? ""}` },
        ar: {
          name: b.name_ar ?? b.name,
          area: b.area_ar ?? b.area ?? "",
          tags: b.area_ar ?? b.area ?? "",
        },
        rating: Number(b.rating),
        reviews: b.review_count ?? 0,
        distanceKm: Number(b.distance_km ?? 0),
        price: b.price_range ?? "$$",
        open: b.open_now,
        instant: Boolean(b.instant_booking),
        verified: Boolean(b.is_verified),
        countryCode: (b.country_code ?? "").toUpperCase(),
        state: b.district ?? provinceOfCity((b.country_code ?? "").toUpperCase(), b.city ?? ""),
        city: b.city ?? "",
        businessType: b.business_type ?? "",
        lat: b.latitude === null || b.latitude === undefined ? null : Number(b.latitude),
        lng: b.longitude === null || b.longitude === undefined ? null : Number(b.longitude),
      }));
    },
  });
}
