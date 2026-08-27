import type React from "react";
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Globe,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  X,
  Zap,
} from "lucide-react";

import { BottomNav } from "@/components/dallty/bottom-nav";
import { BusinessCard } from "@/components/dallty/business-card";
import { SearchSkeleton } from "@/components/dallty/skeletons";
import { LogoMark } from "@/components/dallty/logo";
import { LanguageSwitcher } from "@/components/dallty/language-switcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/dallty/select";
import { useLiveBusinesses, type LiveBusiness } from "@/hooks/use-live-businesses";
import { useUserLocation, haversineKm } from "@/hooks/use-user-location";
import { getTravelTimes } from "@/lib/geo.functions";
import type { TravelInfo } from "@/components/dallty/business-card";
import { dirFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import { useCountries, useRegions, useCities, translate } from "@/lib/reference-data";
import { BUSINESS_TYPES } from "@/lib/business-schema";

type SearchParams = {
  q: string;
  country: string;
  state: string;
  city: string;
  type: string;
  sort: "rating" | "distance" | "reviews";
  instant: boolean;
  open: boolean;
};

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === "string" ? search.q : "",
    country: typeof search.country === "string" ? search.country : "",
    state: typeof search.state === "string" ? search.state : "",
    city: typeof search.city === "string" ? search.city : "",
    type: typeof search.type === "string" ? search.type : "",
    sort:
      search.sort === "distance" || search.sort === "reviews" || search.sort === "rating"
        ? search.sort
        : "rating",
    instant: search.instant === true || search.instant === "true",
    open: search.open === true || search.open === "true",
  }),
  head: () => ({
    meta: [
      { title: "Search salons & barbers — Dallty" },
      {
        name: "description",
        content:
          "Search Dallty for salons, barbers, nail studios and spas by country, province, city and shop type — with live availability and instant booking.",
      },
      { property: "og:title", content: "Search salons & barbers — Dallty" },
      {
        property: "og:description",
        content:
          "Filter beauty shops across the Arab world by location, type, rating and instant booking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

/** Radix Select can't take an empty-string item value, so "no filter" needs a sentinel. */
const ALL = "__all__";

function SearchPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const { lang } = useLocale();
  const { t } = useTranslation(["marketplace", "common"]);
  const [draft, setDraft] = useState(params.q);
  const [showFilters, setShowFilters] = useState(false);

  const { data: liveBusinesses, isLoading } = useLiveBusinesses();
  const geo = useUserLocation();
  const fetchTravel = useServerFn(getTravelTimes);
  const countries = useCountries();

  function update(patch: Partial<SearchParams>) {
    void navigate({ search: (prev: SearchParams) => ({ ...prev, ...patch }), replace: true });
  }

  const countryOptions = useMemo(() => {
    const codes = new Set((liveBusinesses ?? []).map((s) => s.countryCode).filter(Boolean));
    return (countries.data ?? []).filter((c) => codes.has(c.iso_code));
  }, [liveBusinesses, countries.data]);

  const selectedCountryId = useMemo(
    () => countryOptions.find((c) => c.iso_code === params.country)?.id ?? null,
    [countryOptions, params.country],
  );
  // Real administrative geography (Project 04), not a hardcoded per-country lookup table —
  // businesses.state/city are still free text (no region_id data exists yet to join on), so
  // this is a best-effort name match against the real regions/cities reference tables purely
  // for translation, exactly the same fallback-to-raw-string pattern
  // business-category-label.ts already established for the same "free text vs. reference
  // table" mismatch. A country with no seeded regions (anything but Algeria, today) simply
  // falls back to the raw stored string — never a hardcoded Algeria/Arabic assumption.
  const regions = useRegions(selectedCountryId);
  const selectedRegionId = useMemo(
    () =>
      regions.data?.find((r) => r.default_name.toLowerCase() === params.state.toLowerCase())?.id ??
      null,
    [regions.data, params.state],
  );
  const cities = useCities(selectedRegionId);

  const stateOptions = useMemo(() => {
    const listed = [
      ...new Set(
        (liveBusinesses ?? [])
          .filter((s) => (!params.country || s.countryCode === params.country) && s.state)
          .map((s) => s.state),
      ),
    ].sort();
    return listed.map((name) => {
      const match = regions.data?.find((r) => r.default_name.toLowerCase() === name.toLowerCase());
      return { value: name, label: match ? translate(match, lang) : name };
    });
  }, [liveBusinesses, params.country, regions.data, lang]);

  const cityOptions = useMemo(() => {
    const listed = [
      ...new Set(
        (liveBusinesses ?? [])
          .filter(
            (s) =>
              (!params.country || s.countryCode === params.country) &&
              (!params.state || s.state === params.state) &&
              s.city,
          )
          .map((s) => s.city),
      ),
    ].sort();
    return listed.map((name) => {
      const match = cities.data?.find((c) => c.default_name.toLowerCase() === name.toLowerCase());
      return { value: name, label: match ? translate(match, lang) : name };
    });
  }, [liveBusinesses, params.country, params.state, cities.data, lang]);

  const results = useMemo(() => {
    const name = params.q.trim().toLowerCase();
    const list = (liveBusinesses ?? []).filter(
      (s) =>
        (!params.country || s.countryCode === params.country) &&
        (!params.state || s.state === params.state) &&
        (!params.city || s.city === params.city) &&
        // Substring, not exact match: the home page's full-screen service search
        // also feeds this `type` param from its own richer DB category list (e.g.
        // "hair"), which doesn't share exact string values with BUSINESS_TYPES
        // (e.g. "Hair studio") — a loose match keeps both entry points working
        // without forcing the two taxonomies into one shared enum.
        (!params.type || s.businessType.toLowerCase().includes(params.type.toLowerCase())) &&
        (!params.instant || s.instant) &&
        (!params.open || s.open) &&
        (!name || s.en.name.toLowerCase().includes(name) || s.ar.name.toLowerCase().includes(name)),
    );
    const sorted = [...list];
    if (params.sort === "distance")
      sorted.sort((a, b) => nearKm(geo.coords, a) - nearKm(geo.coords, b));
    else if (params.sort === "reviews") sorted.sort((a, b) => b.reviews - a.reviews);
    else sorted.sort((a, b) => b.rating - a.rating);
    return sorted as LiveBusiness[];
  }, [liveBusinesses, params, geo.coords]);

  // Travel times are only requested once the visitor granted location access.
  const nearest = useMemo(
    () =>
      geo.coords
        ? results
            .filter((s) => s.lat != null && s.lng != null)
            .slice(0, 12)
            .map((s) => ({ id: s.id, lat: s.lat as number, lng: s.lng as number }))
        : [],
    [results, geo.coords],
  );

  const travelQuery = useQuery({
    queryKey: [
      "travel-times",
      geo.coords?.lat.toFixed(3),
      geo.coords?.lng.toFixed(3),
      nearest.map((n) => n.id).join(","),
    ],
    enabled: Boolean(geo.coords) && nearest.length > 0,
    staleTime: 1000 * 60 * 10,
    retry: false,
    queryFn: () => fetchTravel({ data: { origin: geo.coords!, destinations: nearest } }),
  });

  const travel = useMemo(() => {
    const map = new Map<string, TravelInfo>();
    for (const business of results) {
      if (!geo.coords || business.lat == null || business.lng == null) continue;
      const hit = (travelQuery.data ?? []).find((t) => t.id === business.id);
      map.set(business.id, {
        km:
          hit?.distanceMeters != null
            ? hit.distanceMeters / 1000
            : haversineKm(geo.coords, { lat: business.lat, lng: business.lng }),
        drivingMinutes: hit?.drivingSeconds != null ? Math.round(hit.drivingSeconds / 60) : null,
        walkingMinutes: hit?.walkingSeconds != null ? Math.round(hit.walkingSeconds / 60) : null,
      });
    }
    return map;
  }, [results, travelQuery.data, geo.coords]);

  async function enableNearby(sortByDistance = true) {
    const coords = await geo.request();
    if (coords && sortByDistance) update({ sort: "distance" });
  }

  const chips = [
    params.country
      ? {
          key: "country",
          label: (() => {
            const hit = countryOptions.find((c) => c.iso_code === params.country);
            return hit ? translate(hit, lang) : params.country;
          })(),
          clear: { country: "", state: "", city: "" },
        }
      : null,
    params.state ? { key: "state", label: params.state, clear: { state: "", city: "" } } : null,
    params.city ? { key: "city", label: params.city, clear: { city: "" } } : null,
    params.type ? { key: "type", label: params.type, clear: { type: "" } } : null,
    params.instant ? { key: "instant", label: t("instant"), clear: { instant: false } } : null,
    params.open ? { key: "open", label: t("open"), clear: { open: false } } : null,
  ].filter(Boolean) as { key: string; label: string; clear: Partial<SearchParams> }[];

  function clearAll() {
    setDraft("");
    update({ q: "", country: "", state: "", city: "", type: "", instant: false, open: false });
  }

  return (
    <div dir={dirFor(lang)} className="relative min-h-dvh overflow-x-hidden bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="glow-blob -top-40 start-[-10%] size-[36rem]" />
        <div
          className="glow-blob top-1/4 end-[-15%] size-[30rem]"
          style={{ animationDelay: "-8s" }}
        />
      </div>

      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="mx-auto max-w-6xl rounded-3xl glass p-3 shadow-xl sm:p-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label={t("back_home")}
              className="grid size-11 shrink-0 place-items-center rounded-2xl glass-soft"
            >
              <ArrowLeft className="size-5 rtl:rotate-180" />
            </Link>
            <Link
              to="/"
              aria-label={t("dallty_home")}
              className="hidden items-center gap-2 sm:flex"
            >
              <LogoMark className="size-9" />
            </Link>

            {/* Modern search field */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                update({ q: draft });
              }}
              className="group relative flex min-w-0 flex-1 items-center"
            >
              <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-gradient-to-r from-primary/25 via-gold/20 to-sky/20 opacity-0 blur-md transition-opacity duration-300 group-focus-within:opacity-100" />
              <label className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-2xl bg-card/85 px-4 ring-1 ring-border/60 transition focus-within:ring-2 focus-within:ring-primary">
                <Search className="size-5 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  placeholder={t("search_shop_name_placeholder")}
                  aria-label={t("search_btn")}
                />
                {draft ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("");
                      update({ q: "" });
                    }}
                    aria-label={t("search_clear_aria")}
                    className="grid size-8 shrink-0 place-items-center rounded-full glass-soft"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="press hidden min-h-9 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground sm:flex"
                >
                  {t("search_btn")}
                </button>
              </label>
            </form>

            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`press relative grid size-11 shrink-0 place-items-center rounded-2xl ${
                showFilters || chips.length ? "bg-primary text-primary-foreground" : "glass-soft"
              }`}
              aria-label={t("filters_aria")}
            >
              <SlidersHorizontal className="size-5" />
              {chips.length ? (
                <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-extrabold text-gold-foreground">
                  {chips.length}
                </span>
              ) : null}
            </button>
            <LanguageSwitcher variant="icon" />
          </div>

          {showFilters ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                icon={<Globe className="size-4" />}
                label={t("filter_country")}
                placeholder={t("filter_all_countries")}
                value={params.country}
                onChange={(v) => update({ country: v, state: "", city: "" })}
              >
                {countryOptions.map((c) => (
                  <SelectItem key={c.iso_code} value={c.iso_code}>
                    {c.flag} {translate(c, lang)}
                  </SelectItem>
                ))}
              </SelectField>

              <SelectField
                icon={<MapIcon className="size-4" />}
                label={t("filter_state")}
                placeholder={
                  params.country ? t("filter_all_states") : t("filter_pick_country_first")
                }
                value={params.state}
                disabled={!params.country}
                onChange={(v) => update({ state: v, city: "" })}
              >
                {stateOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectField>

              <SelectField
                icon={<MapPin className="size-4" />}
                label={t("filter_city")}
                placeholder={
                  params.country ? t("filter_all_cities") : t("filter_pick_country_first")
                }
                value={params.city}
                disabled={!params.country}
                onChange={(v) => update({ city: v })}
              >
                {cityOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectField>

              <SelectField
                icon={<Store className="size-4" />}
                label={t("filter_shop_type")}
                placeholder={t("filter_all_shop_types")}
                value={params.type}
                onChange={(v) => update({ type: v })}
              >
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectField>

              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
                <Toggle
                  active={params.instant}
                  onClick={() => update({ instant: !params.instant })}
                  icon={<Zap className="size-4" />}
                  label={t("instant")}
                />
                <Toggle
                  active={params.open}
                  onClick={() => update({ open: !params.open })}
                  icon={<Sparkles className="size-4" />}
                  label={t("open")}
                />
                <div className="ms-auto flex items-center gap-1 rounded-2xl glass-soft p-1">
                  {(
                    [
                      ["rating", t("sort_top_rated")],
                      ["distance", t("sort_nearest")],
                      ["reviews", t("sort_most_reviewed")],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        update({ sort: key });
                        if (key === "distance" && !geo.coords) void enableNearby(false);
                      }}
                      className={`min-h-9 rounded-xl px-3 text-xs font-bold transition-colors ${
                        params.sort === key
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-nav-safe pt-6 md:pb-12">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="me-2 text-xl font-extrabold sm:text-2xl">
            {isLoading ? t("searching") : `${results.length} ${t("shops_found")}`}
          </h1>
          {params.q ? (
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              “{params.q}”
            </span>
          ) : null}
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update(chip.clear)}
              className="press flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
            >
              {chip.label}
              <X className="size-3.5" />
            </button>
          ))}
          {chips.length || params.q ? (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-full glass-soft px-3 py-1 text-xs font-bold"
            >
              {t("clear_all")}
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void enableNearby()}
            disabled={geo.status === "prompting"}
            className={`press inline-flex min-h-10 items-center gap-2 rounded-2xl px-4 text-sm font-bold ${
              geo.enabled ? "bg-primary text-primary-foreground" : "glass-soft"
            }`}
          >
            {geo.status === "prompting" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Navigation className="size-4" />
            )}
            {geo.enabled ? t("nearby_salons_btn") : t("near_me_btn")}
          </button>
          {geo.status === "denied" ? (
            <span className="text-xs font-medium text-muted-foreground">
              {t("location_blocked")}
            </span>
          ) : null}
          {geo.enabled && travelQuery.isFetching ? (
            <span className="text-xs font-medium text-muted-foreground">
              {t("calculating_travel_times")}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="mt-6">
            <SearchSkeleton count={4} />
          </div>
        ) : results.length === 0 ? (
          <div className="mt-8 rounded-3xl glass p-10 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
              <Search className="size-6" />
            </span>
            <p className="mt-4 font-bold">{t("no_shops_match")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("try_different_filters")}</p>
            <button
              type="button"
              onClick={clearAll}
              className="press mt-5 inline-flex min-h-11 items-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
            >
              {t("clear_all_filters")}
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((s) => (
              <BusinessCard key={s.id} business={s} lang={lang} travel={travel.get(s.id)} />
            ))}
          </div>
        )}

        {!isLoading && results.length > 0 ? (
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Star className="size-4 text-gold" />
            {t("sorted_by")}
            {params.sort === "distance"
              ? t("sort_by_distance")
              : params.sort === "reviews"
                ? t("sort_by_reviews")
                : t("sort_by_rating")}
          </p>
        ) : null}
      </main>

      <BottomNav
        tabs={[
          t("nav.home"),
          t("nav.search"),
          t("nav.bookings"),
          t("nav.favorites"),
          t("nav.profile"),
        ]}
      />
    </div>
  );
}

function nearKm(coords: { lat: number; lng: number } | null, business: LiveBusiness) {
  if (!coords || business.lat == null || business.lng == null) return Number.POSITIVE_INFINITY;
  return haversineKm(coords, { lat: business.lat, lng: business.lng });
}

function Toggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`press flex min-h-10 items-center gap-2 rounded-2xl px-4 text-sm font-semibold ${
        active ? "bg-primary text-primary-foreground" : "glass-soft"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SelectField({
  icon,
  label,
  placeholder,
  value,
  onChange,
  disabled,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl bg-card/80 px-4 py-2 ring-1 ring-border/60 transition focus-within:ring-2 focus-within:ring-primary ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <Select
        value={value || ALL}
        onValueChange={(v) => onChange(v === ALL ? "" : v)}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label={label}
          className="min-h-7 w-full rounded-none bg-transparent p-0 text-sm font-semibold ring-0 focus:ring-0 [&>svg]:size-3.5"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {children}
        </SelectContent>
      </Select>
    </div>
  );
}
