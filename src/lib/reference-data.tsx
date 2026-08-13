import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Any-language translation bag, e.g. `{ fr: "Salon", ar: "صالون" }`. */
export type Translations = Record<string, string>;

export type Country = {
  id: string;
  iso_code: string;
  default_name: string;
  translations: Translations;
  currency_code: string;
  calling_code: string;
  timezone: string;
  flag: string;
  display_order: number;
  active: boolean;
};

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  decimal_digits: number;
  active: boolean;
};

export type Category = {
  id: string;
  default_name: string;
  translations: Translations;
  icon: string;
  image_url: string | null;
  description: string | null;
  display_order: number;
  active: boolean;
};

/** Generic administrative division, one level below Country. Algeria: Wilaya. */
export type Region = {
  id: string;
  country_id: string;
  code: string | null;
  default_name: string;
  translations: Translations;
  active: boolean;
};

/** Generic administrative division, one level below Region. Algeria: Commune. */
export type City = {
  id: string;
  region_id: string;
  default_name: string;
  translations: Translations;
  postal_code: string | null;
  active: boolean;
};

/** Looks up a row's name in `lang`, falling back to its default (source) name. */
export function translate(
  row: { default_name: string; translations: Translations },
  lang: string,
): string {
  return row.translations[lang] ?? row.default_name;
}

/** Minimal fallback used only before the first Countries fetch resolves. */
const FALLBACK_COUNTRY: Country = {
  id: "",
  iso_code: "DZ",
  default_name: "Algeria",
  translations: { fr: "Algérie", ar: "الجزائر" },
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
        .order("default_name");
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
      const { data, error } = await supabase
        .from("currencies")
        .select("*")
        .eq("active", true)
        .order("code");
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
        .order("default_name");
      if (error) throw error;
      return data as Category[];
    },
    staleTime: Infinity,
  });
}

/** Regions for one country (Algeria's wilayas, a future country's provinces/states, ...). */
export function useRegions(countryId: string | null): UseQueryResult<Region[]> {
  return useQuery({
    queryKey: ["reference-data", "regions", countryId],
    enabled: Boolean(countryId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regions")
        .select("*")
        .eq("country_id", countryId!)
        .eq("active", true)
        .order("default_name");
      if (error) throw error;
      return data as Region[];
    },
    staleTime: Infinity,
  });
}

/** Cities for one region (Algeria's communes, a future region's municipalities, ...). */
export function useCities(regionId: string | null): UseQueryResult<City[]> {
  return useQuery({
    queryKey: ["reference-data", "cities", regionId],
    enabled: Boolean(regionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("*")
        .eq("region_id", regionId!)
        .eq("active", true)
        .order("default_name");
      if (error) throw error;
      return data as City[];
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
