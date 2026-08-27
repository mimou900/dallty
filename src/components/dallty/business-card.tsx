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

/** One editorial badge, top-left of the image — distinct from the operational
 *  Open/Instant pills (bottom-left), which stay regardless of this prop. Only
 *  one may be set per card; callers choose which (a card is never both "New"
 *  and "Trending" at once). */
export type BusinessBadge = {
  label: string;
  tone: "top-rated" | "new" | "popular" | "featured" | "offer" | "trending";
};

const BADGE_TONE = {
  "top-rated": { classes: "bg-lime text-primary", icon: Star },
  new: { classes: "bg-lime-subtle text-primary", icon: Sparkles },
  popular: { classes: "bg-primary-light text-primary-foreground", icon: Flame },
  featured: { classes: "bg-primary text-lime", icon: Award },
  offer: { classes: "bg-primary-surface text-primary", icon: Tag },
  trending: { classes: "bg-primary-active text-primary-foreground", icon: TrendingUp },
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

  return (
    <article className="press group overflow-hidden rounded-3xl glass-warm shadow-(--shadow-card)">
      <div className={`relative overflow-hidden ${compact ? "aspect-[16/10]" : "aspect-[4/3]"}`}>
        <img
          src={business.image}
          alt={s.name}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          width={900}
          height={700}
          className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        {/* Guarantees the badges below stay legible regardless of what's in the
            photo underneath — never rely on the photo's own contrast. */}
        <div aria-hidden className="photo-scrim absolute inset-0" />
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
          className="absolute end-3 top-3 !size-11 transition-transform active:scale-90"
        />
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
        <div className="p-4 sm:p-5">
          <Link
            to="/business/$businessSlug"
            params={{ businessSlug: business.slug }}
            className="block rounded-lg focus-visible:underline"
          >
            <h2 className="flex items-center gap-1.5 truncate text-base font-bold hover:underline">
              <span className="truncate">{s.name}</span>
              {business.verified && (
                <BadgeCheck
                  className="size-4 shrink-0 text-primary"
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
          </Link>

          <Link
            to="/business/$businessSlug"
            params={{ businessSlug: business.slug }}
            search={{ book: true }}
            className="press mt-3 flex min-h-11 items-center justify-center rounded-full border border-primary text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
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
              className="press block rounded-2xl glass-soft py-3 text-center text-sm font-semibold"
            >
              {t("details")}
            </Link>
            <Link
              to="/business/$businessSlug"
              params={{ businessSlug: business.slug }}
              search={{ book: true }}
              className="press block rounded-2xl bg-(image:--gradient-lime) py-3 text-center text-sm font-semibold text-lime-foreground shadow-(--shadow-glow-lime)"
            >
              {t("book")}
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}
