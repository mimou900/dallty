import { Link } from "@tanstack/react-router";
import { MapPin, Star, User } from "lucide-react";

import type { Lang } from "@/lib/dallty-content";
import { useTranslation } from "@/lib/i18n/hooks";
import { formatMoney } from "@/lib/countries";

export type ProfessionalResult = {
  id: string;
  businessId: string;
  businessSlug: string;
  fullName: string;
  fullNameAr: string | null;
  title: string | null;
  titleAr: string | null;
  avatarUrl: string | null;
  businessName: string;
  businessNameAr: string | null;
  city: string | null;
  area: string | null;
  areaAr: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
  countryCode: string;
  businessType: string | null;
  topServices: { name: string; price: number }[];
  startingPrice: number | null;
};

/**
 * The "Professionnels" search mode's result card (Search redesign §16) —
 * same discover-then-open-profile model as `SearchResultCard`, no Book
 * button. There's no dedicated per-professional profile route in the app
 * today, so it opens the business profile they work at (matches the spec's
 * own "opens the appropriate professional/business profile"). Rating is the
 * business's real aggregate, not a fabricated per-staff number — see
 * `professional-search.functions.ts`'s doc comment for why.
 */
export function ProfessionalCard({
  professional,
  lang,
  distanceKm,
  currency,
}: {
  professional: ProfessionalResult;
  lang: Lang;
  distanceKm?: number | null;
  currency: string;
}) {
  const { t } = useTranslation("marketplace");
  const name = lang === "ar" && professional.fullNameAr ? professional.fullNameAr : professional.fullName;
  const title = lang === "ar" && professional.titleAr ? professional.titleAr : professional.title;
  const area = lang === "ar" && professional.areaAr ? professional.areaAr : professional.area;

  return (
    <Link
      to="/business/$businessSlug"
      params={{ businessSlug: professional.businessSlug }}
      className="group block overflow-hidden rounded-3xl border border-border/50 bg-card p-4 shadow-soft transition-colors duration-150 hover:border-border hover:bg-secondary sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
          {professional.avatarUrl ? (
            <img src={professional.avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <User className="size-7 text-muted-foreground" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold">{name}</h2>
          {title && <p className="truncate text-sm text-muted-foreground">{title}</p>}
        </div>
      </div>

      <p className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
        <Star className="size-3.5 shrink-0 fill-gold text-gold" />
        <span className="font-semibold text-foreground">
          {professional.rating != null ? professional.rating.toFixed(1) : "—"}
        </span>
        <span>({professional.reviewCount ?? 0})</span>
        {distanceKm != null && (
          <>
            <span aria-hidden>·</span>
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {distanceKm.toFixed(1)} {t("km")}
            </span>
          </>
        )}
      </p>
      {area && <p className="mt-0.5 truncate text-sm text-muted-foreground">{area}</p>}

      {professional.topServices.length > 0 && (
        <p className="mt-2 truncate text-sm text-foreground">
          {professional.topServices.map((s) => s.name).join(" · ")}
        </p>
      )}

      {professional.startingPrice != null && (
        <p className="mt-1 text-sm font-semibold text-primary">
          {t("starting_from")} {formatMoney(professional.startingPrice, currency, lang)}
        </p>
      )}
    </Link>
  );
}
