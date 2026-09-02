import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Clock, MapPin, Star } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";
import { businessCategoryLabel } from "@/lib/business-category-label";
import type { Category } from "@/lib/reference-data";
import { useTranslation } from "@/lib/i18n/hooks";
import {
  formatHourLabel,
  todayOpenStatus,
  todayWeekdayInTimezone,
  type BranchHoursRow,
} from "@/lib/business-hours";

type BusinessRow = {
  id: string;
  name: string;
  area: string;
  city: string;
  district: string | null;
  country: string | null;
  address: string | null;
  image_url: string | null;
  cover_url: string | null;
  rating: number | string;
  review_count: number;
  categories: string[] | null;
  is_verified: boolean;
  timezone: string | null;
};

/**
 * Business Profile hero, rebuilt to match the reference screenshots exactly after feedback
 * that the overlay-on-image version was "still far from the target": the image itself stays
 * completely clean (just the "1/5" count badge — brief §7/§8's "do not overload the image"
 * turned out to mean no overlay at all, not a subtle one) and every fact — name, category,
 * rating, open status, address — lives in a plain white summary card directly below it,
 * exactly like the reference. No "Instant booking" badge (brief §29); no autoplay, no
 * aggressive zoom.
 *
 * Gallery: plain CSS scroll-snap, not a carousel library — this codebase has none installed.
 * The "1/5" counter is derived from scroll position via a plain `onScroll` handler.
 */
export function BusinessProfileHero({
  business,
  categories,
  lang,
  todayHours,
}: {
  business: BusinessRow;
  categories: Category[];
  lang: string;
  todayHours: BranchHoursRow[];
}) {
  const { t } = useTranslation("marketplace");

  const galleryQuery = useQuery({
    queryKey: ["business-gallery", business.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_gallery")
        .select("id, url")
        .eq("business_id", business.id)
        .order("sort_order");
      if (error) throw error;
      return data as { id: string; url: string }[];
    },
  });

  const fallback = business.cover_url ?? business.image_url ?? "/salons/hair.jpg";
  const [resolvedUrls, setResolvedUrls] = useState<string[]>([]);
  useEffect(() => {
    const rows = galleryQuery.data;
    if (!rows || rows.length === 0) {
      setResolvedUrls([fallback]);
      return;
    }
    let cancelled = false;
    Promise.all(rows.map((r) => signedUrl("review-photos", r.url))).then((urls) => {
      if (cancelled) return;
      const clean = urls.filter((u): u is string => Boolean(u));
      setResolvedUrls(clean.length ? clean : [fallback]);
    });
    return () => {
      cancelled = true;
    };
  }, [galleryQuery.data, fallback]);

  const images = resolvedUrls.length ? resolvedUrls : [fallback];
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  const weekday = todayWeekdayInTimezone(business.timezone);
  const todayRow = todayHours.find((h) => h.weekday === weekday);
  const status = todayOpenStatus(todayRow, business.timezone);
  const address = [business.address, business.area, business.city]
    .filter(Boolean)
    .join(", ");
  const categoryLabel = businessCategoryLabel(
    categories,
    business.categories,
    lang,
    t("business_type_fallback"),
  );

  return (
    <section className="mt-4">
      <div className="relative overflow-hidden rounded-3xl">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
        >
          {images.map((src, i) => (
            <img
              key={src + i}
              src={src}
              alt={i === 0 ? `${business.name} — main photo` : `${business.name} — photo ${i + 1}`}
              width={1200}
              height={800}
              loading={i === 0 ? "eager" : "lazy"}
              className="h-56 w-full shrink-0 snap-center object-cover sm:h-72"
            />
          ))}
        </div>
        {images.length > 1 && (
          <span className="absolute end-3 bottom-3 rounded-full bg-foreground/70 px-2.5 py-1 text-xs font-bold text-background">
            {activeIndex + 1}/{images.length}
          </span>
        )}
      </div>

      {/* Plain summary card below the (now clean) image — matches the reference exactly:
          name, category, rating + open status inline, address with a pin icon. */}
      <div className="mt-4 space-y-3">
        <div>
          <h1 className="flex items-center gap-1.5 text-2xl font-extrabold leading-tight">
            <span className="truncate">{business.name}</span>
            {business.is_verified && (
              <BadgeCheck className="size-5 shrink-0 text-primary" aria-label="Verified by Dallty" />
            )}
          </h1>
          {categoryLabel ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{categoryLabel}</p>
          ) : null}
        </div>

        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold">
          <Star className="size-4 fill-gold text-gold" />
          {Number(business.rating).toFixed(1)} ({business.review_count})
          <span className="text-muted-foreground">·</span>
          <Clock className="size-4 text-muted-foreground" />
          <span className={status.open ? "text-primary" : "text-muted-foreground"}>
            {status.open
              ? `Open until ${formatHourLabel(status.closesAt)}`
              : status.opensAt
                ? `Opens ${formatHourLabel(status.opensAt)}`
                : "Closed today"}
          </span>
        </p>

        {address ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            {address}
          </p>
        ) : null}
      </div>
    </section>
  );
}
