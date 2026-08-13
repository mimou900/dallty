import type React from "react";
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Eye,
  Flower2,
  Globe,
  MapPin,
  Map as MapIcon,
  SlidersHorizontal,
  Store,
  Hand,
  Scissors,
  Search,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";

import heroImage from "@/assets/hero-salon.jpg";
import { BottomNav } from "@/components/dallty/bottom-nav";
import { SalonCard } from "@/components/dallty/salon-card";
import { categories, salons, type Salon } from "@/lib/dallty-content";
import { useLocale } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { landingForRoles } from "@/lib/post-login";
import { SiteHeader } from "@/components/dallty/site-nav";
import { useCountries, translate } from "@/lib/reference-data";
import { citiesFor, provincesFor, provinceOfCity } from "@/lib/arab-cities";
import { BUSINESS_TYPES } from "@/lib/business-schema";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dallty — Find. Book. Relax." },
      {
        name: "description",
        content:
          "Dallty helps you find and book trusted salons, barbers, nail studios and spas near you in under a minute.",
      },
      { property: "og:title", content: "Dallty — Find. Book. Relax." },
      {
        property: "og:description",
        content: "Book salons, barbers, nails and spa across the Arab world in seconds.",
      },
    ],
  }),
  component: Index,
});

const categoryIcons = [Scissors, Scissors, Hand, Flower2, Sparkles, Eye];

type LiveSalon = Salon & { countryCode: string; state: string; city: string; businessType: string };

