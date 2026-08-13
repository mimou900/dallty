import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Country = {
  id: string;
  iso_code: string;
  name: string;
  name_fr: string;
  name_ar: string;
  currency_code: string;
  calling_code: string;
  timezone: string;
  flag: string;
  display_order: number;
  active: boolean;
};

export type Currency = { code: string; name: string; symbol: string; decimal_digits: number; active: boolean };

export type Category = {
  id: string;
  name: string;
  name_fr: string;
  name_ar: string;
  icon: string;
  image_url: string | null;
  description: string | null;
  display_order: number;
  active: boolean;
};

export type Wilaya = { id: string; code: string; name: string; name_ar: string; active: boolean };

export type Commune = {
  id: string;
  wilaya_id: string;
  name: string;
  name_ar: string;
  postal_code: string | null;
  active: boolean;
};

/** Minimal fallback used only before the first Countries fetch resolves. */
const FALLBACK_COUNTRY: Country = {
  id: "",
  iso_code: "DZ",
  name: "Algeria",
  name_fr: "Algérie",
  name_ar: "الجزائر",
  currency_code: "DZD",
  calling_code: "+213",
  timezone: "Africa/Algiers",
  flag: "🇩🇿",
  display_order: 0,
  active: true,
};

// Synchronous cache for non-component call sites (formatPhoneDisplay, telHref).
// Populated by ReferenceDataProvider after the Countries query succeeds.
let countryCache: Country[] = [];

export function getCountryByCode(isoCode: string): Country | undefined {
  return countryCache.find((c) => c.iso_code === isoCode.toUpperCase());
}

export function getDefaultCountry(): Country {
  return getCountryByCode("DZ") ?? FALLBACK_COUNTRY;
}

export function getCountriesSync(): Country[] {
  return countryCache;
}

export function useCountries(): UseQueryResult<Country[]> {
  return useQuery({
    queryKey: ["reference-data", "countries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("countries")
        .select("*")
        .eq("active", true)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data as Country[];
    },
    staleTime: Infinity,
  });
}

export function useCurrencies(): UseQueryResult<Currency[]> {
  return useQuery({
    queryKey: ["reference-data", "currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("*").eq("active", true).order("code");
      if (error) throw error;
      return data as Currency[];
    },
    staleTime: Infinity,
  });
}

export function useCategories(): UseQueryResult<Category[]> {
  return useQuery({
    queryKey: ["reference-data", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("active", true)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
    staleTime: Infinity,
  });
}

export function useWilayas(): UseQueryResult<Wilaya[]> {
  return useQuery({
    queryKey: ["reference-data", "wilayas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wilayas").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data as Wilaya[];
    },
    staleTime: Infinity,
  });
}

export function useCommunes(wilayaId: string | null): UseQueryResult<Commune[]> {
  return useQuery({
    queryKey: ["reference-data", "communes", wilayaId],
    enabled: Boolean(wilayaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communes")
        .select("*")
        .eq("wilaya_id", wilayaId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Commune[];
    },
    staleTime: Infinity,
  });
}

const ReferenceDataContext = createContext<null>(null);

/** Mounted once at the app root. Keeps the synchronous country cache warm. */
export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const countries = useCountries();

  useEffect(() => {
    if (countries.data) countryCache = countries.data;
  }, [countries.data]);

  return <ReferenceDataContext.Provider value={null}>{children}</ReferenceDataContext.Provider>;
}

export function useReferenceDataContext() {
  return useContext(ReferenceDataContext);
}
