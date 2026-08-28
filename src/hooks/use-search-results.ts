import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { searchBusinesses } from "@/lib/marketplace-search.functions";
import { mapSearchRowToLiveBusiness, type LiveBusiness } from "@/hooks/use-live-businesses";

export type ServerSort = "relevance" | "distance" | "rating";

export type ViewportBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export type SearchResultsParams = {
  countryCode: string;
  query?: string;
  category?: string;
  city?: string;
  lat?: number;
  lng?: number;
  instantOnly?: boolean;
  verifiedOnly?: boolean;
  sort: ServerSort;
  pageSize?: number;
  /** Map's "Search this area" viewport, committed only when the user taps
   *  the trigger — not the live/uncommitted map position (see
   *  `results-map.tsx`'s `onBoundsChange`). Rounded into the query key below
   *  so a sub-pixel pan doesn't invalidate the cache/refetch. */
  bounds?: ViewportBounds;
};

function roundBounds(b: ViewportBounds | undefined) {
  if (!b) return "";
  // ~110m precision (3 decimal degrees) — enough to dedupe near-identical
  // "Search this area" taps without merging genuinely different viewports.
  return [b.minLat, b.maxLat, b.minLng, b.maxLng].map((n) => n.toFixed(3)).join(",");
}

type Cursor = { score: number; id: string } | null;

/**
 * Search redesign §19/§20 — real cursor-paginated infinite loading, built on
 * `searchBusinesses`'s cursor logic (already correct, just never wired to a
 * UI before this). `useInfiniteQuery` is already available (React Query is a
 * dependency) but unused anywhere else in the app until now.
 *
 * Deliberately does NOT accept a `regionId` param — `businesses.region_id`
 * is confirmed always `null` in production (verified directly against the
 * live table), and `search_businesses_page()` filters with
 * `b.region_id = _region_id`, so passing one would silently zero out every
 * result rather than no-op. State/wilaya filtering stays client-side against
 * the same derived `state` field `/search` already uses today
 * (`mapSearchRowToLiveBusiness`'s `provinceOfCity` fallback) — see
 * `search.tsx`'s own filtering layer for where that's applied. `city` is
 * safe to pass through: it's a real, populated free-text column the RPC
 * matches with a real `ILIKE`.
 */
export function useSearchResults(params: SearchResultsParams) {
  const search = useServerFn(searchBusinesses);
  const pageSize = params.pageSize ?? 16;

  const infinite = useInfiniteQuery({
    queryKey: [
      "search-results",
      params.countryCode,
      params.query ?? "",
      params.category ?? "",
      params.city ?? "",
      params.lat?.toFixed(3) ?? "",
      params.lng?.toFixed(3) ?? "",
      Boolean(params.instantOnly),
      Boolean(params.verifiedOnly),
      params.sort,
      pageSize,
      roundBounds(params.bounds),
    ],
    initialPageParam: null as Cursor,
    queryFn: async ({ pageParam }: { pageParam: Cursor }) => {
      const { results, nextCursor } = await search({
        data: {
          countryCode: params.countryCode,
          query: params.query || undefined,
          category: params.category || undefined,
          city: params.city || undefined,
          lat: params.lat,
          lng: params.lng,
          instantOnly: params.instantOnly,
          verifiedOnly: params.verifiedOnly,
          sort: params.sort,
          cursorScore: pageParam?.score,
          cursorId: pageParam?.id,
          limit: pageSize,
          bounds: params.bounds,
        },
      });
      return { results: results.map(mapSearchRowToLiveBusiness), nextCursor };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 2 * 60 * 1000,
  });

  const businesses: LiveBusiness[] = infinite.data?.pages.flatMap((p) => p.results) ?? [];
  return { ...infinite, businesses };
}
