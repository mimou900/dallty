/**
 * Animated atmospheric background for the homepage hero.
 *
 * Three real bugs fixed here (found by inspecting actual computed layout, not just
 * computed style values):
 *
 * 1. Colors: an earlier pass used `oklch(from var(--x) l c h / a)` (CSS
 *    relative-color syntax), which isn't universally parsed — an unsupported color
 *    function inside a gradient invalidates the whole background-image, silently
 *    dropping it to `none`. Now plain `rgba()`.
 * 2. Position: `top`/`bottom` PERCENTAGES on an absolutely positioned element
 *    resolve against the containing block's height — and this hero wrapper's height
 *    is "auto" (sized by its own content), which is exactly the case the CSS spec
 *    treats as indeterminate for that calculation. Vertical offsets are fixed
 *    spacing-scale values instead; horizontal (start/end) stays percentage-based
 *    since width is never "auto" the same way.
 * 3. Stacking context: the hero wrapper (`<div className="relative">` in
 *    routes/index.tsx) had `position: relative` with no `z-index`, which does NOT
 *    establish a new stacking context. This layer's `-z-10` therefore escaped past
 *    that wrapper entirely and painted behind a distant opaque ancestor
 *    (`bg-cream` on the page root), making every color/opacity/blur tweak
 *    invisible regardless of its values. Fixed by adding `isolate` to that wrapper.
 *
 * Design v6 — rebuilt against an actual Fresha reference screenshot (earlier
 * rounds worked from text descriptions of it alone and ended up overbuilding a
 * six-color-zone mesh the reference doesn't actually have). What the reference
 * shows is a DIAGONAL wash — one cool tone glowing from the upper-left corner,
 * pink glowing from the lower-right. Translated to Dallty: lime/green take the
 * upper-left corner (+ a whisper of deep green for brand depth), pink takes
 * the lower-right.
 *
 * v7 — no animated white/bright layer. Cream (`bg-cream` on the page root,
 * static, not part of this component) IS the hero's base and is meant to show
 * through naturally in the gaps between color fields. The bridge between the
 * cool lime corner and the warm pink corner is a very subtle pastel lavender
 * — chromatically between the two — not white.
 *
 * v8 — color DOMINANCE is now a coordinated group behavior, not a per-field
 * accident. Every pink field (A/B/C) and every lime/green field (lime A/B,
 * green whisper) carries TWO animations at once: its own `atmosphere-pos-*`
 * transform-only path (independent duration, so fields keep drifting through
 * different regions of the hero), plus the SAME shared `atmosphere-dominance`
 * opacity keyframe from styles.css — pink fields run it near phase 0, lime/
 * green fields run it shifted by exactly half its 38s period. Because that
 * keyframe is a symmetric rise-and-fall, the half-period shift guarantees the
 * two families are always anti-phase: whichever is fading, the other is
 * rising, so they're never both weak at the same moment (see the long
 * comment above `@keyframes atmosphere-dominance` in styles.css for the
 * mechanics). Lavender stays independent of this — it's a bridge tone, not
 * part of the pink/green duality.
 */