function Index() {
  const { lang, t, toggleLang } = useLocale();
  const { user, roles } = useAuth();
  const home = landingForRoles(roles);
  const isManager = home !== "/bookings";
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [stateName, setStateName] = useState("");
  const [city, setCity] = useState("");
  const [shopType, setShopType] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const navigate = useNavigate();

  function runSearch() {
    void navigate({
      to: "/search",
      search: {
        q: query.trim(),
        country,
        state: stateName,
        city,
        type: shopType,
        sort: "rating" as const,
        instant: false,
        open: false,
      },
    });
  }

  function scrollToResults() {
    document.getElementById("nearby")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const { data: liveSalons } = useQuery({
    queryKey: ["salons"],
    queryFn: async (): Promise<LiveSalon[]> => {
      const { data, error } = await supabase
        .from("salons")
        .select(
          "id, owner_id, name, name_ar, description, description_ar, area, area_ar, city, image_url, rating, review_count, price_range, distance_km, opens_at, closes_at, instant_booking, is_active, created_at, amenities, languages, awards, certifications, brands, cancellation_policy, cancellation_policy_ar, house_rules, house_rules_ar, owner_story, owner_story_ar, faq, video_tour_url, instagram_url, tiktok_url, address, status, business_type, website_url, facebook_url, country, country_code, district, postal_code, maps_url, employee_count, branch_count, logo_url, cover_url, is_listed",
        )
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
      }));
    },
  });

  const placeFiltered = country || stateName || city || shopType;
  const countries = useCountries();

  const countryOptions = useMemo(() => {
    const codes = new Set((liveSalons ?? []).map((s) => s.countryCode).filter(Boolean));
    return (countries.data ?? []).filter((c) => codes.has(c.iso_code));
  }, [liveSalons, countries.data]);

  const stateOptions = useMemo(() => {
    const listed = [
      ...new Set(
        (liveSalons ?? [])
          .filter((s) => (!country || s.countryCode === country) && s.state)
          .map((s) => s.state),
      ),
    ].sort();
    const known = provincesFor(country);
    return listed.map((p) => ({ en: p, ar: known.find((k) => k.en === p)?.ar ?? p }));
  }, [liveSalons, country]);

  const cityOptions = useMemo(() => {
    const listed = [
      ...new Set(
        (liveSalons ?? [])
          .filter(
            (s) =>
              (!country || s.countryCode === country) &&
              (!stateName || s.state === stateName) &&
              s.city,
          )
          .map((s) => s.city),
      ),
    ].sort();
    const known = citiesFor(country, stateName || undefined);
    return listed.map((c) => ({ en: c, ar: known.find((k) => k.en === c)?.ar ?? c }));
  }, [liveSalons, country, stateName]);

  const results = useMemo(() => {
    const list: Salon[] = placeFiltered ? (liveSalons ?? []) : (liveSalons ?? salons);
    const placed = (list as LiveSalon[]).filter(
      (s) =>
        (!country || s.countryCode === country) &&
        (!stateName || s.state === stateName) &&
        (!city || s.city === city) &&
        (!shopType || s.businessType === shopType),
    );
    const withCategory = activeCategory
      ? placed.filter((s) => s.businessType.toLowerCase().includes(activeCategory.toLowerCase()))
      : placed;
    const name = query.trim().toLowerCase();
    if (!name) return withCategory;
    // Shop-name search only (EN / AR)
    return withCategory.filter(
      (s) => s.en.name.toLowerCase().includes(name) || s.ar.name.toLowerCase().includes(name),
    );
  }, [liveSalons, query, activeCategory, country, stateName, city, shopType, placeFiltered]);

  const activeChips = useMemo(
    () =>
      [
        country
          ? (() => {
              const hit = countryOptions.find((c) => c.iso_code === country);
              return hit ? translate(hit, lang) : country;
            })()
          : "",
        stateName,
        city,
        shopType,
      ].filter(Boolean) as string[],
    [country, countryOptions, stateName, city, shopType, lang],
  );

  return (
    <div dir={t.dir} className="relative min-h-dvh overflow-x-hidden bg-background">
      {/* ambient glass background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 start-[-10%] size-[38rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-1/3 end-[-15%] size-[32rem] rounded-full bg-gold/20 blur-3xl" />
        <div className="absolute bottom-0 start-1/3 size-[28rem] rounded-full bg-sky/10 blur-3xl" />
      </div>

      <SiteHeader lang={lang} onToggleLang={toggleLang} />

      <main className="mx-auto max-w-6xl px-4 pb-32 md:pb-24">
        {/* Hero */}
        <section className="mt-4 animate-fade-up sm:mt-6">
          <div className="relative isolate overflow-hidden rounded-4xl">
            <img
              src={heroImage}
              alt="Luxury salon interior with emerald and gold details"
              width={1600}
              height={1104}
              className="absolute inset-0 -z-10 size-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-gradient-to-t from-foreground/95 via-foreground/55 to-foreground/15"
            />
            <div
              aria-hidden
              className="absolute -top-24 end-[-10%] -z-10 size-[26rem] rounded-full bg-gold/25 blur-3xl"
            />

            <div className="flex min-h-[19rem] flex-col justify-end gap-3 p-5 pb-12 sm:min-h-[26rem] sm:p-10 sm:pb-16">
              <span className="inline-flex w-fit items-center gap-2 rounded-full glass-soft px-3 py-1.5 text-[0.7rem] font-bold tracking-wide text-background sm:text-xs">
                <Sparkles className="size-3.5 shrink-0 text-gold" />
                {lang === "en"
                  ? "Trusted beauty pros across the Arab world"
                  : "خبراء تجميل موثوقون في العالم العربي"}
              </span>
              <h1 className="max-w-2xl text-[2rem] font-extrabold leading-[1.05] text-background sm:text-6xl">
                {t.heroTitle}
              </h1>
              <p className="max-w-xl text-sm text-background/85 sm:text-lg">{t.heroSub}</p>
            </div>
          </div>

          {/* Search card — sits under the hero on every size so nothing is clipped */}
          <div className="relative z-10 -mt-6 rounded-3xl glass p-3 shadow-xl sm:-mt-10 sm:mx-6 sm:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
              className="group relative grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-gradient-to-r from-primary/30 via-gold/25 to-sky/25 opacity-0 blur-lg transition-opacity duration-300 group-focus-within:opacity-100"
              />
              <label className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl bg-card/85 px-3 py-3 ring-1 ring-border/60 transition duration-300 focus-within:ring-2 focus-within:ring-primary sm:px-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground transition-colors group-focus-within:bg-primary group-focus-within:text-primary-foreground">
                  <Search className="size-4.5" />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  placeholder={lang === "en" ? "Search by shop name" : "ابحث باسم المتجر"}
                  aria-label={t.searchBtn}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={lang === "en" ? "Clear" : "مسح"}
                    className="grid size-8 shrink-0 place-items-center rounded-full glass-soft"
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </label>
              <button
                type="submit"
                className="press flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
              >
                <Search className="size-5" />
                {t.searchBtn}
              </button>
            </form>

            {/* Filters — collapsed on mobile, always open from sm up */}
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              aria-expanded={filtersOpen}
              className="press mt-2.5 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-card/85 px-4 text-sm font-bold ring-1 ring-border/60 sm:hidden"
            >
              <span className="flex min-w-0 items-center gap-2">
                <SlidersHorizontal className="size-4 shrink-0 text-primary" />
                <span className="truncate">
                  {activeChips.length
                    ? activeChips.join(" · ")
                    : lang === "en"
                      ? "Filter by location & type"
                      : "تصفية حسب الموقع والنوع"}
                </span>
              </span>
              <ChevronDown
                className={`size-4 shrink-0 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Country → State → City → Shop type */}
            <div
              className={`${filtersOpen ? "grid" : "hidden"} mt-2.5 gap-2 sm:mt-3 sm:grid sm:grid-cols-2 lg:grid-cols-4`}
            >
              <SelectField
                icon={<Globe className="size-4" />}
                label={lang === "en" ? "Country" : "الدولة"}
                value={country}
                onChange={(v) => {
                  setCountry(v);
                  setStateName("");
                  setCity("");
                }}
              >
                <option value="">{lang === "en" ? "All countries" : "كل الدول"}</option>
                {countryOptions.map((c) => (
                  <option key={c.iso_code} value={c.iso_code}>
                    {c.flag} {translate(c, lang)}
                  </option>
                ))}
              </SelectField>

              <SelectField
                icon={<MapIcon className="size-4" />}
                label={lang === "en" ? "State / Province" : "الولاية / المحافظة"}
                value={stateName}
                disabled={!country}
                onChange={(v) => {
                  setStateName(v);
                  setCity("");
                }}
              >
                <option value="">
                  {country
                    ? lang === "en"
                      ? "All states"
                      : "كل الولايات"
                    : lang === "en"
                      ? "Pick a country first"
                      : "اختر الدولة أولاً"}
                </option>
                {stateOptions.map((p) => (
                  <option key={p.en} value={p.en}>
                    {lang === "en" ? p.en : p.ar}
                  </option>
                ))}
              </SelectField>

              <SelectField
                icon={<MapPin className="size-4" />}
                label={lang === "en" ? "City" : "المدينة"}
                value={city}
                disabled={!country}
                onChange={setCity}
              >
                <option value="">
                  {country
                    ? lang === "en"
                      ? "All cities"
                      : "كل المدن"
                    : lang === "en"
                      ? "Pick a country first"
                      : "اختر الدولة أولاً"}
                </option>
                {cityOptions.map((c) => (
                  <option key={c.en} value={c.en}>
                    {lang === "en" ? c.en : c.ar}
                  </option>
                ))}
              </SelectField>

              <SelectField
                icon={<Store className="size-4" />}
                label={lang === "en" ? "Shop type" : "نوع المتجر"}
                value={shopType}
                onChange={setShopType}
              >
                <option value="">{lang === "en" ? "All shop types" : "كل الأنواع"}</option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                {results.length} {lang === "en" ? "shops match" : "متجر مطابق"}
              </span>
              {activeChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
                >
                  {chip}
                </span>
              ))}
              {placeFiltered ? (
                <button
                  type="button"
                  onClick={() => {
                    setCountry("");
                    setStateName("");
                    setCity("");
                    setShopType("");
                  }}
                  className="rounded-full glass-soft px-3 py-1 text-xs font-bold"
                >
                  {lang === "en" ? "Clear" : "مسح"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {t.stats.map(([value, label]) => (
              <div key={label} className="rounded-3xl glass px-2 py-4 text-center sm:px-4 sm:py-5">
                <p className="text-lg font-extrabold sm:text-2xl">{value}</p>
                <p className="text-[0.7rem] leading-tight text-muted-foreground sm:text-sm">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Categories */}
        <section className="mt-10 sm:mt-14">
          <h2 className="text-xl font-extrabold sm:text-3xl">{t.categoriesTitle}</h2>
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-5 sm:grid-cols-6 sm:gap-3">
            {categories.map((c, i) => {
              const Icon = categoryIcons[i];
              const active = activeCategory === c.en;
              return (
                <button
                  key={c.en}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setActiveCategory(active ? null : c.en);
                    scrollToResults();
                  }}
                  className={`press flex flex-col items-center gap-2 rounded-3xl px-2 py-4 transition sm:gap-3 sm:px-3 sm:py-6 ${
                    active ? "bg-primary text-primary-foreground shadow-lg" : "glass"
                  }`}
                >
                  <span
                    className={`grid size-10 place-items-center rounded-2xl sm:size-12 ${
                      active
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-accent text-accent-foreground"
                    }`}
                  >
                    <Icon className="size-5 sm:size-6" />
                  </span>
                  <span className="text-xs font-semibold sm:text-sm">
                    {lang === "en" ? c.en : c.ar}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Nearby */}
        <section id="nearby" className="mt-10 scroll-mt-28 sm:mt-14">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:items-end sm:gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold sm:text-3xl">{t.nearbyTitle}</h2>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{t.nearbySub}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveCategory(null);
                setCountry("");
                setStateName("");
                setCity("");
                setShopType("");
              }}
              className="press min-h-11 shrink-0 rounded-2xl glass-soft px-4 text-sm font-semibold"
            >
              {t.seeAll}
            </button>
          </div>

          {results.length === 0 ? (
            <div className="mt-6 rounded-3xl glass p-10 text-center">
              <p className="font-bold">
                No salons match “
                {[query, activeCategory, city, shopType].filter(Boolean).join(" · ") ||
                  "your search"}
                ”.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveCategory(null);
                  setCountry("");
                  setCity("");
                  setShopType("");
                }}
                className="press mt-4 inline-flex min-h-11 items-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
              >
                {t.seeAll}
              </button>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
              {results.map((s) => (
                <SalonCard key={s.id} salon={s} lang={lang} />
              ))}
            </div>
          )}
        </section>

        {/* How it works */}
        <section className="mt-12 sm:mt-16">
          <h2 className="text-xl font-extrabold sm:text-3xl">{t.stepsTitle}</h2>
          <ol className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {t.steps.map(([title, desc], i) => (
              <li className="rounded-3xl glass p-5 sm:p-6" key={title}>
                <span className="grid size-10 place-items-center rounded-2xl bg-gold text-base font-extrabold text-gold-foreground">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-base font-bold sm:mt-4 sm:text-lg">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="mt-12 overflow-hidden rounded-4xl glass p-6 text-center sm:mt-16 sm:p-14">
          <h2 className="mx-auto max-w-2xl text-2xl font-extrabold sm:text-4xl">{t.ctaTitle}</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">{t.ctaSub}</p>

          <Link
            to={user ? home : "/auth"}
            className="press mt-7 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-7 text-base font-bold text-primary-foreground"
          >
            <Smartphone className="size-5" />
            {t.ctaBtn}
          </Link>
        </section>

        <footer className="mt-12 space-y-6 pb-4 text-sm text-muted-foreground">
          <div className="grid gap-6 rounded-4xl glass p-6 sm:grid-cols-2">
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wide text-foreground">
                {t.menu.customers}
              </p>
              <nav aria-label="Customer links" className="mt-3 flex flex-col gap-2">
                <Link to="/" className="hover:text-foreground">
                  {t.menu.explore}
                </Link>
                <Link
                  to="/search"
                  search={{
                    q: "",
                    country: "",
                    state: "",
                    city: "",
                    type: "",
                    sort: "rating",
                    instant: false,
                    open: false,
                  }}
                  className="hover:text-foreground"
                >
                  {t.menu.search}
                </Link>
                <Link to="/bookings" className="hover:text-foreground">
                  {t.menu.bookings}
                </Link>
                <Link to="/favorites" className="hover:text-foreground">
                  {t.menu.favorites}
                </Link>
                <Link to="/profile" className="hover:text-foreground">
                  {t.menu.account}
                </Link>
              </nav>
            </div>
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wide text-foreground">
                {t.menu.business}
              </p>
              <nav aria-label="Business links" className="mt-3 flex flex-col gap-2">
                <Link to="/business/signup" className="hover:text-foreground">
                  {t.menu.listBusiness}
                </Link>
                <Link to="/auth" className="hover:text-foreground">
                  {t.menu.businessSignIn}
                </Link>
                <Link to="/staff/signup" className="hover:text-foreground">
                  {t.menu.staffSignIn}
                </Link>
                {isManager && (
                  <Link to={home} className="hover:text-foreground">
                    {t.menu.businessDashboard}
                  </Link>
                )}
              </nav>
            </div>
          </div>
          <p className="text-center">{t.footer}</p>
        </footer>
      </main>

      <BottomNav tabs={t.tabs} />
    </div>
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
