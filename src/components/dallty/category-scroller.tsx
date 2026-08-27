import type { LucideIcon } from "lucide-react";
import { Children, type ReactNode, type RefObject } from "react";

/**
 * Horizontal, data-driven category picker — shares the same scroll-snap/
 * hidden-scrollbar mechanics as `BusinessCarousel`, but with small pill-sized
 * items instead of card-sized ones, so it gets its own track component. Pass
 * the `ref` from `useCarouselScroll()` (business-carousel.tsx) so its header
 * can host the same `<CarouselArrows>` used by every other discovery section.
 */
export function CategoryScroller({
  scrollRef,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:gap-4 lg:grid lg:grid-cols-9 lg:overflow-visible"
    >
      {Children.map(children, (child) => (
        <div className="w-20 shrink-0 snap-start sm:w-24 lg:w-auto">{child}</div>
      ))}
    </div>
  );
}

export function CategoryTile({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`press flex w-full flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center transition ${
        active ? "" : "hover:bg-primary/5"
      }`}
    >
      <span
        className={`grid size-14 place-items-center rounded-full transition sm:size-16 ${
          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="size-6 sm:size-7" />
      </span>
      <span
        className={`truncate text-xs font-semibold sm:text-sm ${active ? "text-primary" : "text-foreground"}`}
      >
        {label}
      </span>
    </button>
  );
}
