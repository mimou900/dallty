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
 * Color-blend intent (brief, refined pass with an explicit target
 * distribution — see the constants below): Near White/Pure White should
 * visually dominate (~65%), Pale Mint is its own soft zone (~20%), Deep
 * Forest/Forest Green are ambient depth (~10%/~4%), Fresh Lime is a bare
 * highlight (~1%), never a visible yellow-green area. Low `intensity`
 * keeps color bands from aggressively bleeding into each other (which is
 * what would make Lime read as its own "section"); high `softness`
 * removes any hard edges.
 */

// Refined palette pass (explicit follow-up), with an explicit target
// distribution this time: ~65% near-white/white, ~20% pale mint, ~10% deep
// green, ~4% forest green, ~1% lime. `colors` area isn't literally
// percentage-controllable (no per-color "weight" prop — confirmed against
// the shader's own params), so it's approximated the same way the first
// palette pass ended up working: alpha on the 8-digit hex (same underlying
// brand color, not a substitution) roughly proportional to each color's
// target share, over the SAME proven intensity/scale/softness combination
// already confirmed stable across a full animation loop (not just frame
// zero — see the prior pass's notes). White/Near-White together are the
// ~65% base (colorBack + a full-opacity white in the array); Pale Mint is
// its own ~20% zone at full opacity; Deep Forest/Forest Green/Lime step
// down in both opacity AND array position for their ~10/~4/~1% shares.
const LIGHT_COLOR_BACK = "#FAFCF9"; // Near White — Main canvas
const LIGHT_COLORS = ["#FFFFFF", "#F2F8F3", "#083C2F80", "#0E5A434D", "#C6E83A1F"];

// Same palette, Deep Forest becomes the dark environment (colorBack)
// instead of a ~10% accent. Pale Mint/Lime/White ALL stay low-alpha here —
// dark-mode body copy is light-colored, so any large bright patch drifting
// under it (a live animation, no fixed "safe zone" to guarantee) reads as
// broken contrast, not a highlight. First attempt kept Pale Mint at full
// opacity (matching its light-mode share) and hit exactly that: a bright
// patch swallowing the subtitle. Faint across the board is what actually
// holds legibility for the whole loop (confirmed the same way as the
// light-mode pass — screenshotting across several seconds, not just frame
// zero).
const DARK_COLOR_BACK = "#083C2F"; // Deep Forest — dark environment
const DARK_COLORS = ["#0E5A43", "#F2F8F340", "#C6E83A26", "#FFFFFF33"];

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
