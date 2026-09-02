import Velaris from "@/components/ui/velaris";
import { useIsDarkMode } from "@/hooks/use-dark-mode";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Dallty hero background — third rebuild of this exact spot this project has had (a static
 * "Jade Sky" gradient -> a hand-rolled CSS "moving mint atmosphere" -> the Paper Design
 * `GrainGradient` WebGL shader -> this). Replaces the GrainGradient version outright per
 * explicit instruction ("remove the old one") rather than leaving it on disk unused, the way
 * earlier swaps in this project did — `grain-gradient-hero-section.tsx` and
 * `@paper-design/shaders-react` are both removed, not just unwired.
 *
 * `Velaris` (`@/components/ui/velaris`) only takes 4 colors + one `bg`, not the 5-color
 * Master System palette the previous shader used, and has no per-color alpha/weight
 * mechanism (its `hexToRgb` silently drops any alpha suffix, so an 8-digit hex would just
 * read as its own RGB — no area-limiting trick available here). Colors are chosen instead by
 * how the shader itself blends them: `bg` is the base canvas; `colors[0]`/`colors[1]` are
 * the two strongest layers (0.85 / 0.7 blend weight) so they carry the "mostly white/pale
 * mint" majority; `colors[2]`/`colors[3]` are weighted lower (0.6 / 0.5) AND — for colors[3]
 * — gated behind a product of two noise fields (`n1 * n2`), which is statistically sparser
 * than either field alone, so it reads as an occasional deep accent rather than a large area.
 * Fresh Lime isn't one of the 4 slots — dropped from the moving background entirely (it stays
 * the site's CTA/accent color elsewhere), matching the same "signature accent should be rare"
 * call already made for the previous shader.
 *
 * Dark mode is the one place this needed real care: with no alpha-based safety net, any pale
 * color in the array can still drift under light-colored dark-mode text at some point in the
 * animation loop — the exact bug class fixed twice on the previous shader. The dark palette
 * here is deliberately ALL dark tones (no white/pale mint at all), so no bright patch can
 * ever occur regardless of animation phase — verified across a several-second window, not
 * just frame zero, same discipline as before.
 */
const LIGHT_BG = "#FAFCF9"; // Near White — Main canvas
const LIGHT_COLORS = ["#FFFFFF", "#F2F8F3", "#0E5A43", "#083C2F"];

const DARK_BG = "#083C2F"; // Deep Forest — dark environment
const DARK_COLORS = ["#0E5A43", "#083C2F", "#0E5A43", "#000000"];

export function HeroVelarisBackground({ className }: { className?: string }) {
  const isDark = useIsDarkMode();
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <Velaris
        height="100%"
        className="absolute inset-0"
        bg={isDark ? DARK_BG : LIGHT_BG}
        colors={isDark ? DARK_COLORS : LIGHT_COLORS}
        speed={reducedMotion ? 0 : 1.1}
        grain={0.12}
      />

      {/* Fade toward the next section — Velaris has no notion of "dissolve into the page
          below it"; fixed height (not %), matching the established fix for this exact
          "auto-height hero" bug class elsewhere in this codebase (percentage insets on an
          auto-height parent resolve as indeterminate). */}
      <div
        className="absolute inset-x-0 bottom-0 h-24 sm:h-32 lg:h-40"
        style={{
          backgroundImage: `linear-gradient(180deg, transparent 0%, ${isDark ? DARK_BG : LIGHT_BG} 100%)`,
        }}
      />
    </div>
  );
}
