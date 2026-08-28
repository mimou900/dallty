import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CalendarDays,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  Search,
  SlidersHorizontal,
  Store,
  User,
} from "lucide-react";

import { BottomNav } from "@/components/dallty/bottom-nav";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LiveBusiness } from "@/hooks/use-live-businesses";
import { useSearchResults } from "@/hooks/use-search-results";
import { useBusinessGalleries } from "@/hooks/use-business-galleries";
import { useBusinessFilterExtras } from "@/hooks/use-business-filter-extras";
import { useUserLocation, haversineKm } from "@/hooks/use-user-location";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { getTravelTimes } from "@/lib/geo.functions";
import { searchProfessionals } from "@/lib/professional-search.functions";
import type { TravelInfo, BusinessBadge } from "@/components/dallty/business-card";
import { dirFor, useLocale, dateFnsLocaleFor } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import { getDefaultCountry, useCategories, translate } from "@/lib/reference-data";
import { approximateLocationFor } from "@/lib/wilaya-coords";
import { SearchResultCard } from "@/components/dallty/search/search-result-card";
import { SearchResultSkeleton } from "@/components/dallty/search/search-result-skeleton";
import { ProfessionalCard } from "@/components/dallty/search/professional-card";
import { DateNav } from "@/components/dallty/search/date-nav";
import { FilterDrawer, type FilterState } from "@/components/dallty/search/filter-drawer";
import { MobileSearchSheet } from "@/components/dallty/search/mobile-search-sheet";
import { ServiceSearchPanel, type ServiceSelection } from "@/components/dallty/service-search-sheet";
import { LocationPickerPanel, type LocationSelection } from "@/components/dallty/location-picker-sheet";
import { DateTimePickerPanel, DateTimePickerSheet, type Period } from "@/components/dallty/datetime-picker-sheet";
import { format as formatDate } from "date-fns";

const ResultsMap = lazy(() => import("@/components/dallty/search/results-map"));

type SearchMode = "establishments" | "professionals";

type SearchParams = {
  service: string;
  category: string;
  country: string;
  state: string;
  city: string;
  type: string;
  mode: SearchMode;
  date: string;
  period: "" | Period;
  sort: "best-match" | "nearest" | "top-rated";
  price: "" | "$" | "$$" | "$$$";
  gender: "all" | "women" | "men";
  amenities: string;
  offers: boolean;
  map: boolean;
};

