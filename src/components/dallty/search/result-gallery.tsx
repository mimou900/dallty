import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useTranslation } from "@/lib/i18n/hooks";

export type GalleryImage = { id: string; url: string };

/**
 * The search result card's swipeable image strip (Search redesign §11-12) —
 * a small discovery gallery, not a portfolio viewer: up to 5 images (the
 * caller already caps this, see `useBusinessGalleries`), no autoplay, no
 * infinite loop (arrows disable at the ends, mirroring
 * `business-carousel.tsx`'s `CarouselArrows`), dots whenever there's more
 * than one image. The whole card is already a `<Link>` to the profile, so
 * tapping the image itself opens it for free — only the arrow buttons need
 * `stopPropagation` so a click on them doesn't also trigger the card link.
 * Own small scroll-tracking effect rather than reusing
 * `useCarouselScroll`/`scrollByCard`: that helper assumes a 16px inter-card
 * gap (`+16` in its scroll-distance math) which doesn't apply here — each
 * slide is edge-to-edge, exactly one card-width wide.
 */
export function ResultGallery({
  images,
  alt,
  aspectClassName = "aspect-[4/3]",
  onImageClick,
  priority,
}: {
  images: GalleryImage[];
  alt: string;
  aspectClassName?: string;
  /** Set on the first card of the first result page only — its first image
   *  is the page's LCP candidate, loaded eagerly and with priority instead
   *  of every other card's `loading="lazy"`. */
  priority?: boolean;
  /** The card around this gallery is NOT itself a `<Link>` (nesting the
   *  scroll-snap swipe track inside an `<a>` would fight browser drag/scroll
   *  handling) — the card's text block has the real `<Link>` for keyboard/
   *  screen-reader navigation, and this fires the same navigation when the
   *  image area receives a genuine tap. A drag-to-swipe release doesn't fire
   *  a spurious `click` here — that's native browser behavior for
   *  scroll-snap content, not something this component has to guard against. */
  onImageClick?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(images.length > 1);
  const { t } = useTranslation("marketplace");

  useEffect(() => {
    const el = trackRef.current;
    if (!el || images.length <= 1) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const i = Math.round(el.scrollLeft / Math.max(el.clientWidth, 1));
        setIndex(Math.min(Math.max(i, 0), images.length - 1));
        setCanPrev(el.scrollLeft > 8);
        setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
      });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
    };
  }, [images.length]);

  function go(direction: 1 | -1, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = trackRef.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: el.clientWidth * direction * (rtl ? -1 : 1), behavior: "smooth" });
  }

  if (images.length === 0) {
    return <div className={`relative overflow-hidden bg-muted ${aspectClassName}`} />;
  }

  return (
    <div className={`group/gallery relative overflow-hidden ${aspectClassName}`}>
      <div
        ref={trackRef}
        onClick={onImageClick}
        className="scrollbar-hide flex size-full snap-x snap-mandatory overflow-x-auto"
      >
        {images.map((img, i) => (
          <img
            key={img.id}
            src={img.url}
            alt={i === 0 ? alt : ""}
            loading={priority && i === 0 ? "eager" : "lazy"}
            fetchPriority={priority && i === 0 ? "high" : undefined}
            className="size-full shrink-0 snap-start object-cover"
          />
        ))}
      </div>

      {images.length > 1 && (
        <>
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-between px-2 opacity-0 transition-opacity duration-150 group-hover/gallery:opacity-100 lg:flex">
            <button
              type="button"
              onClick={(e) => go(-1, e)}
              disabled={!canPrev}
              aria-label={t("gallery_prev_aria")}
              className="press pointer-events-auto grid size-8 place-items-center rounded-full bg-white/90 text-primary shadow-sm disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </button>
            <button
              type="button"
              onClick={(e) => go(1, e)}
              disabled={!canNext}
              aria-label={t("gallery_next_aria")}
              className="press pointer-events-auto grid size-8 place-items-center rounded-full bg-white/90 text-primary shadow-sm disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronRight className="size-4 rtl:rotate-180" />
            </button>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-2.5 flex items-center justify-center gap-1"
          >
            {images.map((img, i) => (
              <span
                key={img.id}
                className={`h-1.5 rounded-full transition-all duration-150 ${
                  i === index ? "w-4 bg-white" : "w-1.5 bg-white/55"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
