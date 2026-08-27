import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { provinceOfCity } from "@/lib/arab-cities";
import type { Business } from "@/lib/dallty-content";
import { getDefaultCountry } from "@/lib/reference-data";
import { searchBusinesses } from "@/lib/marketplace-search.functions";

/** Fallback photo when a business has no `image_url`, chosen by category so
 *  a nail studio or spa doesn't show a haircut photo. Only 4 stock photos
 *  exist under `/public/salons/` today; everything without a closer match
 *  gets `hair.jpg` as an honest "no dedicated asset yet" default, not a
 *  disguised claim about the business. Extend this map as more category
 *  photos are added, matching `BUSINESS_TYPES` in `src/lib/business-schema.ts`. */
const CATEGORY_IMAGE_FALLBACK: Record<string, string> = {
  Barbershop: "/salons/barber.jpg",
  "Nail studio": "/salons/nails.jpg",
  "Spa & wellness": "/salons/spa.jpg",
};

function imageFallbackFor(businessType: string | null | undefined): string {
  return (businessType && CATEGORY_IMAGE_FALLBACK[businessType]) || "/salons/hair.jpg";
}

export type LiveBusiness = Business & {
  countryCode: string;
  state: string;
  city: string;
  businessType: string;
  lat: number | null;
  lng: number | null;
};

type SearchRow = Awaited<ReturnType<typeof searchBusinesses>>["results"][number];

/** Shared row→card shape, used by both the client hook below and the
 *  homepage route's SSR `loader` (`src/routes/index.tsx`) — the loader calls
 *  `searchBusinesses` directly (no HTTP hop when it runs server-side) and
 *  needs the exact same transform so its result can seed this hook's
 *  `useQuery` as `initialData` without drifting from what a normal client
 *  fetch would have produced. */
export function mapSearchRowToLiveBusiness(b: SearchRow): LiveBusiness {
  return {
    id: b.id,
    slug: b.slug,
    image: b.image_url ?? imageFallbackFor(b.business_type),
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
    category: b.business_type ?? undefined,
    countryCode: (b.country_code ?? "").toUpperCase(),
    state: b.district ?? provinceOfCity((b.country_code ?? "").toUpperCase(), b.city ?? ""),
    city: b.city ?? "",
    businessType: b.business_type ?? "",
    lat: b.latitude === null || b.latitude === undefined ? null : Number(b.latitude),
    lng: b.longitude === null || b.longitude === undefined ? null : Number(b.longitude),
  };
}

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
export function useLiveBusinesses(
  countryCode?: string,
  limit = 50,
  /** SSR-prefetched data (homepage's route `loader`) to seed this query with
   *  so the first render already has real data instead of firing its own
   *  fetch and waiting — see `mapSearchRowToLiveBusiness`'s comment. Omitted
   *  by every other caller (`search.tsx`, `service-search-sheet.tsx`),
   *  which fetch client-side exactly as before. */
  initialData?: LiveBusiness[],
) {
  const search = useServerFn(searchBusinesses);
  const resolvedCountry = countryCode ?? getDefaultCountry().iso_code;

  return useQuery({
    queryKey: ["businesses", resolvedCountry, limit],
    // No override here meant every mount — including just navigating away from the
    // homepage and back — refetched from scratch on React Query's own defaults
    // (`staleTime: 0`), even though this list rarely changes within a session.
    // Matches the precedent already set by `search.tsx`/`business.$businessSlug.tsx`:
    // a cached visit renders instantly with no network request at all, not just
    // "no skeleton flash."
    staleTime: 2 * 60 * 1000,
    ...(initialData ? { initialData, initialDataUpdatedAt: Date.now() } : {}),
    queryFn: async (): Promise<LiveBusiness[]> => {
      const { results } = await search({
        data: { countryCode: resolvedCountry, limit },
      });
      return results.map(mapSearchRowToLiveBusiness);
    },
  });
}