const SORT_TO_RPC = { "best-match": "relevance", nearest: "distance", "top-rated": "rating" } as const;
const PRICE_RANK: Record<string, number> = { $: 1, "$$": 2, "$$$": 3, "$$$$": 4 };

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    service: typeof search.service === "string" ? search.service : "",
    category: typeof search.category === "string" ? search.category : "",
    country: typeof search.country === "string" ? search.country : "",
    state: typeof search.state === "string" ? search.state : "",
    city: typeof search.city === "string" ? search.city : "",
    type: typeof search.type === "string" ? search.type : "",
    mode: search.mode === "professionals" ? "professionals" : "establishments",
    date: typeof search.date === "string" ? search.date : "",
    period:
      search.period === "morning" || search.period === "afternoon" || search.period === "evening"
        ? search.period
        : "",
    sort:
      search.sort === "nearest" || search.sort === "top-rated" || search.sort === "best-match"
        ? search.sort
        : "best-match",
    price:
      search.price === "$" || search.price === "$$" || search.price === "$$$" ? search.price : "",
    gender: search.gender === "women" || search.gender === "men" ? search.gender : "all",
    amenities: typeof search.amenities === "string" ? search.amenities : "",
    offers: search.offers === true || search.offers === "true",
    map: search.map === true || search.map === "true",
  }),
  head: () => ({
    meta: [
      { title: "Search salons & barbers — Dallty" },
      {
        name: "description",
        content:
          "Search Dallty for salons, barbers, nail studios and spas by country, province, city and shop type — with live availability and instant booking.",
      },
    ],
  }),
  component: SearchPage,
});

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function SearchPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const { lang } = useLocale();
  const { t } = useTranslation(["marketplace", "common"]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [serviceQuery, setServiceQuery] = useState(params.service);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [dateTimeSheetOpen, setDateTimeSheetOpen] = useState(false);
  const breakpoint = useBreakpoint();
  const country = getDefaultCountry().iso_code;

  const geo = useUserLocation();
  const fetchTravel = useServerFn(getTravelTimes);
  const searchProfessionalsFn = useServerFn(searchProfessionals);
  const categories = useCategories();
  const dateFnsLocale = dateFnsLocaleFor(lang);

  // Search results are inherently location-relevant (distance, "nearest"
  // sort, the map's own position dot) — unlike `useUserLocation`'s default
  // elsewhere in the app (never auto-prompt), this page requests it
  // automatically on load rather than behind an explicit button. A prior
  // grant/denial is still remembered by the hook itself (localStorage), so
  // this only ever surfaces the real browser permission prompt once.
  useEffect(() => {
    void geo.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Partial<SearchParams>) {
    void navigate({ search: (prev: SearchParams) => ({ ...prev, ...patch }), replace: true });
  }

  // Desktop 3-segment search bar + the mobile full-screen sheet both need to
  // translate the same three picker components' selection payloads into
  // this route's own URL param shape — one mapping, reused both places.
  // These return a *patch* rather than calling `update()` themselves: the
  // mobile sheet resolves all three fields at once and must merge them into
  // a single `navigate()` call — three back-to-back `update()` calls would
  // each read the same stale `prev` and the last one would silently clobber
  // the other two (all three use `replace: true`).
  function serviceSelectionPatch(selection: ServiceSelection): Partial<SearchParams> {
    return selection.kind === "category"
      ? { service: "", category: selection.value }
      : { service: selection.value, category: "" };
  }
  function locationSelectionPatch(selection: LocationSelection): Partial<SearchParams> {
    if (selection.kind === "current") {
      void geo.request();
      return { state: "", city: "" };
    }
    return { state: selection.wilaya, city: selection.commune };
  }
  function dateTimeSelectionPatch(selection: { date: Date; period: Period | null } | null): Partial<SearchParams> {
    return {
      date: selection ? formatDate(selection.date, "yyyy-MM-dd") : "",
      period: selection?.period ?? "",
    };
  }
  function applyServiceSelection(selection: ServiceSelection) {
    update(serviceSelectionPatch(selection));
  }
  function applyLocationSelection(selection: LocationSelection) {
    update(locationSelectionPatch(selection));
  }
  function applyDateTimeSelection(selection: { date: Date; period: Period | null } | null) {
    update(dateTimeSelectionPatch(selection));
  }

  const serviceLabel =
    params.service ||
    (params.category
      ? (categories.data?.find((c) => c.default_name === params.category) &&
          translate(categories.data!.find((c) => c.default_name === params.category)!, lang)) ||
        params.category
      : null);
  const locationLabel = params.city ? `${params.state} · ${params.city}` : params.state || null;
  const dateTimeLabel = params.date
    ? params.date === todayISO()
      ? t("today")
      : formatDate(new Date(params.date), "EEE d MMM", { locale: dateFnsLocale })
    : null;

  const amenitiesList = useMemo(
    () => (params.amenities ? params.amenities.split(",").filter(Boolean) : []),
    [params.amenities],
  );

  const filterState: FilterState = {
    sort: params.sort,
    price: params.price,
    gender: params.gender,
    amenities: amenitiesList,
    offers: params.offers,
    shopType: params.type,
  };

  function applyFilters(next: FilterState) {
    update({
      sort: next.sort,
      price: next.price,
      gender: next.gender,
      amenities: next.amenities.join(","),
      offers: next.offers,
      type: next.shopType,
    });
    setFilterOpen(false);
  }

  // "Today, no specific period" honestly means "open right now" — the same
  // mapping the homepage already uses when handing off to this route. Any
  // other date/period combination isn't backed by a real cross-business
  // slot inventory (see datetime-picker-sheet.tsx), so it's left alone
  // rather than silently misapplying a filter that doesn't match the intent.
  const wantsOpenNow = params.date === todayISO() && params.period === "";

  const results = useSearchResults({
    countryCode: params.country || country,
    query: params.service || undefined,
    category: params.category || undefined,
    city: params.city || undefined,
    lat: geo.coords?.lat,
    lng: geo.coords?.lng,
    sort: SORT_TO_RPC[params.sort],
    pageSize: 16,
  });

  const professionalsQuery = useQuery({
    queryKey: ["professionals-search", params.country || country, params.service, params.city, params.sort],
    enabled: params.mode === "professionals",
    queryFn: () =>
      searchProfessionalsFn({
        data: {
          countryCode: params.country || country,
          query: params.service || undefined,
          city: params.city || undefined,
          sort: SORT_TO_RPC[params.sort],
          limit: 30,
        },
      }),
  });

  // Client-side layer for everything the RPC can't filter server-side —
  // shop type, wilaya (region_id is always null in production, confirmed
  // during planning), price tier, gender/amenities (both live in the same
  // free-text `amenities` array, not a distinct column), active offers, and
  // "open now" — same honest layering `/search` already used before this
  // redesign for type/instant/open.
  const filteredBusinesses = useMemo(() => {
    let list = results.businesses;
    if (params.state) list = list.filter((b) => b.state === params.state);
    if (params.type) {
      const kw = params.type.toLowerCase();
      list = list.filter((b) => b.businessType.toLowerCase().includes(kw));
    }
    if (wantsOpenNow) list = list.filter((b) => b.open);
    if (params.price) {
      const max = PRICE_RANK[params.price] ?? 4;
      list = list.filter((b) => (PRICE_RANK[b.price] ?? 2) <= max);
    }
    return list;
  }, [results.businesses, params.state, params.type, params.price, wantsOpenNow]);

  const visibleIds = useMemo(() => filteredBusinesses.map((b) => b.id), [filteredBusinesses]);
  const galleries = useBusinessGalleries(visibleIds);
  const extras = useBusinessFilterExtras(visibleIds);

  const finalBusinesses = useMemo(() => {
    if (!extras.data) return filteredBusinesses;
    return filteredBusinesses.filter((b) => {
      const amenities = extras.data!.amenitiesByBusiness.get(b.id) ?? [];
      if (params.gender === "women" && !amenities.includes("women_only")) return false;
      if (params.gender === "men" && !amenities.includes("men_only")) return false;
      if (amenitiesList.some((a) => !amenities.includes(a))) return false;
      if (params.offers && !extras.data!.hasOfferByBusiness.has(b.id)) return false;
      return true;
    });
  }, [filteredBusinesses, extras.data, params.gender, amenitiesList, params.offers]);

  function badgeFor(b: LiveBusiness): BusinessBadge | undefined {
    if (extras.data?.hasOfferByBusiness.has(b.id)) {
      return { label: t("badge_offer"), tone: "offer" };
    }
    if (b.rating >= 4.7 && b.reviews >= 15) {
      return { label: t("badge_top_rated"), tone: "top-rated" };
    }
    return undefined;
  }

  // Travel times only once the visitor granted location access — same
  // pattern as before this redesign.
  const nearestIds = useMemo(
    () =>
      geo.coords
        ? finalBusinesses
            .filter((b) => b.lat != null && b.lng != null)
            .slice(0, 20)
            .map((b) => ({ id: b.id, lat: b.lat as number, lng: b.lng as number }))
        : [],
    [finalBusinesses, geo.coords],
  );
  const travelQuery = useQuery({
    queryKey: ["travel-times", geo.coords?.lat.toFixed(3), geo.coords?.lng.toFixed(3), nearestIds.map((n) => n.id).join(",")],
    enabled: Boolean(geo.coords) && nearestIds.length > 0,
    staleTime: 1000 * 60 * 10,
    retry: false,
    queryFn: () => fetchTravel({ data: { origin: geo.coords!, destinations: nearestIds } }),
  });
  const travelMap = useMemo(() => {
    const map = new Map<string, TravelInfo>();
    for (const b of finalBusinesses) {
      if (!geo.coords || b.lat == null || b.lng == null) continue;
      const hit = (travelQuery.data ?? []).find((r) => r.id === b.id);
      map.set(b.id, {
        km: hit?.distanceMeters != null ? hit.distanceMeters / 1000 : haversineKm(geo.coords, { lat: b.lat, lng: b.lng }),
        drivingMinutes: hit?.drivingSeconds != null ? Math.round(hit.drivingSeconds / 60) : null,
        walkingMinutes: hit?.walkingSeconds != null ? Math.round(hit.walkingSeconds / 60) : null,
      });
    }
    return map;
  }, [finalBusinesses, travelQuery.data, geo.coords]);

  // Nearest sort for establishments needs real coordinates first.
  useEffect(() => {
    if (params.sort === "nearest" && !geo.coords && geo.status !== "prompting" && geo.status !== "denied") {
      void geo.request();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sort]);

  // Infinite loading sentinel.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || params.mode !== "establishments") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && results.hasNextPage && !results.isFetchingNextPage) {
          void results.fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mode, results.hasNextPage, results.isFetchingNextPage]);

  const activeFilterCount =
    (params.sort !== "best-match" ? 1 : 0) +
    (params.price ? 1 : 0) +
    (params.gender !== "all" ? 1 : 0) +
    amenitiesList.length +
    (params.offers ? 1 : 0);


  // Real geocodes are used as-is; a business with none gets a stable
  // approximate point within its own wilaya instead of being dropped from
  // the map entirely (the seed dataset has no real lat/lng at all today —
  // see wilaya-coords.ts's doc comment). This fallback is map-display-only:
  // it never feeds back into `b.lat/lng`, sorting, or the "X km away" text
  // elsewhere on this page, which still require a real coordinate.
  const mapPins = finalBusinesses.map((b) => {
    const real = b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null;
    const approx = real ?? approximateLocationFor(b.state, b.id);
    return {
      id: b.id,
      slug: b.slug,
      lat: approx?.lat ?? null,
      lng: approx?.lng ?? null,
      en: b.en,
      ar: b.ar,
      image: b.image,
      rating: b.rating,
      reviews: b.reviews,
      category: b.category,
      verified: b.verified,
      distanceKm: travelMap.get(b.id)?.km ?? null,
    };
  });

  return (
    <div dir={dirFor(lang)} className="relative min-h-dvh overflow-x-hidden bg-cream text-cream-foreground">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="mx-auto max-w-6xl rounded-3xl border border-border/60 bg-card p-4 shadow-soft sm:p-5">
          {/* Row 1 — back, search bar, menu */}
          <div className="flex items-center gap-3">
            <Link to="/" aria-label={t("back_home")} className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border/60 bg-card transition-colors duration-150 hover:bg-secondary/60">
              <ArrowLeft className="size-5 rtl:rotate-180" />
            </Link>

            {breakpoint === "desktop" ? (
              <div className="flex min-h-14 min-w-0 flex-1 items-stretch rounded-full border border-border/60 bg-card">
                <Popover open={serviceSheetOpen} onOpenChange={setServiceSheetOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-[4] items-center gap-2.5 rounded-s-full border-e border-border/60 px-5 text-start transition-colors duration-150 hover:bg-secondary/30"
                    >
                      <Search className="size-[18px] shrink-0 text-primary" />
                      <span className={`min-w-0 flex-1 truncate text-[0.95rem] ${serviceLabel ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {serviceLabel ?? t("search_service_placeholder")}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={12} className="w-auto rounded-3xl border-border/60 bg-card p-0 shadow-elevation-medium">
                    <ServiceSearchPanel
                      query={serviceQuery}
                      onQueryChange={setServiceQuery}
                      onSelectCategory={(cat) => {
                        applyServiceSelection({ kind: "category", value: cat.default_name, label: translate(cat, lang) });
                        setServiceSheetOpen(false);
                      }}
                      onSelectBusiness={(slug) => {
                        setServiceSheetOpen(false);
                        void navigate({ to: "/business/$businessSlug", params: { businessSlug: slug } });
                      }}
                      onSubmitQuery={(q) => {
                        applyServiceSelection({ kind: "query", value: q });
                        setServiceSheetOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>

                <Popover open={locationSheetOpen} onOpenChange={setLocationSheetOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-[3] items-center gap-2.5 border-e border-border/60 px-5 text-start transition-colors duration-150 hover:bg-secondary/30"
                    >
                      <MapPin className="size-[18px] shrink-0 text-primary" />
                      <span className={`min-w-0 flex-1 truncate text-[0.95rem] ${locationLabel || geo.enabled ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {geo.enabled ? t("location_use_current_label") : (locationLabel ?? t("search_location_placeholder"))}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={12} className="w-auto rounded-3xl border-border/60 bg-card p-0 shadow-elevation-medium">
                    <LocationPickerPanel
                      geo={geo}
                      onSelect={applyLocationSelection}
                      onDone={() => setLocationSheetOpen(false)}
                    />
                  </PopoverContent>
                </Popover>

                <Popover open={dateTimeSheetOpen} onOpenChange={setDateTimeSheetOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-[3] items-center gap-2.5 rounded-e-full px-5 text-start transition-colors duration-150 hover:bg-secondary/30"
                    >
                      <CalendarDays className="size-[18px] shrink-0 text-primary" />
                      <span className={`min-w-0 flex-1 truncate text-[0.95rem] ${dateTimeLabel ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                        {dateTimeLabel ?? t("search_time_label")}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" sideOffset={12} className="w-auto rounded-3xl border-border/60 bg-card p-0 shadow-elevation-medium">
                    <DateTimePickerPanel
                      initial={params.date ? { date: new Date(params.date), period: params.period || null } : null}
                      onApply={applyDateTimeSelection}
                      onDone={() => setDateTimeSheetOpen(false)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMobileSearchOpen(true)}
                className="flex min-h-14 min-w-0 flex-1 flex-col items-start justify-center overflow-hidden rounded-2xl border border-border/60 bg-card px-4 text-start"
              >
                <span className="block w-full truncate text-base font-bold">
                  {serviceLabel || t("mobile_search_default_title")}
                </span>
                <span className="mt-0.5 block w-full truncate text-xs text-muted-foreground">
                  {dateTimeLabel ?? t("search_time_label")} ·{" "}
                  {geo.enabled ? t("location_use_current_label") : (locationLabel ?? t("search_targeted_area"))}
                </span>
              </button>
            )}

            {params.mode === "establishments" && (
              <button
                type="button"
                onClick={() => update({ map: !params.map })}
                aria-label={params.map ? t("show_list") : t("show_map")}
                className={`grid size-11 shrink-0 place-items-center rounded-2xl border transition-colors duration-150 ${
                  params.map
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-card hover:bg-secondary/60"
                }`}
              >
                {params.map ? <List className="size-5" /> : <MapIcon className="size-5" />}
              </button>
            )}
          </div>

          {/* Row 2 — mode toggle, filters */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl border border-border/60 bg-secondary/40 p-1">
              <button
                type="button"
                onClick={() => update({ mode: "establishments" })}
                aria-pressed={params.mode === "establishments"}
                className={`press flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition-colors ${
                  params.mode === "establishments" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                <Store className="size-4" />
                {t("mode_establishments")}
              </button>
              <button
                type="button"
                onClick={() => update({ mode: "professionals" })}
                aria-pressed={params.mode === "professionals"}
                className={`press flex min-h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition-colors ${
                  params.mode === "professionals" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                <User className="size-4" />
                {t("mode_professionals")}
              </button>
            </div>

            <div className="ms-auto flex items-center gap-2">
              {params.mode === "establishments" && params.map ? (
                breakpoint === "desktop" ? (
                  <Popover open={dateTimeSheetOpen} onOpenChange={setDateTimeSheetOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("search_time_label")}
                        className={`grid size-11 shrink-0 place-items-center rounded-2xl border transition-colors duration-150 ${
                          params.date
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 bg-card hover:bg-secondary/60"
                        }`}
                      >
                        <CalendarDays className="size-5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" sideOffset={12} className="w-auto rounded-3xl border-border/60 bg-card p-0 shadow-elevation-medium">
                      <DateTimePickerPanel
                        initial={params.date ? { date: new Date(params.date), period: params.period || null } : null}
                        onApply={applyDateTimeSelection}
                        onDone={() => setDateTimeSheetOpen(false)}
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDateTimeSheetOpen(true)}
                    aria-label={t("search_time_label")}
                    className={`grid size-11 shrink-0 place-items-center rounded-2xl border transition-colors duration-150 ${
                      params.date
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-card hover:bg-secondary/60"
                    }`}
                  >
                    <CalendarDays className="size-5" />
                  </button>
                )
              ) : null}
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className={
                  params.mode === "establishments" && params.map
                    ? `relative grid size-11 shrink-0 place-items-center rounded-2xl border transition-colors duration-150 ${
                        activeFilterCount
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 bg-card hover:bg-secondary/60"
                      }`
                    : `press relative flex min-h-10 items-center gap-1.5 rounded-2xl px-3.5 text-sm font-bold transition-colors duration-150 ${
                        activeFilterCount
                          ? "bg-primary text-primary-foreground"
                          : "border border-border/60 bg-card hover:border-border"
                      }`
                }
              >
                <SlidersHorizontal className="size-4" />
                {!(params.mode === "establishments" && params.map) && t("filters_title")}
                {activeFilterCount ? (
                  <span className="grid size-5 place-items-center rounded-full bg-gold text-[10px] font-extrabold text-gold-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>
          </div>

          {/* Row 3 — date navigation (list view only; map view condenses this
              into the compact calendar-icon button in row 2 above, matching
              the reference's map-mode header exactly). */}
          {params.mode === "establishments" && !params.map && (
            <div className="mt-4">
              <DateNav
                date={params.date}
                period={params.period || null}
                onDateChange={(date) => update({ date })}
                onPeriodChange={(period) => update({ period: period ?? "" })}
              />
            </div>
          )}
        </div>
      </header>

      <main className={`mx-auto max-w-6xl px-4 pb-nav-safe md:pb-12 ${params.map ? "pt-3" : "pt-8"}`}>
        {params.mode === "establishments" && params.map ? (
          <div className="h-[70vh] overflow-hidden rounded-3xl border border-border/50">
            <Suspense fallback={<div className="grid size-full place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
              <ResultsMap businesses={mapPins} lang={lang} userLocation={geo.coords} />
            </Suspense>
          </div>
        ) : params.mode === "professionals" ? (
          professionalsQuery.isLoading ? (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => <SearchResultSkeleton key={i} />)}
            </div>
          ) : (professionalsQuery.data?.results.length ?? 0) === 0 ? (
            <EmptyState
              title={t("no_shops_match")}
              subtitle={t("try_different_filters")}
              buttonLabel={t("clear_all_filters")}
              onClear={() => update({ service: "", city: "", state: "" })}
            />
          ) : (
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {professionalsQuery.data!.results.map((p) => (
                <ProfessionalCard
                  key={p.id}
                  professional={p}
                  lang={lang}
                  currency={getDefaultCountry().currency_code}
                  distanceKm={geo.coords && p.latitude != null && p.longitude != null ? haversineKm(geo.coords, { lat: p.latitude, lng: p.longitude }) : null}
                />
              ))}
            </div>
          )
        ) : results.isLoading ? (
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <SearchResultSkeleton key={i} />)}
          </div>
        ) : finalBusinesses.length === 0 ? (
          <EmptyState
            title={t("no_shops_match")}
            subtitle={t("try_different_filters")}
            buttonLabel={t("clear_all_filters")}
            onClear={() => update({ service: "", city: "", state: "", type: "" })}
          />
        ) : (
          <>
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {finalBusinesses.map((b, i) => (
                <SearchResultCard
                  key={b.id}
                  business={b}
                  lang={lang}
                  images={(galleries.data?.get(b.id) ?? []).map((g) => ({ id: g.id, url: g.url }))}
                  badge={badgeFor(b)}
                  travel={travelMap.get(b.id)}
                  priority={i === 0}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="h-1" />
            {results.isFetchingNextPage && (
              <div className="mt-6 flex justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav tabs={[t("nav.home"), t("nav.search"), t("nav.bookings"), t("nav.favorites"), t("nav.profile")]} />

      <FilterDrawer open={filterOpen} initial={filterState} onClose={() => setFilterOpen(false)} onApply={applyFilters} />
      {breakpoint !== "desktop" && (
        <DateTimePickerSheet
          open={dateTimeSheetOpen}
          initial={params.date ? { date: new Date(params.date), period: params.period || null } : null}
          onClose={() => setDateTimeSheetOpen(false)}
          onApply={applyDateTimeSelection}
        />
      )}
      <MobileSearchSheet
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
        onSearch={({ service, location, dateTime }) => {
          setMobileSearchOpen(false);
          update({
            ...(service ? serviceSelectionPatch(service) : { service: "", category: "" }),
            ...(location ? locationSelectionPatch(location) : {}),
            ...dateTimeSelectionPatch(dateTime),
          });
        }}
      />
    </div>
  );
}

function EmptyState({
  title,
  subtitle,
  buttonLabel,
  onClear,
}: {
  title: string;
  subtitle: string;
  buttonLabel: string;
  onClear: () => void;
}) {
  return (
    <div className="mt-8 rounded-3xl border border-border/60 bg-card p-10 text-center shadow-soft">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <Search className="size-6" />
      </span>
      <p className="mt-4 font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <button
        type="button"
        onClick={onClear}
        className="press mt-5 inline-flex min-h-11 items-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
