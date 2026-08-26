import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, Flower2, Gem, Hand, Scissors, Smartphone, Sparkles, Waves } from "lucide-react";

import { BottomNav } from "@/components/dallty/bottom-nav";
import { BusinessCard } from "@/components/dallty/business-card";
import { HomeSearchBar } from "@/components/dallty/home-search-bar";
import { ServiceSearchSheet, ServiceSearchPanel } from "@/components/dallty/service-search-sheet";
import {
  LocationPickerSheet,
  LocationPickerPanel,
  type LocationSelection,
} from "@/components/dallty/location-picker-sheet";
import {
  DateTimePickerSheet,
  DateTimePickerPanel,
  type DateTimeSelection,
} from "@/components/dallty/datetime-picker-sheet";
import type { Business } from "@/lib/dallty-content";
import { dirFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";
import { useAuth } from "@/hooks/use-auth";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { haversineKm, useUserLocation } from "@/hooks/use-user-location";
import { useLiveBusinesses, type LiveBusiness } from "@/hooks/use-live-businesses";
import { landingForRoles } from "@/lib/post-login";
import { SiteHeader } from "@/components/dallty/site-nav";
import { getDefaultCountry, type Category } from "@/lib/reference-data";
import { BootSplash } from "@/components/dallty/boot-splash";

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
  { key: "massage", en: "Massage", icon: Waves },
  { key: "beauty", en: "Beauty", icon: Gem },
] as const;

// The real DB `categories` table (Hair Salon, Barbershop, Beauty Salon...) is richer
// and icon-backed, but `businesses.business_type` on live rows is still the flat
// BUSINESS_TYPES list (Hair studio, Barbershop, Nail studio...) — no shared key joins
// them. This maps a DB category to the loose keyword that already works against real
// businessType strings (same substring-match technique the category tiles below use),
// so picking a real category in the full-screen search actually filters real results
// instead of silently returning nothing. Categories with no plausible businessType
// counterpart (Waxing, Eyebrows & Lashes, Laser Hair Removal, Permanent Makeup,
// Wellness Center) fall back to their closest umbrella rather than matching nothing.
const CATEGORY_KEYWORD: Record<string, string> = {
  "Hair Salon": "hair",
  Barbershop: "barber",
  "Beauty Salon": "beauty",
  "Nail Salon": "nail",
  Spa: "spa",
  Massage: "spa",
  Waxing: "beauty",
  "Makeup Studio": "makeup",
  "Eyebrows & Lashes": "beauty",
  "Laser Hair Removal": "skin",
  Skincare: "skin",
  "Permanent Makeup": "makeup",
  "Wellness Center": "spa",
};

type ServiceState = { label: string; keyword?: string; query?: string } | null;

function periodLabel(period: DateTimeSelection["period"]) {
  if (period === "morning") return "Morning";
  if (period === "afternoon") return "Afternoon";
  if (period === "evening") return "Evening";
  return null;
}

function dateTimeLabel(sel: DateTimeSelection | null, todayStr: string, tomorrowStr: string) {
  if (!sel) return null;
  const dateStr = sel.date.toDateString();
  const dayPart =
    dateStr === todayStr
      ? "Today"
      : dateStr === tomorrowStr
        ? "Tomorrow"
        : sel.date.toLocaleDateString("en", { day: "numeric", month: "short" });
  const period = periodLabel(sel.period);
  return period ? `${dayPart} · ${period}` : dayPart;
}

