import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Two fields the search RPC's `RETURNS TABLE` doesn't carry (confirmed —
 * `search_businesses_page()` returns nothing gallery/amenities/promotion-
 * shaped), fetched once per results page for whichever businesses are
 * currently loaded, the same batched-by-id pattern as
 * `useBusinessGalleries`. Powers two things client-side, layered on top of
 * the server-filtered page (Search redesign §8, §14):
 *  - "Commodités"/"Type de prestation" filters — `amenities` is a free-text
 *    `businesses.amenities: string[]` column; `women_only`/`men_only` are
 *    two of its values, not a separate gender column (confirmed against
 *    `business-about.tsx`'s own `AMENITY_LABELS`).
 *  - The "Offers" badge/filter — real, not the previously-dead `"offer"`
 *    badge tone: a business "has an active offer" when a `promotions` row
 *    is `is_active` and its `starts_at`/`ends_at` window covers now.
 */
export function useBusinessFilterExtras(businessIds: string[]) {
  const ids = [...new Set(businessIds)].sort();
  return useQuery({
    queryKey: ["business-filter-extras", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [{ data: businesses, error: bErr }, { data: promos, error: pErr }] = await Promise.all([
        supabase.from("businesses").select("id, amenities").in("id", ids),
        supabase
          .from("promotions")
          .select("business_id, starts_at, ends_at")
          .in("business_id", ids)
          .eq("is_active", true),
      ]);
      if (bErr) throw bErr;
      if (pErr) throw pErr;

      const amenitiesByBusiness = new Map<string, string[]>();
      for (const row of businesses ?? []) amenitiesByBusiness.set(row.id, row.amenities ?? []);

      const now = Date.now();
      const hasOfferByBusiness = new Set<string>();
      for (const row of promos ?? []) {
        const startsOk = !row.starts_at || new Date(row.starts_at).getTime() <= now;
        const endsOk = !row.ends_at || new Date(row.ends_at).getTime() >= now;
        if (startsOk && endsOk) hasOfferByBusiness.add(row.business_id);
      }

      return { amenitiesByBusiness, hasOfferByBusiness };
    },
  });
}
