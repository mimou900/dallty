import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { provinceOfCity } from "@/lib/arab-cities";
import type { Business } from "@/lib/dallty-content";

export type LiveBusiness = Business & {
  countryCode: string;
  state: string;
  city: string;
  businessType: string;
  lat: number | null;
  lng: number | null;
};

const BUSINESS_COLUMNS =
  "id, slug, owner_id, name, name_ar, description, description_ar, area, area_ar, city, image_url, rating, review_count, price_range, distance_km, opens_at, closes_at, instant_booking, is_active, created_at, address, status, business_type, country, country_code, district, logo_url, cover_url, is_listed, latitude, longitude";

export function useLiveBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async (): Promise<LiveBusiness[]> => {
      const { data, error } = await supabase
        .from("businesses")
        .select(BUSINESS_COLUMNS)
        .eq("is_active", true)
        .eq("is_listed", true)
        .order("rating", { ascending: false })
        // Bounded per the Project 03 security audit: this query previously had no limit at
        // all, meaning every visit to /search fetched the entire active+listed businesses
        // table to the browser. 500 is a stopgap bound, not a real pagination solution — the
        // marketplace/search project should replace this whole client-side-filtering
        // approach with a server-side, rate-limited, paginated search endpoint once result
        // counts approach this bound.
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((b) => ({
        id: b.id,
        slug: b.slug,
        image: b.image_url ?? "/salons/hair.jpg",
        en: { name: b.name, area: b.area, tags: `${b.area} · ${b.city}` },
        ar: { name: b.name_ar ?? b.name, area: b.area_ar ?? b.area, tags: b.area_ar ?? b.area },
        rating: Number(b.rating),
        reviews: b.review_count ?? 0,
        distanceKm: Number(b.distance_km ?? 0),
        price: b.price_range ?? "$$",
        open: b.is_active,
        instant: Boolean(b.instant_booking),
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
