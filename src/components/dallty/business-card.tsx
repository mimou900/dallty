import { Link } from "@tanstack/react-router";
import {
  Award,
  BadgeCheck,
  Car,
  Flame,
  Footprints,
  MapPin,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { Lang, Business } from "@/lib/dallty-content";
import { useTranslation } from "@/lib/i18n/hooks";
import { FavoriteButton } from "@/components/dallty/favorite-button";

export type TravelInfo = {
  km: number | null;
  drivingMinutes: number | null;
  walkingMinutes: number | null;
};

/** Matches the 4 local `/salons/*.jpg` category-fallback stock photos (see
 *  `use-live-businesses.ts`'s `CATEGORY_IMAGE_FALLBACK`) — the only images
 *  this app controls end-to-end, so the only ones with pre-generated AVIF/
 *  WebP variants at `-480`/`-960` widths (see `public/salons/`). A real
 *  business's own uploaded photo is a Supabase Storage signed URL and has
 *  no such variants; it renders through the plain `<img>` fallback below
 *  exactly as before. */
const STOCK_IMAGE_RE = /^\/salons\/(hair|barber|nails|spa)\.jpg$/;

/** Matches the carousel's actual rendered widths (`business-carousel.tsx`):
 *  78vw mobile, 46% from `sm`, and a ~280px card from `lg` (25% of the
 *  max-w-6xl track minus gaps) — so the browser picks the smaller 480w
 *  variant on phones instead of downloading the 960w one unnecessarily. */
const STOCK_IMAGE_SIZES = "(min-width: 1024px) 280px, (min-width: 640px) 46vw, 78vw";

/** One editorial badge, top-left of the image — distinct from the operational
 *  Open/Instant pills (bottom-left), which stay regardless of this prop. Only
 *  one may be set per card; callers choose which (a card is never both "New"
 *  and "Trending" at once).
 *
 *  Deliberately few distinct background treatments (not one per tone) — Lime
 *  is reserved for the single highest-value signal (top rated), Trending and
 *  Popular intentionally share the same solid Deep Green (both mean "other
 *  people are choosing this," just from different signals), New/Featured/Offer
 *  use paler tints of the same two families. One shape, one shadow, only the
 *  color changes. */
export type BusinessBadge = {
  label: string;
  tone: "top-rated" | "new" | "popular" | "featured" | "offer" | "trending";
};

export const BADGE_TONE = {
  "top-rated": { classes: "bg-lime text-primary", icon: Star },
  trending: { classes: "bg-primary text-primary-foreground", icon: TrendingUp },
  popular: { classes: "bg-primary text-primary-foreground", icon: Flame },
  new: { classes: "bg-primary-surface text-primary", icon: Sparkles },
  featured: { classes: "bg-primary text-lime", icon: Award },
  offer: { classes: "bg-lime-subtle text-primary", icon: Tag },
} satisfies Record<BusinessBadge["tone"], { classes: string; icon: typeof Star }>;

export function BusinessCard({
  business,
  lang,
  travel,
  badge,
  compact,
  priority,
}: {
  business: Business;
  lang: Lang;
  travel?: TravelInfo;
  badge?: BusinessBadge;
  /** Tighter carousel-card layout for the homepage discovery rails: rating +
   *  reviews + category collapse onto one line, no travel/price row, and a
   *  single outlined "Book now" CTA instead of the Details+Book pair. The
   *  richer default layout (used by search results) is unchanged. */
  compact?: boolean;
  /** Set on the first card of the first above-the-fold rail only — it's the
   *  homepage's LCP candidate, so it needs to load eagerly and with priority
   *  instead of the `loading="lazy"` every other card correctly uses (they're
   *  off-screen; deferring them is right, not a bug). */
  priority?: boolean;
}) {
  const { t } = useTranslation("marketplace");
  // Business's own per-listing fields are en/ar-only fallback/seed data
  // (out of scope for this migration); French falls back to English.
  const s = business[lang === "ar" ? "ar" : "en"];
  const BadgeIcon = badge ? BADGE_TONE[badge.tone].icon : null;
  const stockMatch = business.image.match(STOCK_IMAGE_RE);
  const stockName = stockMatch?.[1];

  return (
    <article className="group overflow-hidden rounded-3xl border border-border/50 bg-card shadow-soft transition-colors duration-150 hover:border-border hover:bg-secondary">
      <div className={`relative overflow-hidden ${compact ? "aspect-[16/10]" : "aspect-[4/3]"}`}>
        <picture>
          {stockName && (
            <>
              <source
                type="image/avif"
                sizes={STOCK_IMAGE_SIZES}
                srcSet={`/salons/${stockName}-480.avif 480w, /salons/${stockName}-640.avif 640w, /salons/${stockName}-960.avif 960w`}
              />
              <source
                type="image/webp"
                sizes={STOCK_IMAGE_SIZES}
                srcSet={`/salons/${stockName}-480.webp 480w, /salons/${stockName}-640.webp 640w, /salons/${stockName}-960.webp 960w`}
              />
            </>
          )}
          <img
            src={business.image}
            alt={s.name}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            width={900}
            height={700}
            className={`size-full object-cover transition-transform duration-200 ${compact ? "group-hover:scale-[1.01]" : "group-hover:scale-[1.02]"}`}
          />
        </picture>
        {/* Non-compact (search-results) card only — unchanged from before.
            Compact (homepage carousel) cards skip the scrim entirely: the
            badge/favorite below both carry their own solid-enough background,
            so a full-image dark gradient was darkening the photo for no
            legibility reason it actually needed. */}
        {!compact && <div aria-hidden className="photo-scrim absolute inset-0" />}
        {badge && BadgeIcon && (
          <span
            className={`absolute start-3 top-3 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow-elevation-low ${BADGE_TONE[badge.tone].classes}`}
          >
            <BadgeIcon className="size-3.5" />
            {badge.label}
          </span>
        )}
        <FavoriteButton
          kind="business"
          targetId={business.id}
          label={s.name}
          className="absolute end-3 top-3 !size-11"
        />
        {/* Non-compact only. Compact cards drop the Instant-booking overlay
            entirely and move "open now" into the information area below the
            image (never "closed" — see the compact content block) instead of
            a large image-blocking status pill. */}
        {!compact && (
          <div className="absolute bottom-3 start-3 flex flex-wrap gap-2">
            <span className="rounded-full glass-dark px-3 py-1 text-xs font-semibold">
              {business.open ? t("open") : t("closed")}
            </span>
            {business.instant && (
              <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">
                <Zap className="size-3.5" />
                {t("instant")}
              </span>
            )}
          </div>
        )}
      </div>

      {compact ? (
        <div className="flex flex-col p-4 sm:p-5">
          <Link
            to="/business/$businessSlug"
            params={{ businessSlug: business.slug }}
            className="block rounded-lg focus-visible:underline"
          >
            {/* Reserves 2 lines of height regardless of actual name length —
                a 1-line name and a 2-line name leave rating/location/Book at
                the exact same vertical position. `line-clamp-2` needs block
                (not flex) display, so the verified check rides inline with
                the text instead of in its own flex row. */}
            <h2 className="line-clamp-2 min-h-12 text-base font-bold hover:underline">
              {s.name}
              {business.verified && (
                <BadgeCheck
                  className="ms-1 inline size-4 shrink-0 align-text-bottom text-primary"
                  aria-label="Verified by Dallty"
                />
              )}
            </h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="size-3.5 shrink-0 fill-gold text-gold" />
              <span className="font-semibold text-foreground">{business.rating.toFixed(1)}</span>
              <span>({business.reviews})</span>
              {business.category && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{business.category}</span>
                </>
              )}
            </p>
            <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" />
              <span className="truncate">{s.area}</span>
            </p>
            {/* Availability is already part of the same data the rest of the
                card renders from (open_now comes back on the same query as
                name/rating/image — nothing here is a separate, slower
                check), so there's nothing to wait on or show a loading state
                for. Closed shows nothing at all, matching a normal card. */}
            {business.open && (
              <p className="mt-1 text-xs font-semibold text-primary">{t("open")}</p>
            )}
          </Link>

          <Link
            to="/business/$businessSlug"
            params={{ businessSlug: business.slug }}
            search={{ book: true }}
            aria-label={`${t("book")} ${s.name}`}
            className="press mt-3 flex min-h-11 items-center justify-center rounded-full bg-(image:--gradient-lime) text-sm font-semibold text-lime-foreground transition-[filter] duration-150 hover:brightness-95"
          >
            {t("book")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <Link
              to="/business/$businessSlug"
              params={{ businessSlug: business.slug }}
              className="min-w-0 outline-none focus-visible:underline"
            >
              <h2 className="flex items-center gap-1.5 truncate text-lg font-bold hover:underline">
                <span className="truncate">{s.name}</span>
                {business.verified && (
                  <BadgeCheck
                    className="size-4 shrink-0 text-primary"
                    aria-label="Verified by Dallty"
                  />
                )}
              </h2>
              <p className="truncate text-sm text-muted-foreground">
                {business.category ?? s.tags}
              </p>
            </Link>
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm font-semibold">
              <Star className="size-4 fill-gold text-gold" />
              {business.rating.toFixed(1)}
              <span className="font-normal text-muted-foreground">({business.reviews})</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">
                {s.area}
                {travel?.km != null ? ` · ${travel.km.toFixed(1)} ${t("km")}` : ""}
              </span>
            </span>
            <span className="font-semibold text-foreground">{business.price}</span>
          </div>

          {travel && (travel.drivingMinutes != null || travel.walkingMinutes != null) ? (
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {travel.drivingMinutes != null ? (
                <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
                  <Car className="size-3.5" />
                  {travel.drivingMinutes} {t("driving_minutes")}
                </span>
              ) : null}
              {travel.walkingMinutes != null ? (
                <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1">
                  <Footprints className="size-3.5" />
                  {travel.walkingMinutes} {t("walking_minutes")}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/business/$businessSlug"
              params={{ businessSlug: business.slug }}
              className="press block rounded-2xl glass-soft py-3 text-center text-sm font-semibold transition-colors duration-150 hover:bg-primary/5"
            >
              {t("details")}
            </Link>
            <Link
              to="/business/$businessSlug"
              params={{ businessSlug: business.slug }}
              search={{ book: true }}
              aria-label={`${t("book")} ${s.name}`}
              className="press block rounded-2xl bg-(image:--gradient-lime) py-3 text-center text-sm font-semibold text-lime-foreground transition-[filter] duration-150 hover:brightness-95"
            >
              {t("book")}
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}
