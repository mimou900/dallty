import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { provinceOfCity } from "@/lib/arab-cities";
import type { Salon } from "@/lib/dallty-content";

export type LiveSalon = Salon & {
  countryCode: string;
  state: string;
  city: string;
  businessType: string;
  lat: number | null;
  lng: number | null;
};

const SALON_COLUMNS =
  "id, owner_id, name, name_ar, description, description_ar, area, area_ar, city, image_url, rating, review_count, price_range, distance_km, opens_at, closes_at, instant_booking, is_active, created_at, address, status, business_type, country, country_code, district, logo_url, cover_url, is_listed, latitude, longitude";

export function useLiveSalons() {
  return useQuery({
    queryKey: ["salons"],
    queryFn: async (): Promise<LiveSalon[]> => {
      const { data, error } = await supabase
        .from("salons")
        .select(SALON_COLUMNS)
        .eq("is_active", true)
        .eq("is_listed", true)
        .order("rating", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => ({
        id: s.id,
        image: s.image_url ?? "/salons/hair.jpg",
        en: { name: s.name, area: s.area, tags: `${s.area} · ${s.city}` },
        ar: { name: s.name_ar ?? s.name, area: s.area_ar ?? s.area, tags: s.area_ar ?? s.area },
        rating: Number(s.rating),
        reviews: s.review_count ?? 0,
        distanceKm: Number(s.distance_km ?? 0),
        price: s.price_range ?? "$$",
        open: s.is_active,
        instant: Boolean(s.instant_booking),
        countryCode: (s.country_code ?? "").toUpperCase(),
        state: s.district ?? provinceOfCity((s.country_code ?? "").toUpperCase(), s.city ?? ""),
        city: s.city ?? "",
        businessType: s.business_type ?? "",
        lat: s.latitude === null || s.latitude === undefined ? null : Number(s.latitude),
        lng: s.longitude === null || s.longitude === undefined ? null : Number(s.longitude),
      }));
    },
  });
}