function Index() {
  const { lang } = useLocale();
  const { t, tArray } = useTranslation(["marketplace", "common"]);
  const { user, roles } = useAuth();
  const home = landingForRoles(roles);
  const isManager = home !== "/bookings";
  const navigate = useNavigate();
  const geo = useUserLocation();
  const country = getDefaultCountry().iso_code;
  // Mobile gets the full-screen sheet flows (item 21 of the redesign brief); desktop
  // gets the same 3 flows as anchored popovers instead — never a phone-sized panel
  // on a desktop viewport. Tablet is treated as mobile for now (still a real,
  // working full-screen flow, just not the dedicated "large bottom sheet" variant).
  const isDesktop = useBreakpoint() === "desktop";

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [serviceState, setServiceState] = useState<ServiceState>(null);
  const [locationState, setLocationState] = useState<LocationSelection | null>(null);
  const [dateTimeState, setDateTimeState] = useState<DateTimeSelection | null>(null);

  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [serviceQuery, setServiceQuery] = useState("");
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [dateTimeSheetOpen, setDateTimeSheetOpen] = useState(false);

  const { data: liveBusinesses } = useLiveBusinesses(country);

  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);

  const locationLabel = useMemo(() => {
    if (!locationState) return null;
    if (locationState.kind === "current") return "Current location";
    return locationState.commune
      ? `${lang === "ar" ? locationState.wilayaAr : locationState.wilaya} · ${
          lang === "ar" ? locationState.communeAr : locationState.commune
        }`
      : lang === "ar"
        ? locationState.wilayaAr
        : locationState.wilaya;
  }, [locationState, lang]);

  const dtLabel = useMemo(
    () => dateTimeLabel(dateTimeState, today.toDateString(), tomorrow.toDateString()),
    [dateTimeState, today, tomorrow],
  );

  function runSearch() {
    void navigate({
      to: "/search",
      search: {
        q: serviceState?.query ?? "",
        country,
        state: locationState?.kind === "place" ? locationState.wilaya : "",
        city: locationState?.kind === "place" ? locationState.commune : "",
        type: serviceState?.keyword ?? "",
        sort: locationState?.kind === "current" ? ("distance" as const) : ("rating" as const),
        instant: false,
        open: false,
      },
    });
  }

  function scrollToResults() {
    document.getElementById("nearby")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectCategory(cat: Category) {
    const label = cat.translations[lang] ?? cat.default_name;
    setServiceState({ label, keyword: CATEGORY_KEYWORD[cat.default_name] ?? label.toLowerCase() });
    setServiceQuery("");
    setServiceSheetOpen(false);
  }

  const results = useMemo(() => {
    const list: Business[] = liveBusinesses ?? [];
    let placed = (list as LiveBusiness[]).filter((s) => {
      if (locationState?.kind === "place") {
        if (s.state !== locationState.wilaya) return false;
        if (locationState.commune && s.city !== locationState.commune) return false;
      }
      return true;
    });
    if (activeCategory) {
      placed = placed.filter((s) =>
        s.businessType.toLowerCase().includes(activeCategory.toLowerCase()),
      );
    }
    if (serviceState?.keyword) {
      const kw = serviceState.keyword.toLowerCase();
      placed = placed.filter((s) => s.businessType.toLowerCase().includes(kw));
    }
    if (serviceState?.query) {
      const q = serviceState.query.toLowerCase();
      placed = placed.filter(
        (s) => s.en.name.toLowerCase().includes(q) || s.ar.name.toLowerCase().includes(q),
      );
    }
    if (locationState?.kind === "current" && geo.coords) {
      const origin = geo.coords;
      placed = [...placed].sort((a, b) => {
        const da =
          a.lat != null && a.lng != null
            ? haversineKm(origin, { lat: a.lat, lng: a.lng })
            : Infinity;
        const db =
          b.lat != null && b.lng != null
            ? haversineKm(origin, { lat: b.lat, lng: b.lng })
            : Infinity;
        return da - db;
      });
    }
    return placed;
  }, [liveBusinesses, locationState, activeCategory, serviceState, geo.coords]);

  function clearAllFilters() {
    setActiveCategory(null);
    setServiceState(null);
    setLocationState(null);
    setDateTimeState(null);
  }

  return (
    <div
      dir={dirFor(lang)}
      className="relative min-h-dvh overflow-x-hidden bg-cream text-cream-foreground"
    >
      {/* Header + hero share one atmospheric surface: the backdrop is a sibling of
          both, absolutely positioned to this wrapper (sized by its content — header
          height + hero height), so the navbar floats as translucent glass *inside*
          the same living background instead of sitting on a separate plain strip
          above a differently-colored hero. Nothing below this wrapper is affected —
          it's sized to its own content, not the viewport. */}
      <div className="relative">
        {/* Atmosphere — soft diffused *light*, not colored blocks. Each field is a
            radial-gradient fading to transparent, blurred, and independently
            animated (see atmosphere-drift in styles.css: transform + opacity, 11-20s,
            staggered so the drift is genuinely noticeable within a few seconds).
            Colors are single-strength in the gradient itself (no baked-in alpha
            stacked on top of the animated opacity — an earlier pass double-dampened
            both together and the result was nearly invisible); Deep Green stays the
            most restrained since it's structurally dark, lime/pink/white read as
            soft light even near full strength because they're bright to begin with.
            Vertical depth: white/cream dominate near the navbar, color builds
            through the middle, then the (now much shorter) bottom-fade dissolves
            everything back to solid Cream in just the final stretch of the hero —
            a fade that used to eat 65% of the hero's height, hiding most of the
            lower blob, now covers ~28%. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="atmosphere-blob top-[5%] end-[8%] size-72 sm:size-96 lg:size-[32rem]"
            style={{
              backgroundImage: "radial-gradient(circle, oklch(1 0 0 / 0.55) 0%, transparent 68%)",
              animationDuration: "11s",
            }}
          />
          <div
            className="atmosphere-blob top-[20%] start-[-12%] size-[26rem] sm:size-[34rem] lg:size-[46rem]"
            style={{
              backgroundImage:
                "radial-gradient(circle, oklch(from var(--lime) l c h / 0.5) 0%, transparent 70%)",
              animationDuration: "14s",
              animationDelay: "-4s",
            }}
          />
          <div
            className="atmosphere-blob top-[10%] end-[-12%] size-[22rem] sm:size-[28rem] lg:size-[38rem]"
            style={{
              backgroundImage:
                "radial-gradient(circle, oklch(from var(--primary) l c h / 0.28) 0%, transparent 70%)",
              animationDuration: "20s",
              animationDelay: "-9s",
            }}
          />
          <div
            className="atmosphere-blob bottom-[-5%] start-[18%] size-[26rem] sm:size-[32rem] lg:size-[44rem]"
            style={{
              backgroundImage:
                "radial-gradient(circle, oklch(from var(--pink) l c h / 0.5) 0%, transparent 70%)",
              animationDuration: "17s",
              animationDelay: "-2s",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-[28%] bg-gradient-to-b from-transparent via-cream/50 to-cream" />
        </div>

        <SiteHeader lang={lang} />

        <div className="mx-auto max-w-6xl px-4">
          {/* Hero — spacious, editorial, Fresha-inspired: huge open space, a bold
              centered headline, and the floating search as the visual centerpiece. */}
          <section className="relative animate-fade-up pb-4 pt-8 sm:pt-14 lg:pb-8 lg:pt-20">
            <h1 className="text-display mx-auto max-w-3xl text-center text-primary">
              {t("hero_title")}
            </h1>
            <p className="text-body-lg mx-auto mt-4 max-w-xl text-balance text-center text-cream-foreground/70">
              {t("hero_sub")}
            </p>

            <div className="mt-8 sm:mt-10 lg:mt-12">
              <HomeSearchBar
                serviceLabel={serviceState?.label ?? null}
                locationLabel={locationLabel}
                dateTimeLabel={dtLabel}
                resultCount={results.length}
                onOpenService={() => setServiceSheetOpen(true)}
                onOpenLocation={() => setLocationSheetOpen(true)}
                onOpenDateTime={() => setDateTimeSheetOpen(true)}
                onClearService={() => setServiceState(null)}
                onClearLocation={() => setLocationState(null)}
                onClearDateTime={() => setDateTimeState(null)}
                onClearAll={clearAllFilters}
                onSearch={runSearch}
                servicePopover={
                  isDesktop
                    ? {
                        open: serviceSheetOpen,
                        onOpenChange: setServiceSheetOpen,
                        panel: (
                          <ServiceSearchPanel
                            query={serviceQuery}
                            onQueryChange={setServiceQuery}
                            onSelectCategory={selectCategory}
                            onSelectBusiness={(slug) => {
                              setServiceSheetOpen(false);
                              void navigate({
                                to: "/business/$businessSlug",
                                params: { businessSlug: slug },
                              });
                            }}
                            onSubmitQuery={(q) => {
                              setServiceState({ label: q, query: q });
                              setServiceSheetOpen(false);
                            }}
                          />
                        ),
                      }
                    : undefined
                }
                locationPopover={
                  isDesktop
                    ? {
                        open: locationSheetOpen,
                        onOpenChange: setLocationSheetOpen,
                        panel: (
                          <LocationPickerPanel
                            geo={geo}
                            onSelect={setLocationState}
                            onDone={() => setLocationSheetOpen(false)}
                          />
                        ),
                      }
                    : undefined
                }
                dateTimePopover={
                  isDesktop
                    ? {
                        open: dateTimeSheetOpen,
                        onOpenChange: setDateTimeSheetOpen,
                        panel: (
                          <DateTimePickerPanel
                            initial={dateTimeState}
                            onApply={setDateTimeState}
                            onDone={() => setDateTimeSheetOpen(false)}
                          />
                        ),
                      }
                    : undefined
                }
              />
            </div>

            <div className="relative mt-8 grid grid-cols-3 gap-2 sm:mt-10 sm:gap-3">
              {(tArray("stats") as [string, string][]).map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-3xl border border-border/30 bg-white/70 px-2 py-4 text-center shadow-elevation-low sm:px-4 sm:py-5"
                >
                  <p className="text-lg font-extrabold text-primary sm:text-2xl">{value}</p>
                  <p className="text-[0.7rem] leading-tight text-muted-foreground sm:text-sm">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-32 md:pb-24">
        {/* Categories — plain Cream canvas from here down (no hero atmosphere): white
            cards with pale-green icon circles, not tinted-green surfaces, per the
            brand hierarchy (Cream/white dominant, green/lime/pink used sparingly). */}
        <section className="mt-10 sm:mt-14">
          <h2 className="text-xl font-extrabold text-primary sm:text-3xl">
            {t("categories_title")}
          </h2>
          <div className="mt-4 grid grid-cols-4 gap-2.5 sm:mt-5 sm:grid-cols-8 sm:gap-3">
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
                    active
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "border border-border/30 bg-white shadow-elevation-low"
                  }`}
                >
                  <span
                    className={`grid size-10 place-items-center rounded-2xl sm:size-12 ${
                      active
                        ? "bg-primary-foreground/15 text-primary-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <Icon className="size-5 sm:size-6" />
                  </span>
                  <span
                    className={`text-xs font-semibold sm:text-sm ${active ? "" : "text-primary"}`}
                  >
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
            <Link
              to="/search"
              search={{
                q: "",
                country,
                state: "",
                city: "",
                type: "",
                sort: "rating",
                instant: false,
                open: false,
              }}
              className="press min-h-11 shrink-0 rounded-2xl glass-soft px-4 text-sm font-semibold"
            >
              {t("see_all")}
            </Link>
          </div>

          {results.length === 0 ? (
            <div className="mt-6 rounded-3xl glass p-10 text-center">
              <p className="font-bold">
                No salons match “
                {[serviceState?.label, activeCategory, locationLabel].filter(Boolean).join(" · ") ||
                  "your search"}
                ”.
              </p>
              <button
                type="button"
                onClick={clearAllFilters}
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

      {/* Mobile/tablet only — desktop uses the anchored popovers wired into
          HomeSearchBar above instead, never these phone-sized full-screen takeovers. */}
      <ServiceSearchSheet
        open={serviceSheetOpen && !isDesktop}
        query={serviceQuery}
        onQueryChange={setServiceQuery}
        onClose={() => setServiceSheetOpen(false)}
        onSelectCategory={selectCategory}
        onSelectBusiness={(slug) =>
          void navigate({ to: "/business/$businessSlug", params: { businessSlug: slug } })
        }
        onSubmitQuery={(q) => {
          setServiceState({ label: q, query: q });
          setServiceSheetOpen(false);
        }}
      />

      <LocationPickerSheet
        open={locationSheetOpen && !isDesktop}
        geo={geo}
        onClose={() => setLocationSheetOpen(false)}
        onSelect={setLocationState}
      />

      <DateTimePickerSheet
        open={dateTimeSheetOpen && !isDesktop}
        initial={dateTimeState}
        onClose={() => setDateTimeSheetOpen(false)}
        onApply={setDateTimeState}
      />
    </div>
  );
}
