import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Children,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Horizontal discovery row shared by every homepage section (Recommended,
 * Trending, New, etc.) — native CSS scroll-snap rather than a JS carousel
 * engine, since that's all this needs: smooth momentum scroll, hidden
 * scrollbar, and (desktop only) prev/next arrows. Mobile intentionally shows
 * ~1.2 cards (a peek of the next one) so the row reads as scrollable without
 * an explicit hint, and relies on swipe rather than arrows.
 *
 * Split into a hook (`useCarouselScroll`) + two small pieces (`CarouselArrows`,
 * `BusinessCarousel`) rather than one self-contained component, because the
 * arrows live in the SECTION HEADER row next to "See all" (per the approved
 * mockup), not floating over the card track itself — the header and the track
 * are siblings in the calling section, so they need to share the same scroll
 * state via the hook rather than one containing the other.
 */
export function useCarouselScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  // 0-1 scroll position, for an optional `<CarouselDots>` indicator — not every
  // section needs it (Recommended/Categories don't use it), so it's tracked
  // here unconditionally (cheap) rather than behind a flag.
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const updateArrows = () => {
      setCanScrollPrev(el.scrollLeft > 8);
      setCanScrollNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
      const maxScroll = el.scrollWidth - el.clientWidth;
      setProgress(maxScroll > 0 ? el.scrollLeft / maxScroll : 0);
    };

    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  });

  function scrollByCard(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const amount = (card?.offsetWidth ?? el.clientWidth * 0.8) + 16;
    el.scrollBy({ left: amount * direction, behavior: "smooth" });
  }

  return {
    ref,
    canScrollPrev,
    canScrollNext,
    progress,
    scrollPrev: () => scrollByCard(-1),
    scrollNext: () => scrollByCard(1),
  };
}

/** Compact prev/next pair for the section header — desktop only; mobile relies
 *  on swipe. Pass straight from `useCarouselScroll()`'s return value. */
export function CarouselArrows({
  canScrollPrev,
  canScrollNext,
  scrollPrev,
  scrollNext,
}: {
  canScrollPrev: boolean;
  canScrollNext: boolean;
  scrollPrev: () => void;
  scrollNext: () => void;
}) {
  return (
    <div className="hidden shrink-0 items-center gap-2 lg:flex">
      <button
        type="button"
        onClick={scrollPrev}
        disabled={!canScrollPrev}
        aria-label="Previous"
        className="press glass-warm flex size-10 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        disabled={!canScrollNext}
        aria-label="Next"
        className="press glass-warm flex size-10 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-40"
      >
        <ChevronRight className="size-4 rtl:rotate-180" />
      </button>
    </div>
  );
}

/** Small position indicator below the track — optional, cosmetic. `count`
 *  is the number of dots to render (typically the item count, capped by the
 *  caller); the active dot is the nearest one to the current scroll
 *  `progress` (0-1) from `useCarouselScroll()`. */
export function CarouselDots({ progress, count }: { progress: number; count: number }) {
  if (count <= 1) return null;
  const active = Math.round(progress * (count - 1));
  return (
    <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === active ? "w-6 bg-primary" : "w-1.5 bg-primary/20"
          }`}
        />
      ))}
    </div>
  );
}

/** The scrollable card track itself — pass the `ref` from `useCarouselScroll()`.
 *  `label` names the rail for assistive tech and doubles as the keyboard
 *  entry point: below `lg` the prev/next arrows are hidden (see
 *  `CarouselArrows`), so this is the only non-touch way to scroll a rail —
 *  Arrow Left/Right move by one card, mirroring `scrollByCard` exactly. */
export function BusinessCarousel({
  scrollRef,
  label,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  label?: string;
  children: ReactNode;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    let direction: 1 | -1 | null = null;
    if (event.key === "ArrowRight") direction = rtl ? -1 : 1;
    else if (event.key === "ArrowLeft") direction = rtl ? 1 : -1;
    if (direction === null) return;
    event.preventDefault();
    const card = el.firstElementChild as HTMLElement | null;
    const amount = (card?.offsetWidth ?? el.clientWidth * 0.8) + 16;
    el.scrollBy({ left: amount * direction, behavior: "smooth" });
  }

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      {Children.map(children, (child) => (
        <div className="w-[78vw] shrink-0 snap-start sm:w-[46%] lg:w-[calc(25%-0.75rem)]">
          {child}
        </div>
      ))}
    </div>
  );
}
