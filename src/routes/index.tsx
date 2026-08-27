import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Brush,
  Droplet,
  Flower2,
  Hand,
  MoreHorizontal,
  Scissors,
  Smile,
  Waves,
} from "lucide-react";

import { BottomNav } from "@/components/dallty/bottom-nav";
import { BusinessCard } from "@/components/dallty/business-card";
import { BusinessCardSkeleton } from "@/components/dallty/business-card-skeleton";
import {
  BusinessCarousel,
  CarouselArrows,
  CarouselDots,
  useCarouselScroll,
} from "@/components/dallty/business-carousel";
import { CategoryScroller, CategoryTile } from "@/components/dallty/category-scroller";
import { ProfessionalCTA } from "@/components/dallty/professional-cta";
import { AppDownloadSection } from "@/components/dallty/app-download-section";
import { Footer, type FooterColumnData } from "@/components/dallty/footer/footer";
import { SectionHeader } from "@/components/dallty/section-header";
import { HeroAtmosphere } from "@/components/dallty/hero-atmosphere";
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
import { TRENDING_BUSINESSES } from "@/lib/trending-mock";
import { NEW_ON_DALLTY_BUSINESSES } from "@/lib/new-on-dallty-mock";
import { dateFnsLocaleFor, dirFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { haversineKm, useUserLocation } from "@/hooks/use-user-location";
import { useLiveBusinesses, type LiveBusiness } from "@/hooks/use-live-businesses";
import { SiteHeader } from "@/components/dallty/site-nav";
import { getDefaultCountry, type Category } from "@/lib/reference-data";

type MarketplaceKey = NamespaceKeyMap["marketplace"];

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

// `en` stays the stable filter key matched against businessType (business
// data, not translated UI copy); `key` looks up the translated label. `en:
// null` (Autres/Other) clears the category filter entirely rather than
// matching a keyword — there's no catch-all businessType substring for it.
const CATEGORY_DEFS = [
  { key: "hair", en: "Hair", icon: Scissors },
  { key: "barber", en: "Barber", icon: Scissors },
  { key: "nails", en: "Nail", icon: Hand },
  { key: "massage", en: "Massage", icon: Waves },
  { key: "skin", en: "Skin", icon: Smile },
  { key: "spa", en: "Spa", icon: Flower2 },
  { key: "waxing", en: "Waxing", icon: Droplet },
  { key: "makeup", en: "Makeup", icon: Brush },
  { key: "other", en: null, icon: MoreHorizontal },
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

function periodLabel(period: DateTimeSelection["period"], t: (key: MarketplaceKey) => string) {
  if (period === "morning") return t("period_morning");
  if (period === "afternoon") return t("period_afternoon");
  if (period === "evening") return t("period_evening");
  return null;
}

function dateTimeLabel(
  sel: DateTimeSelection | null,
  todayStr: string,
  tomorrowStr: string,
  t: (key: MarketplaceKey) => string,
  locale: ReturnType<typeof dateFnsLocaleFor>,
) {
  if (!sel) return null;
  const dateStr = sel.date.toDateString();
  const dayPart =
    dateStr === todayStr
      ? t("today")
      : dateStr === tomorrowStr
        ? t("tomorrow")
        : format(sel.date, "d MMM", { locale });
  const period = periodLabel(sel.period, t);
  return period ? `${dayPart} · ${period}` : dayPart;
}

function Index() {
  const { lang } = useLocale();
  const { t, tArray } = useTranslation(["marketplace", "common"]);
  const navigate = useNavigate();
  const geo = useUserLocation();
  const country = getDefaultCountry().iso_code;
  // Mobile gets the full-screen sheet flows (item 21 of the redesign brief); desktop
  // gets the same 3 flows as anchored popovers instead — never a phone-sized panel
  // on a desktop viewport. Tablet is treated as mobile for now (still a real,
  // working full-screen flow, just not the dedicated "large bottom sheet" variant).
  const isDesktop = useBreakpoint() === "desktop";

  const [serviceState, setServiceState] = useState<ServiceState>(null);
  const [locationState, setLocationState] = useState<LocationSelection | null>(null);
  const [dateTimeState, setDateTimeState] = useState<DateTimeSelection | null>(null);

  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [serviceQuery, setServiceQuery] = useState("");
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [dateTimeSheetOpen, setDateTimeSheetOpen] = useState(false);

  // 12, not the hook's normal 50: "Recommended for you" only ever shows 10 cards
  // (4 visible at once on desktop) — the search page and the service-search sheet
  // still call the same hook with its default 50, unaffected by this.
  const {
    data: liveBusinesses,
    isLoading: recommendedLoading,
    isError: recommendedFailed,
  } = useLiveBusinesses(country, 12);

  // Unfiltered, top-of-feed slice for the "Recommended for you" carousel — the
  // RPC's default sort is already relevance (rank_score: rating + review
  // volume + verified + distance + profile completeness), so no extra
  // client-side sort is needed here. Deliberately separate from `results`
  // below, which is the category/service/location-FILTERED grid — combining
  // them would make category taps affect this unfiltered recommendation rail.
  const recommended = useMemo(() => (liveBusinesses ?? []).slice(0, 10), [liveBusinesses]);

  // Honest "Top rated" badge: only the single highest-rated business in the
  // rail, and only if its rating genuinely earns the claim — no fabricated
  // "New"/"Trending"/"Offer" badges without real backing data (see the
  // homepage-rebuild plan: those need their own backend signal first).
  const topRatedId = useMemo(() => {
    const candidate = recommended.reduce<Business | null>((best, b) => {
      if (b.rating < 4.8) return best;
      if (
        !best ||
        b.rating > best.rating ||
        (b.rating === best.rating && b.reviews > best.reviews)
      ) {
        return b;
      }
      return best;
    }, null);
    return candidate?.id ?? null;
  }, [recommended]);

  const recommendedCarousel = useCarouselScroll<HTMLDivElement>();
  const categoriesCarousel = useCarouselScroll<HTMLDivElement>();
  const trendingCarousel = useCarouselScroll<HTMLDivElement>();
  const newCarousel = useCarouselScroll<HTMLDivElement>();

  const today = useMemo(() => new Date(), []);
  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);

  const locationLabel = useMemo(() => {
    if (!locationState) return null;
    if (locationState.kind === "current") return t("location_use_current_label");
    return locationState.commune
      ? `${lang === "ar" ? locationState.wilayaAr : locationState.wilaya} · ${
          lang === "ar" ? locationState.communeAr : locationState.commune
        }`
      : lang === "ar"
        ? locationState.wilayaAr
        : locationState.wilaya;
  }, [locationState, lang, t]);

  const dateFnsLocale = useMemo(() => dateFnsLocaleFor(lang), [lang]);
  const dtLabel = useMemo(
    () =>
      dateTimeLabel(dateTimeState, today.toDateString(), tomorrow.toDateString(), t, dateFnsLocale),
    [dateTimeState, today, tomorrow, t, dateFnsLocale],
  );

  function runSearch() {
    // /search has no date/time filter today, and there's no real cross-business
    // slot inventory to search against (see datetime-picker-sheet.tsx) — so most
    // date/time selections can't honestly drive a real filter here. The one
    // exception: "today, no specific period" plausibly and honestly means "show
    // me what's open right now", which /search already supports for real via
    // `open`. Anything else (a future date, or a period picked) is left alone
    // rather than silently misapplying a filter that doesn't match the intent.
    const wantsOpenNow =
      dateTimeState !== null &&
      dateTimeState.period === null &&
      dateTimeState.date.toDateString() === today.toDateString();

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
        open: wantsOpenNow,
      },
    });
  }

  function selectCategory(cat: Category) {
    const label = cat.translations[lang] ?? cat.default_name;
    setServiceState({ label, keyword: CATEGORY_KEYWORD[cat.default_name] ?? label.toLowerCase() });
    setServiceQuery("");
    setServiceSheetOpen(false);
  }

  // Feeds only the hero search bar's live "N shops match" summary
  // (`resultCount` below) now that the homepage no longer has its own
  // filterable results grid — category taps navigate straight to /search.
  const results = useMemo(() => {
    const list: Business[] = liveBusinesses ?? [];
    let placed = (list as LiveBusiness[]).filter((s) => {
      if (locationState?.kind === "place") {
        if (s.state !== locationState.wilaya) return false;
        if (locationState.commune && s.city !== locationState.commune) return false;
      }
      return true;
    });
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
  }, [liveBusinesses, locationState, serviceState, geo.coords]);

  function clearAllFilters() {
    setServiceState(null);
    setLocationState(null);
    setDateTimeState(null);
  }

  const browseSearch = {
    q: "",
    country,
    state: "",
    city: "",
    type: "",
    sort: "rating" as const,
    instant: false,
    open: false,
  };
  const soon = t("soon");
  const footerColumns: FooterColumnData[] = [
    {
      id: "customers",
      title: t("footer_customers_title"),
      items: [
        { label: t("footer_customers_how_it_works"), soonLabel: soon },
        { label: t("footer_customers_find_salons"), to: "/search", search: browseSearch },
        { label: t("footer_customers_categories"), to: "/search", search: browseSearch },
        { label: t("footer_customers_gift_cards"), soonLabel: soon },
        { label: t("footer_customers_for_pros"), to: "/business/signup" },
        { label: t("footer_customers_faq"), soonLabel: soon },
      ],
    },
    {
      id: "professionals",
      title: t("footer_professionals_title"),
      items: [
        { label: t("footer_professionals_why"), soonLabel: soon },
        { label: t("footer_professionals_features"), soonLabel: soon },
        { label: t("footer_professionals_pricing"), soonLabel: soon },
        { label: t("footer_professionals_success_stories"), soonLabel: soon },
        { label: t("footer_professionals_resources"), soonLabel: soon },
        { label: t("footer_professionals_create_account"), to: "/business/signup" },
      ],
    },
    {
      id: "company",
      title: t("footer_company_title"),
      items: [
        { label: t("footer_company_about"), soonLabel: soon },
        { label: t("footer_company_careers"), soonLabel: soon },
        { label: t("footer_company_press"), soonLabel: soon },
        { label: t("footer_company_blog"), soonLabel: soon },
        { label: t("footer_company_contact"), soonLabel: soon },
        { label: t("footer_company_partnerships"), soonLabel: soon },
      ],
    },
    {
      id: "legal",
      title: t("footer_legal_title"),
      items: [
        { label: t("footer_legal_terms"), to: "/terms" },
        { label: t("footer_legal_privacy"), to: "/privacy" },
        { label: t("footer_legal_cookie"), soonLabel: soon },
        { label: t("footer_legal_refund"), soonLabel: soon },
        { label: t("footer_legal_professional_terms"), soonLabel: soon },
        { label: t("footer_legal_data_protection"), soonLabel: soon },
      ],
    },
  ];

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
      <div className="relative isolate">
        <HeroAtmosphere />

        <SiteHeader lang={lang} />

        <div className="mx-auto max-w-6xl px-4">
          {/* Hero — spacious, editorial, Fresha-inspired: huge open space, a bold
              centered headline, and the floating search as the visual centerpiece. */}
          <section className="relative animate-fade-up pb-4 pt-14 sm:pt-16 lg:pb-8 lg:pt-20">
            <h1 className="text-display mx-auto max-w-3xl text-balance text-center text-primary">
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
          </section>
        </div>
      </div>

      <main className="bg-atmosphere-whisper mx-auto max-w-6xl px-4 pb-nav-safe md:pb-12">
        {/* Recommended for you — unfiltered top-ranked picks, horizontal carousel.
            Distinct from the filterable "Nearby" grid further down: tapping a
            category below never affects this rail. */}
        {(recommendedLoading || recommended.length > 0 || recommendedFailed) && (
          <section className="mt-14 sm:mt-16">
            <SectionHeader
              title={t("recommended_title")}
              subtitle={t("recommended_sub")}
              seeAllHref="/search"
              seeAllLabel={t("see_all")}
              seeAllSearch={{
                q: "",
                country,
                state: "",
                city: "",
                type: "",
                sort: "rating",
                instant: false,
                open: false,
              }}
              actions={<CarouselArrows {...recommendedCarousel} />}
            />
            <div className="mt-5 sm:mt-6">
              {recommendedLoading ? (
                // Real skeleton cards, not a blank section — this is what used to
                // render nothing until the fetch resolved, which was both the
                // homepage's CLS source (the whole section popping into layout at
                // once) and what made the LCP image undiscoverable until then.
                <BusinessCarousel
                  scrollRef={recommendedCarousel.ref}
                  label={t("recommended_title")}
                >
                  {Array.from({ length: 4 }, (_, i) => (
                    <BusinessCardSkeleton key={i} />
                  ))}
                </BusinessCarousel>
              ) : recommendedFailed ? (
                <p className="rounded-3xl glass-warm p-6 text-center text-sm text-muted-foreground">
                  {t("recommended_unavailable")}
                </p>
              ) : (
                <BusinessCarousel
                  scrollRef={recommendedCarousel.ref}
                  label={t("recommended_title")}
                >
                  {recommended.map((s, i) => (
                    <BusinessCard
                      key={s.id}
                      business={s}
                      lang={lang}
                      compact
                      priority={i === 0}
                      badge={
                        s.id === topRatedId
                          ? { label: t("badge_top_rated"), tone: "top-rated" }
                          : undefined
                      }
                    />
                  ))}
                </BusinessCarousel>
              )}
            </div>
          </section>
        )}

        {/* Explore by category — plain Cream canvas from here down (no hero
            atmosphere): white/cream, pale-green icon circles, Deep Green active
            state, per the brand hierarchy (Cream/white dominant, green/lime used
            sparingly). Tapping a tile navigates straight to /search with that
            category applied — the homepage no longer hosts its own filterable
            results grid (removed along with "Nearby", see below), so there's
            nothing on-page left to filter/scroll to. The corrected 9-category
            list adds Visage/Face and Autres/Other. */}
        <section className="mt-14 sm:mt-16">
          <SectionHeader
            title={t("explore_title")}
            seeAllHref="/search"
            seeAllLabel={t("see_all")}
            seeAllSearch={{
              q: "",
              country,
              state: "",
              city: "",
              type: "",
              sort: "rating",
              instant: false,
              open: false,
            }}
            actions={<CarouselArrows {...categoriesCarousel} />}
          />
          <div className="mt-4 sm:mt-5">
            <CategoryScroller scrollRef={categoriesCarousel.ref}>
              {CATEGORY_DEFS.map((def) => (
                <CategoryTile
                  key={def.key}
                  icon={def.icon}
                  label={t(`categories.${def.key}` as NamespaceKeyMap["marketplace"])}
                  onClick={() => {
                    void navigate({
                      to: "/search",
                      search: {
                        q: "",
                        country,
                        state: "",
                        city: "",
                        type: def.en ?? "",
                        sort: "rating",
                        instant: false,
                        open: false,
                      },
                    });
                  }}
                />
              ))}
            </CategoryScroller>
          </div>
        </section>

        {/* Trending now — fixture data (see src/lib/trending-mock.ts) until a
            real trending signal exists server-side; same reusable card/carousel
            system as Recommended, just a different data source and badge set. */}
        <section className="mt-14 sm:mt-16">
          <SectionHeader
            title={t("trending_title")}
            subtitle={t("trending_sub")}
            seeAllHref="/search"
            seeAllLabel={t("see_all")}
            seeAllSearch={{
              q: "",
              country,
              state: "",
              city: "",
              type: "",
              sort: "rating",
              instant: false,
              open: false,
            }}
            actions={<CarouselArrows {...trendingCarousel} />}
          />
          <div className="mt-5 sm:mt-6">
            <BusinessCarousel scrollRef={trendingCarousel.ref} label={t("trending_title")}>
              {TRENDING_BUSINESSES.map((b) => (
                <BusinessCard
                  key={b.id}
                  business={b}
                  lang={lang}
                  compact
                  badge={{
                    label: t(
                      `badge_${b.badgeTone.replace("-", "_")}` as NamespaceKeyMap["marketplace"],
                    ),
                    tone: b.badgeTone,
                  }}
                />
              ))}
            </BusinessCarousel>
          </div>
          <CarouselDots progress={trendingCarousel.progress} count={TRENDING_BUSINESSES.length} />
        </section>

        {/* Nearby */}
        {/* New on Dallty — fixture data (see src/lib/new-on-dallty-mock.ts) until
            a real "recently joined" signal exists server-side; same reusable
            card/carousel system as Recommended/Trending, always the "New" badge.
            Replaces the old "Nearby" filterable grid, which is gone — category
            taps above and "See all" links throughout the homepage now go
            straight to /search instead. */}
        <section className="mt-14 sm:mt-16">
          <SectionHeader
            title={t("new_title")}
            subtitle={t("new_sub")}
            seeAllHref="/search"
            seeAllLabel={t("see_all")}
            seeAllSearch={{
              q: "",
              country,
              state: "",
              city: "",
              type: "",
              sort: "rating",
              instant: false,
              open: false,
            }}
            actions={<CarouselArrows {...newCarousel} />}
          />
          <div className="mt-5 sm:mt-6">
            <BusinessCarousel scrollRef={newCarousel.ref} label={t("new_title")}>
              {NEW_ON_DALLTY_BUSINESSES.map((b) => (
                <BusinessCard
                  key={b.id}
                  business={b}
                  lang={lang}
                  compact
                  badge={{ label: t("badge_new"), tone: "new" }}
                />
              ))}
            </BusinessCarousel>
          </div>
          <CarouselDots progress={newCarousel.progress} count={NEW_ON_DALLTY_BUSINESSES.length} />
        </section>

        {/* Dallty for professionals */}
        <ProfessionalCTA
          title={t("professional_title")}
          subtitle={t("professional_sub")}
          ctaLabel={t("professional_cta")}
          features={tArray("professional_features") as [string, string][]}
        />

        {/* Download the app */}
        <AppDownloadSection
          title={t("app_title")}
          subtitle={t("app_sub")}
          appStoreLabel={t("app_store_label")}
          appStoreName={t("app_store_name")}
          playStoreLabel={t("play_store_label")}
          playStoreName={t("play_store_name")}
        />

        <Footer
          lang={lang}
          brandStatement={t("footer_brand_statement")}
          columns={footerColumns}
          newsletterTitle={t("footer_newsletter_title")}
          newsletterSub={t("footer_newsletter_sub")}
          newsletterPlaceholder={t("footer_newsletter_placeholder")}
          newsletterCta={t("footer_newsletter_cta")}
          newsletterSuccess={t("footer_newsletter_success")}
          newsletterError={t("footer_newsletter_error")}
          newsletterInvalid={t("footer_newsletter_invalid")}
          trustItems={(tArray("footer_trust") as [string, string][]).map(([title, desc]) => ({
            title,
            desc,
          }))}
          appTitle={t("footer_app_title")}
          appSub={t("footer_app_sub")}
          appStoreLabel={t("app_store_label")}
          appStoreName={t("app_store_name")}
          playStoreLabel={t("play_store_label")}
          playStoreName={t("play_store_name")}
          copyright={t("footer_copyright", { year: today.getFullYear() })}
          madeWithLove={t("footer_made_with_love")}
        />
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
