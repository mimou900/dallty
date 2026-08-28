import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type GalleryImage = { id: string; url: string; category: string };

const MAX_PER_CARD = 5;

/**
 * One batched `business_gallery` fetch for every business on the current
 * results page, instead of one query per card (Search redesign, §11-12) —
 * `.in("business_id", ids)` costs the same single round-trip regardless of
 * how many ids it covers. Each business is capped to 5 images client-side
 * (the max a card is meant to show); rows are already-signed URLs from
 * `uploadAndSign` (5-year expiry, `business-media` bucket) so no per-image
 * signing call is needed — same shortcut `signedUrl()`'s own
 * `path.startsWith("http")` early-return already relies on.
 */
export function useBusinessGalleries(businessIds: string[]) {
  const ids = [...new Set(businessIds)].sort();
  return useQuery({
    queryKey: ["business-galleries", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_gallery")
        .select("id, business_id, url, category, sort_order")
        .in("business_id", ids)
        .order("sort_order");
      if (error) throw error;
      const map = new Map<string, GalleryImage[]>();
      for (const row of data ?? []) {
        const list = map.get(row.business_id) ?? [];
        if (list.length < MAX_PER_CARD) {
          list.push({ id: row.id, url: row.url, category: row.category });
          map.set(row.business_id, list);
        }
      }
      return map;
    },
  });
}