export function HeroAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Lime A — upper-left corner, the primary field. Dominance phase ~19s
          (anti-phase to the pink family). */}
      <div
        className="atmosphere-blob -top-40 start-[-32%] size-[42rem] sm:size-[64rem] lg:size-[92rem]"
        style={{
          backgroundColor: "rgba(192, 221, 0, 0.22)",
          filter: "blur(200px)",
          animationName: "atmosphere-pos-lime-a, atmosphere-dominance",
          animationDuration: "27s, 38s",
          animationDelay: "-5s, -19s",
          animationTimingFunction: "cubic-bezier(0.45, 0, 0.55, 1), ease-in-out",
        }}
      />
      {/* Lime B — smaller, same corner, independent path so the corner isn't one
          static shape. */}
      <div
        className="atmosphere-blob -top-4 start-[-10%] size-[20rem] sm:size-[30rem] lg:size-[48rem]"
        style={{
          backgroundColor: "rgba(192, 221, 0, 0.12)",
          filter: "blur(170px)",
          animationName: "atmosphere-pos-lime-b, atmosphere-dominance",
          animationDuration: "29.6s, 38s",
          animationDelay: "-12s, -22s",
          animationTimingFunction: "cubic-bezier(0.4, 0, 0.6, 1), ease-in-out",
        }}
      />
      {/* Deep green whisper — very subtle, blended near the lime corner, brand
          depth without becoming its own visible zone. */}
      <div
        className="atmosphere-blob top-16 start-[-14%] size-[24rem] sm:size-[38rem] lg:size-[58rem] sm:top-20 lg:top-24"
        style={{
          backgroundColor: "rgba(15, 69, 53, 0.07)",
          filter: "blur(190px)",
          animationName: "atmosphere-pos-green-a, atmosphere-dominance",
          animationDuration: "25.4s, 38s",
          animationDelay: "-18s, -25s",
          animationTimingFunction: "cubic-bezier(0.37, 0, 0.63, 1), ease-in-out",
        }}
      />
      {/* Pink A — lower-right corner, the primary pink field. Dominance phase
          ~0s (anti-phase to the lime/green family). */}
      <div
        className="atmosphere-blob top-[26rem] end-[-32%] size-[44rem] sm:size-[66rem] lg:size-[92rem] sm:top-[32rem] lg:top-[38rem]"
        style={{
          backgroundColor: "rgba(255, 120, 219, 0.2)",
          filter: "blur(200px)",
          animationName: "atmosphere-pos-pink-a, atmosphere-dominance",
          animationDuration: "22s, 38s",
          animationDelay: "-2s, 0s",
          animationTimingFunction: "cubic-bezier(0.42, 0, 0.58, 1), ease-in-out",
        }}
      />
      {/* Pink B — smaller, same corner, independent path. */}
      <div
        className="atmosphere-blob top-[22rem] end-[-6%] size-[20rem] sm:size-[30rem] lg:size-[48rem] sm:top-[26rem] lg:top-[30rem]"
        style={{
          backgroundColor: "rgba(255, 120, 219, 0.11)",
          filter: "blur(170px)",
          animationName: "atmosphere-pos-pink-b, atmosphere-dominance",
          animationDuration: "24.5s, 38s",
          animationDelay: "-9s, -3s",
          animationTimingFunction: "cubic-bezier(0.42, 0, 0.58, 1), ease-in-out",
        }}
      />
      {/* Pink C — a third pink field reaching toward the left side, so pink's
          presence isn't confined to a single corner (the family needs to be
          able to read as dominant from the left too, per the "spatial
          movement" requirement). */}
      <div
        className="atmosphere-blob top-[20rem] start-[-18%] size-[18rem] sm:size-[28rem] lg:size-[44rem] sm:top-[26rem] lg:top-[32rem]"
        style={{
          backgroundColor: "rgba(255, 120, 219, 0.1)",
          filter: "blur(170px)",
          animationName: "atmosphere-pos-pink-c, atmosphere-dominance",
          animationDuration: "20.3s, 38s",
          animationDelay: "-14s, -6s",
          animationTimingFunction: "cubic-bezier(0.42, 0, 0.58, 1), ease-in-out",
        }}
      />
      {/* Lavender A — the bridge between the cool lime corner and the warm pink
          corner, chromatically between the two rather than a competing bright
          zone. Very subtle. Painted late in DOM order, over the color fields,
          but at low alpha so Cream still shows through underneath it.
          Independent of the pink/green dominance duality — its own
          self-contained animation, unchanged from v7. */}
      <div
        className="atmosphere-blob top-12 start-[10%] size-[46rem] sm:size-[66rem] lg:size-[100rem] sm:top-16 lg:top-20"
        style={{
          backgroundColor: "rgba(196, 181, 253, 0.14)",
          filter: "blur(220px)",
          animationName: "atmosphere-drift-lavender-a",
          animationDuration: "10.8s",
          animationDelay: "-5s",
          animationTimingFunction: "ease-in-out",
        }}
      />
      {/* Lavender B — small, even more subtle, adds a second bridging point so
          the transition doesn't read as one static disc. */}
      <div
        className="atmosphere-blob -top-4 start-[36%] size-[22rem] sm:size-[32rem] lg:size-[50rem]"
        style={{
          backgroundColor: "rgba(196, 181, 253, 0.08)",
          filter: "blur(170px)",
          animationName: "atmosphere-drift-lavender-b",
          animationDuration: "14.7s",
          animationDelay: "-2s",
          animationTimingFunction: "ease-in-out",
        }}
      />
      {/* Fade to Cream — a fixed height at the very bottom of the hero wrapper, so
          the atmosphere stays visible through most of the hero and only dissolves
          in the final stretch (a percentage height here has the exact same
          auto-height-parent problem as top/bottom above). */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-cream sm:h-32 lg:h-40" />
    </div>
  );
}
