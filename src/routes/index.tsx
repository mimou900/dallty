import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  Eye,
  Flower2,
  MapPin,
  Store,
  Hand,
  Scissors,
  Search,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";

import { BottomNav } from "@/components/dallty/bottom-nav";
import { BusinessCard } from "@/components/dallty/business-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/dallty/select";
import type { Business } from "@/lib/dallty-content";
import { dirFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";
import { useAuth } from "@/hooks/use-auth";
import { useLiveBusinesses, type LiveBusiness } from "@/hooks/use-live-businesses";
import { landingForRoles } from "@/lib/post-login";
import { SiteHeader } from "@/components/dallty/site-nav";
import { useCountries, translate } from "@/lib/reference-data";
import { citiesFor } from "@/lib/arab-cities";
import { BUSINESS_TYPES } from "@/lib/business-schema";
import { BootSplash } from "@/components/dallty/boot-splash";

/** Radix Select can't take an empty-string item value, so "no filter" needs a sentinel. */
const ALL = "__all__";

export const Route = createFileRoute("/")({
  // Only the home route gets the full branded splash while pending (first cold load,
  // mainly) — every other route falls back to the router's generic RouteSkeleton so a
  // shared link straight into e.g. a business page doesn't show home-page branding.
  pendingComponent: BootSplash,
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

// `en` stays the stable filter key matched against businessType (business
// data, not translated UI copy); `key` looks up the translated label.
const CATEGORY_DEFS = [
  { key: "hair", en: "Hair", icon: Scissors },
  { key: "barber", en: "Barber", icon: Scissors },
  { key: "nails", en: "Nails", icon: Hand },
  { key: "spa", en: "Spa", icon: Flower2 },
  { key: "makeup", en: "Makeup", icon: Sparkles },
  { key: "lashes", en: "Lashes", icon: Eye },
] as const;

function Index() {
  const { lang } = useLocale();
  const { t, tArray } = useTranslation(["marketplace", "common"]);
  const { user, roles } = useAuth();
  const home = landingForRoles(roles);
  const isManager = home !== "/bookings";
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [country, setCountry] = useState("");
  const [stateName, setStateName] = useState("");
  const [city, setCity] = useState("");
  const [shopType, setShopType] = useState("");

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

  // Project 14 Phase 2: this was a second, independent copy of the same raw, unbounded,
  // client-side `supabase.from("businesses")` query already fixed in
  // src/hooks/use-live-businesses.ts — same audit-confirmed gaps (missing marketplace_status/
  // deleted_at/is_test checks, no server-side rate limiting). Now shares the same secure,
  // rate-limited hook instead of duplicating the query.
  const { data: liveBusinesses } = useLiveBusinesses(country || undefined);

  const placeFiltered = country || stateName || city || shopType;
  const countries = useCountries();

  const countryOptions = useMemo(() => {
    const codes = new Set((liveBusinesses ?? []).map((s) => s.countryCode).filter(Boolean));
    return (countries.data ?? []).filter((c) => codes.has(c.iso_code));
  }, [liveBusinesses, countries.data]);

  const cityOptions = useMemo(() => {
    const listed = [
      ...new Set(
        (liveBusinesses ?? [])
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
  }, [liveBusinesses, country, stateName]);

  const results = useMemo(() => {
    const list: Business[] = liveBusinesses ?? [];
    const placed = (list as LiveBusiness[]).filter(
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
  }, [liveBusinesses, query, activeCategory, country, stateName, city, shopType]);

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
    <div dir={dirFor(lang)} className="relative min-h-dvh overflow-x-hidden bg-background">
      <SiteHeader lang={lang} />

      <main className="mx-auto max-w-6xl px-4 pb-32 md:pb-24">
        {/* Hero — no photo, no headline: a full-bleed, continuously drifting color
            backdrop (three independently-timed spotlight orbits in brand
            lime/gold/mint — the same technique behind Fresha's homepage
            background, confirmed by inspecting it, reused in Dallty's own
            palette) with the search card floating directly on top, exactly
            like Fresha's layout. */}
        <section className="relative -mx-4 animate-fade-up overflow-hidden px-4 pb-2 pt-6 sm:pt-10">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="spotlight-orbit" style={{ animationDuration: "100s" }}>
              <div
                className="spotlight-blob -top-[10%] start-[10%] size-[28rem] opacity-60"
                style={{ backgroundColor: "var(--lime)" }}
              />
            </div>
            <div
              className="spotlight-orbit"
              style={{ animationDuration: "130s", animationDirection: "reverse" }}
            >
              <div
                className="spotlight-blob -bottom-[20%] end-[8%] size-[26rem] opacity-50"
                style={{ backgroundColor: "var(--gold)" }}
              />
            </div>
            <div className="spotlight-orbit" style={{ animationDuration: "80s" }}>
              <div
                className="spotlight-blob top-[10%] end-[30%] size-72 opacity-40"
                style={{ backgroundColor: "var(--primary)" }}
              />
            </div>
          </div>

          {/* Search card — three always-visible stacked fields + full-width CTA,
              matching Fresha's search form structure exactly. */}
          <div className="relative z-10 mx-auto max-w-md rounded-4xl bg-card p-4 shadow-elevation-high sm:p-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch();
              }}
              className="space-y-2.5"
            >
              <label className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl bg-muted/60 px-4 ring-1 ring-transparent transition focus-within:ring-2 focus-within:ring-primary">
                <Search className="size-5 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  placeholder={t("home_search_placeholder")}
                  aria-label={t("search_btn")}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("search_clear")}
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-card"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </label>

              <Select value={city || ALL} onValueChange={(v) => setCity(v === ALL ? "" : v)}>
                <SelectTrigger className="min-h-14 rounded-2xl bg-muted/60 px-4 text-base ring-1 ring-transparent focus:ring-2 [&>svg]:hidden">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <MapPin className="size-5 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder={t("filter_city")} />
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("filter_all_cities")}</SelectItem>
                  {cityOptions.map((c) => (
                    <SelectItem key={c.en} value={c.en}>
                      {lang === "ar" ? c.ar : c.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={shopType || ALL}
                onValueChange={(v) => setShopType(v === ALL ? "" : v)}
              >
                <SelectTrigger className="min-h-14 rounded-2xl bg-muted/60 px-4 text-base ring-1 ring-transparent focus:ring-2 [&>svg]:hidden">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <Store className="size-5 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder={t("filter_shop_type")} />
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("filter_all_shop_types")}</SelectItem>
                  {BUSINESS_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <button
                type="submit"
                className="press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime text-base font-bold text-lime-foreground shadow-lg"
              >
                <Search className="size-5" />
                {t("search_btn")}
              </button>
            </form>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                {results.length} {t("shops_match")}
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
                  {t("search_clear")}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {(tArray("stats") as [string, string][]).map(([value, label]) => (
              <div key={label} className="rounded-3xl glass px-2 py-4 text-center sm:px-4 sm:py-5">
                <p className="text-lg font-extrabold sm:text-2xl">{value}</p>
                <p className="text-[0.7rem] leading-tight text-muted-foreground sm:text-sm">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Ambient glow — the one signature element (visual-direction-c).
            Deliberately placed here, not viewport-fixed: this is the first
            confirmed-open stretch of plain canvas on the page (everything
            above this point is covered by the hero photo or opaque glass
            cards) — a fixed/edge-anchored blob was verified via live
            screenshot to land invisibly behind that opaque content. */}
        <div aria-hidden className="pointer-events-none relative h-0">
          <div className="glow-blob -z-10 top-[-14rem] start-1/2 size-[48rem] -translate-x-1/2" />
        </div>

        {/* Categories */}
        <section className="mt-10 sm:mt-14">
          <h2 className="text-xl font-extrabold sm:text-3xl">{t("categories_title")}</h2>
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-5 sm:grid-cols-6 sm:gap-3">
            {CATEGORY_DEFS.map((def) => {
              const Icon = def.icon;
              const active = activeCategory === def.en;
              return (
                <button
                  key={def.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setActiveCategory(active ? null : def.en);
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
                    {t(`categories.${def.key}` as NamespaceKeyMap["marketplace"])}
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
              <h2 className="text-xl font-extrabold sm:text-3xl">{t("nearby_title")}</h2>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{t("nearby_sub")}</p>
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
              {t("see_all")}
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
                {t("see_all")}
              </button>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
              {results.map((s) => (
                <BusinessCard key={s.id} business={s} lang={lang} />
              ))}
            </div>
          )}
        </section>

        {/* How it works */}
        <section className="mt-12 sm:mt-16">
          <h2 className="text-xl font-extrabold sm:text-3xl">{t("steps_title")}</h2>
          <ol className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {(tArray("steps") as [string, string][]).map(([title, desc], i) => (
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
          <h2 className="mx-auto max-w-2xl text-2xl font-extrabold sm:text-4xl">
            {t("cta_title")}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">{t("cta_sub")}</p>

          <Link
            to={user ? home : "/auth"}
            className="press mt-7 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-pink px-7 text-base font-bold text-pink-foreground"
          >
            <Smartphone className="size-5" />
            {t("cta_btn")}
          </Link>
        </section>

        <footer className="mt-12 space-y-6 pb-4 text-sm text-muted-foreground">
          <div className="grid gap-6 rounded-4xl glass p-6 sm:grid-cols-2">
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wide text-foreground">
                {t("menu.customers")}
              </p>
              <nav aria-label="Customer links" className="mt-3 flex flex-col gap-2">
                <Link to="/" className="hover:text-foreground">
                  {t("menu.explore")}
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
                  {t("menu.search")}
                </Link>
                <Link to="/bookings" className="hover:text-foreground">
                  {t("menu.bookings")}
                </Link>
                <Link to="/favorites" className="hover:text-foreground">
                  {t("menu.favorites")}
                </Link>
                <Link to="/profile" className="hover:text-foreground">
                  {t("menu.account")}
                </Link>
              </nav>
            </div>
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-wide text-foreground">
                {t("menu.business")}
              </p>
              <nav aria-label="Business links" className="mt-3 flex flex-col gap-2">
                <Link to="/business/signup" className="hover:text-foreground">
                  {t("menu.list_business")}
                </Link>
                <Link to="/auth" className="hover:text-foreground">
                  {t("menu.business_sign_in")}
                </Link>
                <Link to="/staff/signup" className="hover:text-foreground">
                  {t("menu.staff_sign_in")}
                </Link>
                {isManager && (
                  <Link to={home} className="hover:text-foreground">
                    {t("menu.business_dashboard")}
                  </Link>
                )}
              </nav>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms of Use
            </Link>
          </div>
          <p className="text-center">{t("footer")}</p>
        </footer>
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
