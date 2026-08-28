import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  Map as MapIcon,
  Navigation,
  Search,
  SlidersHorizontal,
  Store,
  User,
  X,
} from "lucide-react";

import { BottomNav } from "@/components/dallty/bottom-nav";
import { LogoMark } from "@/components/dallty/logo";
import { LanguageSwitcher } from "@/components/dallty/language-switcher";
import type { LiveBusiness } from "@/hooks/use-live-businesses";
import { useSearchResults } from "@/hooks/use-search-results";
import { useBusinessGalleries } from "@/hooks/use-business-galleries";
import { useBusinessFilterExtras } from "@/hooks/use-business-filter-extras";
import { useUserLocation, haversineKm } from "@/hooks/use-user-location";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { getTravelTimes } from "@/lib/geo.functions";
import { searchProfessionals } from "@/lib/professional-search.functions";
import type { TravelInfo, BusinessBadge } from "@/components/dallty/business-card";
import { dirFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import { getDefaultCountry } from "@/lib/reference-data";
import { approximateLocationFor } from "@/lib/wilaya-coords";
import { SearchResultCard } from "@/components/dallty/search/search-result-card";
import { SearchResultSkeleton } from "@/components/dallty/search/search-result-skeleton";
import { ProfessionalCard } from "@/components/dallty/search/professional-card";
import { DateNav } from "@/components/dallty/search/date-nav";
import { FilterDrawer, type FilterState } from "@/components/dallty/search/filter-drawer";
import { MobileSearchSheet } from "@/components/dallty/search/mobile-search-sheet";
import type { Period } from "@/components/dallty/datetime-picker-sheet";

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
  const [draft, setDraft] = useState(params.service);
  const [filterOpen, setFilterOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const breakpoint = useBreakpoint();
  const country = getDefaultCountry().iso_code;

  const geo = useUserLocation();
  const fetchTravel = useServerFn(getTravelTimes);
  const searchProfessionalsFn = useServerFn(searchProfessionals);

  function update(patch: Partial<SearchParams>) {
    void navigate({ search: (prev: SearchParams) => ({ ...prev, ...patch }), replace: true });
  }

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

  const resultCount = params.mode === "professionals" ? (professionalsQuery.data?.results.length ?? 0) : finalBusinesses.length;
  const isLoading = params.mode === "professionals" ? professionalsQuery.isLoading : results.isLoading;

  // Real geocodes are used as-is; a business with none gets a stable
  // approximate point within its own wilaya instead of being dropped from
  // the map entirely (the seed dataset has no real lat/lng at all today —
  // see wilaya-coords.ts's doc comment). This fallback is map-display-only:
  // it never feeds back into `b.lat/lng`, sorting, or the "X km away" text
  // elsewhere on this page, which still require a real coordinate.
  const mapPins = finalBusinesses.map((b) => {
    const real = b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng } : null;
    const approx = real ?? approximateLocationFor(b.state, b.id);
    return { id: b.id, slug: b.slug, lat: approx?.lat ?? null, lng: approx?.lng ?? null, en: b.en, ar: b.ar };
  });

  return (
    <div dir={dirFor(lang)} className="relative min-h-dvh overflow-x-hidden bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="glow-blob -top-40 start-[-10%] size-[36rem]" />
        <div className="glow-blob top-1/4 end-[-15%] size-[30rem]" style={{ animationDelay: "-8s" }} />
      </div>

      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="mx-auto max-w-6xl rounded-3xl glass p-3 shadow-xl sm:p-4">
          {/* Row 1 — logo, search, menu */}
          <div className="flex items-center gap-3">
            <Link to="/" aria-label={t("back_home")} className="grid size-11 shrink-0 place-items-center rounded-2xl glass-soft">
              <ArrowLeft className="size-5 rtl:rotate-180" />
            </Link>
            <Link to="/" aria-label={t("dallty_home")} className="hidden items-center gap-2 sm:flex">
              <LogoMark className="size-9" />
            </Link>

            {breakpoint === "desktop" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update({ service: draft });
                }}
                className="group relative flex min-w-0 flex-1 items-center"
              >
                <label className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-2xl bg-card/85 px-4 ring-1 ring-border/60 transition focus-within:ring-2 focus-within:ring-primary">
                  <Search className="size-5 shrink-0 text-muted-foreground" />
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    placeholder={t("search_service_placeholder")}
                    aria-label={t("search_btn")}
                  />
                  {draft ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft("");
                        update({ service: "" });
                      }}
                      aria-label={t("search_clear_aria")}
                      className="grid size-8 shrink-0 place-items-center rounded-full glass-soft"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                  <button type="submit" className="press hidden min-h-9 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground sm:flex">
                    {t("search_btn")}
                  </button>
                </label>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setMobileSearchOpen(true)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-card/85 px-4 text-start ring-1 ring-border/60"
              >
                <Search className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {params.service || t("search_service_placeholder")}
                </span>
              </button>
            )}

            <LanguageSwitcher variant="icon" />
          </div>

          {/* Row 2 — mode toggle, count, filters, map */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-2xl glass-soft p-1">
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

            <p className="text-sm font-semibold text-muted-foreground">
              {isLoading ? t("searching") : `${resultCount} ${t("shops_found")}`}
            </p>

            <div className="ms-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className={`press relative flex min-h-10 items-center gap-1.5 rounded-2xl px-3.5 text-sm font-bold ${
                  activeFilterCount ? "bg-primary text-primary-foreground" : "glass-soft"
                }`}
              >
                <SlidersHorizontal className="size-4" />
                {t("filters_title")}
                {activeFilterCount ? (
                  <span className="grid size-5 place-items-center rounded-full bg-gold text-[10px] font-extrabold text-gold-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
              {params.mode === "establishments" && (
                <button
                  type="button"
                  onClick={() => update({ map: !params.map })}
                  className={`press flex min-h-10 items-center gap-1.5 rounded-2xl px-3.5 text-sm font-bold ${
                    params.map ? "bg-primary text-primary-foreground" : "glass-soft"
                  }`}
                >
                  <MapIcon className="size-4" />
                  {params.map ? t("show_list") : t("show_map")}
                </button>
              )}
            </div>
          </div>

          {/* Row 3 — date navigation */}
          {params.mode === "establishments" && (
            <div className="mt-3">
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

      <main className="mx-auto max-w-6xl px-4 pb-nav-safe pt-6 md:pb-12">
        {geo.status === "denied" && (
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Navigation className="size-3.5" />
            {t("location_blocked")}
          </p>
        )}

        {params.mode === "establishments" && params.map ? (
          <div className="h-[70vh] overflow-hidden rounded-3xl border border-border/50">
            <Suspense fallback={<div className="grid size-full place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
              <ResultsMap businesses={mapPins} lang={lang} />
            </Suspense>
          </div>
        ) : params.mode === "professionals" ? (
          professionalsQuery.isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
      <MobileSearchSheet
        open={mobileSearchOpen}
        onClose={() => setMobileSearchOpen(false)}
        onSearch={({ service, location, dateTime }) => {
          setMobileSearchOpen(false);
          update({
            service: service?.kind === "query" ? service.value : "",
            category: service?.kind === "category" ? service.value : "",
            state: location?.kind === "place" ? location.wilaya : "",
            city: location?.kind === "place" ? location.commune : "",
            date: dateTime ? dateTime.date.toISOString().slice(0, 10) : "",
            period: dateTime?.period ?? "",
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
    <div className="mt-8 rounded-3xl glass p-10 text-center">
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
