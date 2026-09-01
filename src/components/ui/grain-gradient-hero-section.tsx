import { useSyncExternalStore } from "react";
import { GrainGradient } from "@paper-design/shaders-react";

import { useBreakpoint } from "@/hooks/use-breakpoint";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Dallty hero background — a single `GrainGradient` shader instance
 * (`@paper-design/shaders-react`, pinned exact per its own 0.0.x-versioning
 * guidance in package.json), art-directed to Dallty's own 5 brand colors
 * only. Visual reference was an Aleric screenshot for atmosphere/
 * composition — no Aleric branding, copy, layout, or colors used.
 *
 * Third hero-background implementation this project has had (Deep-Green/
 * Lime CSS "zones" -> a static "Jade Sky" gradient -> a hand-rolled CSS
 * "moving mint atmosphere" -> this). The previous one,
 * `@/components/dallty/hero-atmosphere.tsx`, is left on disk unused
 * rather than deleted, matching that same precedent.
 *
 * Positioning: `GrainGradient` extends `React.ComponentProps<'div'>`
 * directly (confirmed in its own .d.ts), so `className`/`style` apply to
 * it with no wrapper needed — `pointer-events-none absolute inset-0`
 * keeps it fully contained inside the hero's own stacking context (the
 * hero wrapper is `position: relative` in routes/index.tsx), never
 * intercepting clicks, never affecting the hero's content-driven height.
 *
 * Color-blend intent (brief): white/soft-green should visually dominate;
 * Deep Green/Sage are ambient depth; Lime is a bare highlight, never a
 * visible yellow-green area. Low `intensity` keeps color bands from
 * aggressively bleeding into each other (which is what would make Lime
 * read as its own "section"); high `softness` removes any hard edges.
 */

// A first pass at colorBack=white + these 4 colors straight from the
// brief's own hex values, at intensity 0.12, rendered as an obviously-
// strong green field with a visibly yellow-green lime band — exactly
// what the brief calls "too strong" (§25). Lower intensity + higher scale
// alone only fixed ONE frame of the animation: this shader's "wave"
// pattern redistributes color area a lot as it moves, so a combination
// that looks right at t=0 can still drift to the headline sitting on a
// near-solid dark-green patch a couple of seconds later (confirmed by
// screenshotting across time, not assumed from a single render). Fixed
// by giving Sage/Deep Green partial alpha (8-digit hex, same underlying
// brand color, not a substitution) so neither can ever fully saturate an
// area regardless of animation phase — contrast now holds for the whole
// loop, not just one lucky frame.
const LIGHT_COLOR_BACK = "#FFFFFF";
const LIGHT_COLORS = ["#FFFFFF", "#E7EFEA", "#557A6B99", "#0F4F3B66", "#CCD00030"];

// Same 5 approved hexes, rebalanced — Deep Green becomes the environment
// (colorBack) instead of a subtle accent. Tried duplicating array entries
// to bias Sage's share first — that pushed Lime into visibly-neon
// territory instead (the array isn't "more entries = more area" the way
// it first looked in the light-mode tuning; empirically confirmed by
// screenshotting, not assumed). What actually works: 8-digit hex alpha on
// Lime/White specifically (`#CCD00030`, `#FFFFFF40`) — same exact brand
// hex underneath (not a substitution, just partial blend weight), so they
// read as "influence"/"a glint" instead of a solid area. Dark-mode body
// copy is light-colored, so a large bright-white patch drifting under it
// (a live animation — no fixed "safe zone" to guarantee) would read as
// broken contrast, not a highlight — the brief's own §17 rule against
// relying on the shader alone for contrast is why this stays conservative
// rather than matching light mode's fuller-opacity proportions.
const DARK_COLOR_BACK = "#0F4F3B";
const DARK_COLORS = ["#0F4F3B", "#557A6B", "#E7EFEA", "#CCD00030", "#FFFFFF40"];

/** Reactive to the `.dark` class on `<html>` — the same mechanism the
 *  admin dashboard's own theme toggle already uses (see
 *  `src/components/admin/admin-shell.tsx`); there's no customer-facing
 *  dark-mode toggle today, but `classList` is global, so an admin who
 *  enables dark mode and then browses the customer site in the same tab
 *  does hit this. Not building a new customer toggle — not asked for,
 *  just making sure the hero itself is genuinely dark-mode-correct
 *  whenever `.dark` is present, exactly like the rest of the token
 *  system already is. */
function useIsDarkMode(): boolean {
  return useSyncExternalStore(
    (callback) => {
      const observer = new MutationObserver(callback);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

/** Desktop gets a generous spread (lower zoom, more of the wave pattern
 *  visible); mobile is zoomed in further so the same atmosphere reads
 *  calmer/less busy on a small screen instead of the same coordinates
 *  simply cropped (brief §14). */
function useHeroScale(): number {
  const breakpoint = useBreakpoint();
  if (breakpoint === "desktop") return 2.2;
  if (breakpoint === "tablet") return 2.6;
  return 3.2;
}

export function HeroGrainGradient({ className }: { className?: string }) {
  const isDark = useIsDarkMode();
  const reducedMotion = usePrefersReducedMotion();
  const scale = useHeroScale();

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <GrainGradient
        className="absolute inset-0 size-full"
        colorBack={isDark ? DARK_COLOR_BACK : LIGHT_COLOR_BACK}
        colors={isDark ? DARK_COLORS : LIGHT_COLORS}
        softness={1}
        intensity={0.04}
        noise={0.08}
        shape="wave"
        fit="cover"
        scale={scale}
        speed={reducedMotion ? 0 : 0.05}
      />

      {/* The shader has no notion of "fade toward the next section" — this
          hero wrapper's height is content-driven, so the shader simply
          stops at whatever color it happens to be at the bottom edge
          without this. Fixed height (not %) matching the established
          fix for this exact "auto-height hero" class of bug elsewhere in
          this codebase (percentage insets on an auto-height parent
          resolve as indeterminate). */}
      <div
        className="absolute inset-x-0 bottom-0 h-24 sm:h-32 lg:h-40"
        style={{
          backgroundImage: `linear-gradient(180deg, transparent 0%, ${isDark ? DARK_COLOR_BACK : LIGHT_COLOR_BACK} 100%)`,
        }}
      />
    </div>
  );
}
