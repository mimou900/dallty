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
  topServices: { name: string; price: number; durationMinutes?: number | null }[];
  startingPrice: number | null;
};

/**
 * The "Professionnels" search mode's result card — same discover-then-
 * open-profile model as `SearchResultCard`, no Book button. There's no
 * dedicated per-professional profile route in the app today, so it opens
 * the business profile they work at. Rating is the business's real
 * aggregate, not a fabricated per-staff number — see
 * `professional-search.functions.ts`'s doc comment for why.
 *
 * Layout matches the reference: avatar with the rating as a small badge
 * overlaid on its corner (not a separate text line), then each service as
 * its own row with its own price aligned to the end.
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
      className="group block overflow-hidden rounded-3xl border border-border/50 bg-card p-4 transition-colors duration-150 hover:border-border sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="relative shrink-0">
          <span className="grid size-16 place-items-center overflow-hidden rounded-full bg-muted">
            {professional.avatarUrl ? (
              <img src={professional.avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center bg-primary/15 text-lg font-bold text-primary">
                {name.charAt(0).toUpperCase() || <User className="size-6" />}
              </span>
            )}
          </span>
          {professional.rating != null && (
            <span className="absolute -bottom-1 start-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border/60 bg-card px-1.5 py-0.5 text-[11px] font-bold shadow-soft">
              <Star className="size-2.5 shrink-0 fill-gold text-gold" />
              {professional.rating.toFixed(1)}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="truncate text-base font-bold">{name}</h2>
          {title && <p className="truncate text-sm text-muted-foreground">{title}</p>}
          <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            {distanceKm != null && <span className="shrink-0">{distanceKm.toFixed(1)} {t("km")} ·</span>}
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{area}</span>
          </p>
        </div>
      </div>

      {professional.topServices.length > 0 && (
        <div className="mt-3 space-y-1">
          {professional.topServices.map((service) => (
            <div
              key={service.name}
              className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{service.name}</p>
                {service.durationMinutes != null && (
                  <p className="text-xs text-muted-foreground">
                    {service.durationMinutes >= 60
                      ? `${Math.floor(service.durationMinutes / 60)}h`
                      : `${service.durationMinutes}${t("min_short")}`}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold text-foreground">
                {service.price === professional.startingPrice ? `${t("starting_from")} ` : ""}
                {formatMoney(service.price, currency, lang)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
