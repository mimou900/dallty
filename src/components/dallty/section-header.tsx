import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared heading for every homepage discovery section (Recommended, Trending,
 * New, etc.) — title + optional subtitle on the left, "See all" + optional
 * extra controls (e.g. `<CarouselArrows>`) on the right. Every section reuses
 * this exact layout so the homepage doesn't grow a slightly-different
 * hand-rolled heading per section. Carousel arrows live HERE, next to "See
 * all" — not floating over the card track — per the approved mockup.
 */
export function SectionHeader({
  title,
  subtitle,
  seeAllHref,
  seeAllLabel,
  seeAllSearch,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Omit to render a header with no "See all" link. */
  seeAllHref?: string;
  seeAllLabel?: string;
  seeAllSearch?: Record<string, unknown>;
  /** Extra controls rendered after "See all" — e.g. carousel prev/next arrows. */
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-balance text-xl font-extrabold text-primary sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {seeAllHref && (
          <Link
            to={seeAllHref}
            search={seeAllSearch}
            className="group flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary/15"
          >
            {seeAllLabel}
            <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </Link>
        )}
        {actions}
      </div>
    </div>
  );
}
