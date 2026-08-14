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
import { LogoMark } from "@/components/dallty/logo";
import { NavMenu } from "@/components/dallty/site-nav";
import { useLiveBusinesses, type LiveBusiness } from "@/hooks/use-live-businesses";
import { useUserLocation, haversineKm } from "@/hooks/use-user-location";
import { getTravelTimes } from "@/lib/geo.functions";
import type { TravelInfo } from "@/components/dallty/business-card";
import { useLocale } from "@/lib/i18n";
import { useCountries, translate } from "@/lib/reference-data";
import { citiesFor, provincesFor } from "@/lib/arab-cities";
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

function SearchPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const { lang, t, toggleLang } = useLocale();
  const en = lang === "en";
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

  const stateOptions = useMemo(() => {
    const listed = [
      ...new Set(
        (liveBusinesses ?? [])
          .filter((s) => (!params.country || s.countryCode === params.country) && s.state)
          .map((s) => s.state),
      ),
    ].sort();
    const known = provincesFor(params.country);
    return listed.map((p) => ({ en: p, ar: known.find((k) => k.en === p)?.ar ?? p }));
  }, [liveBusinesses, params.country]);

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
    const known = citiesFor(params.country, params.state || undefined);
    return listed.map((c) => ({ en: c, ar: known.find((k) => k.en === c)?.ar ?? c }));
  }, [liveBusinesses, params.country, params.state]);

  const results = useMemo(() => {
    const name = params.q.trim().toLowerCase();
    const list = (liveBusinesses ?? []).filter(
      (s) =>
        (!params.country || s.countryCode === params.country) &&
        (!params.state || s.state === params.state) &&
        (!params.city || s.city === params.city) &&
        (!params.type || s.businessType === params.type) &&
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
    params.instant
      ? { key: "instant", label: en ? "Instant booking" : "حجز فوري", clear: { instant: false } }
      : null,
    params.open
      ? { key: "open", label: en ? "Open now" : "مفتوح الآن", clear: { open: false } }
      : null,
  ].filter(Boolean) as { key: string; label: string; clear: Partial<SearchParams> }[];

  function clearAll() {
    setDraft("");
    update({ q: "", country: "", state: "", city: "", type: "", instant: false, open: false });
  }

  return (
    <div dir={t.dir} className="relative min-h-dvh overflow-x-hidden bg-background">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 start-[-10%] size-[36rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-1/4 end-[-15%] size-[30rem] rounded-full bg-gold/20 blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="mx-auto max-w-6xl rounded-3xl glass p-3 shadow-xl sm:p-4">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              aria-label={en ? "Back home" : "العودة"}
              className="grid size-11 shrink-0 place-items-center rounded-2xl glass-soft"
            >
              <ArrowLeft className="size-5 rtl:rotate-180" />
            </Link>
            <Link
              to="/"
              aria-label={en ? "Dallty home" : "الصفحة الرئيسية"}
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
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  placeholder={en ? "Search shop name…" : "ابحث باسم المتجر…"}
                  aria-label={t.searchBtn}
                />
                {draft ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft("");
                      update({ q: "" });
                    }}
                    aria-label={en ? "Clear search" : "مسح البحث"}
                    className="grid size-8 shrink-0 place-items-center rounded-full glass-soft"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="press hidden min-h-9 shrink-0 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground sm:flex"
                >
                  {t.searchBtn}
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
              aria-label={en ? "Filters" : "الفلاتر"}
            >
              <SlidersHorizontal className="size-5" />
              {chips.length ? (
                <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-gold text-[10px] font-extrabold text-gold-foreground">
                  {chips.length}
                </span>
              ) : null}
            </button>
            <NavMenu lang={lang} onToggleLang={toggleLang} />
          </div>

          {showFilters ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                icon={<Globe className="size-4" />}
                label={en ? "Country" : "الدولة"}
                value={params.country}
                onChange={(v) => update({ country: v, state: "", city: "" })}
              >
                <option value="">{en ? "All countries" : "كل الدول"}</option>
                {countryOptions.map((c) => (
                  <option key={c.iso_code} value={c.iso_code}>
                    {c.flag} {translate(c, lang)}
                  </option>
                ))}
              </SelectField>

              <SelectField
                icon={<MapIcon className="size-4" />}
                label={en ? "State / Province" : "الولاية / المحافظة"}
                value={params.state}
                disabled={!params.country}
                onChange={(v) => update({ state: v, city: "" })}
              >
                <option value="">
                  {params.country
                    ? en
                      ? "All states"
                      : "كل الولايات"
                    : en
                      ? "Pick a country first"
                      : "اختر الدولة أولاً"}
                </option>
                {stateOptions.map((p) => (
                  <option key={p.en} value={p.en}>
                    {en ? p.en : p.ar}
                  </option>
                ))}
              </SelectField>

              <SelectField
                icon={<MapPin className="size-4" />}
                label={en ? "City" : "المدينة"}
                value={params.city}
                disabled={!params.country}
                onChange={(v) => update({ city: v })}
              >
                <option value="">
                  {params.country
                    ? en
                      ? "All cities"
                      : "كل المدن"
                    : en
                      ? "Pick a country first"
                      : "اختر الدولة أولاً"}
                </option>
                {cityOptions.map((c) => (
                  <option key={c.en} value={c.en}>
                    {en ? c.en : c.ar}
                  </option>
                ))}
              </SelectField>

              <SelectField
                icon={<Store className="size-4" />}
                label={en ? "Shop type" : "نوع المتجر"}
                value={params.type}
                onChange={(v) => update({ type: v })}
              >
                <option value="">{en ? "All shop types" : "كل الأنواع"}</option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </SelectField>

              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
                <Toggle
                  active={params.instant}
                  onClick={() => update({ instant: !params.instant })}
                  icon={<Zap className="size-4" />}
                  label={en ? "Instant booking" : "حجز فوري"}
                />
                <Toggle
                  active={params.open}
                  onClick={() => update({ open: !params.open })}
                  icon={<Sparkles className="size-4" />}
                  label={en ? "Open now" : "مفتوح الآن"}
                />
                <div className="ms-auto flex items-center gap-1 rounded-2xl glass-soft p-1">
                  {(
                    [
                      ["rating", en ? "Top rated" : "الأعلى تقييماً"],
                      ["distance", en ? "Nearest" : "الأقرب"],
                      ["reviews", en ? "Most reviewed" : "الأكثر مراجعة"],
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

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 md:pb-24">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="me-2 text-xl font-extrabold sm:text-2xl">
            {isLoading
              ? en
                ? "Searching…"
                : "جارٍ البحث…"
              : `${results.length} ${en ? "shops found" : "متجر"}`}
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
              {en ? "Clear all" : "مسح الكل"}
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
            {geo.enabled
              ? en
                ? "Nearby salons"
                : "الصالونات القريبة"
              : en
                ? "Near me"
                : "بالقرب مني"}
          </button>
          {geo.status === "denied" ? (
            <span className="text-xs font-medium text-muted-foreground">
              {en
                ? "Location is blocked in your browser — showing the normal marketplace."
                : "الموقع محظور في المتصفح — نعرض السوق بشكل عادي."}
            </span>
          ) : null}
          {geo.enabled && travelQuery.isFetching ? (
            <span className="text-xs font-medium text-muted-foreground">
              {en ? "Calculating travel times…" : "جارٍ حساب أوقات الوصول…"}
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-3xl glass" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="mt-8 rounded-3xl glass p-10 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
              <Search className="size-6" />
            </span>
            <p className="mt-4 font-bold">
              {en ? "No shops match your search." : "لا توجد متاجر مطابقة لبحثك."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {en
                ? "Try a different city, shop type, or clear the filters."
                : "جرّب مدينة أو نوع متجر مختلف، أو امسح الفلاتر."}
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="press mt-5 inline-flex min-h-11 items-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
            >
              {en ? "Clear all filters" : "مسح كل الفلاتر"}
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
            {en ? "Sorted by " : "مرتبة حسب "}
            {params.sort === "distance"
              ? en
                ? "distance"
                : "المسافة"
              : params.sort === "reviews"
                ? en
                  ? "review count"
                  : "عدد المراجعات"
                : en
                  ? "rating"
                  : "التقييم"}
          </p>
        ) : null}
      </main>

      <BottomNav tabs={t.tabs} />
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
  value,
  onChange,
  disabled,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 rounded-2xl bg-card/80 px-4 py-2 ring-1 ring-border/60 transition focus-within:ring-2 focus-within:ring-primary ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <span className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="min-h-7 w-full truncate bg-transparent text-sm font-semibold outline-none"
      >
        {children}
      </select>
    </label>
  );
}
