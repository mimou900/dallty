import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, MapPin, Star } from "lucide-react";

import type { Lang } from "@/lib/dallty-content";
import type { LiveBusiness } from "@/hooks/use-live-businesses";
import { useTranslation } from "@/lib/i18n/hooks";
import { FavoriteButton } from "@/components/dallty/favorite-button";
import { BADGE_TONE, type BusinessBadge, type TravelInfo } from "@/components/dallty/business-card";
import { ResultGallery, type GalleryImage } from "@/components/dallty/search/result-gallery";

/**
 * The one universal search result card (Search redesign §9-10, §13-15,
 * §26-27) — discover → open profile, never book-from-card. Clicking the
 * image, gallery, name, or card body all open the same business profile;
 * only Favorite is a separate action. Reuses `FavoriteButton` and the
 * `BADGE_TONE` system from `business-card.tsx` unmodified so badges stay
 * visually identical everywhere in the app. "Closed" is never shown — see
 * the `business.open` check below; matches the homepage compact card's
 * already-established rule.
 */
export function SearchResultCard({
  business,
  lang,
  images,
  badge,
  travel,
  priority,
}: {
  business: LiveBusiness;
  lang: Lang;
  images: GalleryImage[];
  badge?: BusinessBadge;
  travel?: TravelInfo;
  priority?: boolean;
}) {
  const { t } = useTranslation("marketplace");
  const navigate = useNavigate();
  const s = business[lang === "ar" ? "ar" : "en"];
  const BadgeIcon = badge ? BADGE_TONE[badge.tone].icon : null;
  const km = travel?.km ?? (business.distanceKm > 0 ? business.distanceKm : null);
  const galleryImages: GalleryImage[] =
    images.length > 0 ? images : [{ id: business.id, url: business.image }];

  function openProfile() {
    void navigate({ to: "/business/$businessSlug", params: { businessSlug: business.slug } });
  }

  return (
    <article className="group overflow-hidden rounded-3xl border border-border/50 bg-card shadow-soft transition-colors duration-150 hover:border-border">
      <div className="relative">
        <ResultGallery
          images={galleryImages}
          alt={s.name}
          onImageClick={openProfile}
          priority={priority}
        />
        {badge && BadgeIcon && (
          <span
            className={`pointer-events-none absolute start-3 top-3 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow-elevation-low ${BADGE_TONE[badge.tone].classes}`}
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
      </div>

      <Link
        to="/business/$businessSlug"
        params={{ businessSlug: business.slug }}
        className="block p-4 focus-visible:underline sm:p-5"
      >
        <h2 className="line-clamp-2 min-h-12 text-base font-bold">
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
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">
            {km != null ? `${km.toFixed(1)} ${t("km")} · ` : ""}
            {s.area}
          </span>
        </p>
        {business.category && (
          <p className="mt-1 truncate text-sm text-muted-foreground">{business.category}</p>
        )}
        {business.open && <p className="mt-1 text-xs font-semibold text-primary">{t("open")}</p>}
      </Link>
    </article>
  );
}
