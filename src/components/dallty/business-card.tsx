import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Car, Footprints, Heart, MapPin, Star, Zap } from "lucide-react";
import type { Lang, Business } from "@/lib/dallty-content";
import { useTranslation } from "@/lib/i18n/hooks";

export type TravelInfo = {
  km: number | null;
  drivingMinutes: number | null;
  walkingMinutes: number | null;
};

export function BusinessCard({
  business,
  lang,
  travel,
}: {
  business: Business;
  lang: Lang;
  travel?: TravelInfo;
}) {
  const [fav, setFav] = useState(false);
  const { t } = useTranslation("marketplace");
  // Business's own per-listing fields are en/ar-only fallback/seed data
  // (out of scope for this migration); French falls back to English.
  const s = business[lang === "ar" ? "ar" : "en"];

  return (
    <article className="press group overflow-hidden rounded-3xl glass">
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={business.image}
          alt={s.name}
          loading="lazy"
          width={900}
          height={700}
          className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <button
          type="button"
          onClick={() => setFav((v) => !v)}
          aria-label={fav ? "Remove from favorites" : "Add to favorites"}
          className="absolute end-3 top-3 grid size-11 place-items-center rounded-full glass-soft text-foreground transition-transform active:scale-90"
        >
          <Heart className={fav ? "size-5 fill-rose text-rose" : "size-5"} />
        </button>
        <div className="absolute bottom-3 start-3 flex flex-wrap gap-2">
          <span className="rounded-full glass-soft px-3 py-1 text-xs font-semibold">
            {business.open ? t("open") : t("closed")}
          </span>
          {business.instant && (
            <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">
              <Zap className="size-3.5" />
              {t("instant")}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <Link
            to="/business/$businessSlug"
            params={{ businessSlug: business.slug }}
            className="min-w-0 outline-none focus-visible:underline"
          >
            <h2 className="truncate text-lg font-bold hover:underline">{s.name}</h2>
            <p className="truncate text-sm text-muted-foreground">{s.tags}</p>
          </Link>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm font-semibold">
            <Star className="size-4 fill-gold text-gold" />
            {business.rating.toFixed(1)}
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
            className="press block rounded-2xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground"
          >
            {t("book")}
          </Link>
        </div>
      </div>
    </article>
  );
}
