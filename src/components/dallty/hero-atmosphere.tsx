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
 * v14 — color-fidelity refinement of v13's Deep Green / Lime system. v13 put
 * three green-family fields (primary + pale-green + a "green secondary") in
 * overlapping territory with only one lime field, which is exactly what reads
 * as "gray-green mud" instead of clean, recognizable green/lime separation.
 * Reorganized into two distinct ZONES with a white field between them:
 *
 * - GREEN ZONE (one area of the hero): pure Deep Green `#0F4F3B` primary +
 *   a lighter same-family tint (`#9FBDB2`) for depth.
 * - LIME ZONE (a different area): pure Lime `#CCD000` primary + a lighter
 *   same-family tint (`#E9EB91`). Lime's peak opacity is tuned LOWER than
 *   Green's (see `@keyframes atmosphere-lime-primary` in styles.css) because
 *   the same alpha reads more neon on Lime than on Deep Green — it's an
 *   inherently more luminant hue.
 * - A white "breathe" field sits between the two zones so the transition
 *   reads as green → clean white → lime, not one blended wash.
 *
 * Blur is reduced from v13 (was up to 210px) so each field keeps a
 * recognizable "this is green" / "this is lime" center — translucent glass,
 * not fog. Motion (position+scale+opacity combined per field, five different
 * non-multiple durations 13s/16s/18s/21s/24s) is unchanged from v13.
 */
export function HeroAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* GREEN ZONE — primary. Upper-left, pure Deep Green. */}
      <div
        className="atmosphere-blob -top-24 start-[-10%] w-[30rem] h-[24rem] sm:w-[40rem] sm:h-[32rem] lg:w-[44rem] lg:h-[36rem]"
        style={{
          backgroundColor: "rgb(15, 79, 59)",
          filter: "blur(130px)",
          animationName: "atmosphere-green-primary",
          animationDuration: "18s",
          animationDelay: "0s",
          animationTimingFunction: "ease-in-out",
        }}
      />
      {/* GREEN ZONE — tint. Same area, lighter same-family tone for depth. */}
      <div
        className="atmosphere-blob top-4 start-[6%] w-[22rem] h-[18rem] sm:w-[28rem] sm:h-[24rem] lg:w-[32rem] lg:h-[28rem]"
        style={{
          backgroundColor: "rgb(159, 189, 178)",
          filter: "blur(150px)",
          animationName: "atmosphere-green-tint",
          animationDuration: "16s",
          animationDelay: "-5s",
          animationTimingFunction: "ease-in-out",
        }}
      />
      {/* WHITE separator — keeps the green zone and lime zone from blending
          into one wash; the transition should read as a clean white gap. */}
      <div
        className="atmosphere-blob top-[20rem] start-[24%] w-[32rem] h-[26rem] sm:w-[42rem] sm:h-[34rem] lg:w-[48rem] lg:h-[38rem] sm:top-[24rem] lg:top-[28rem]"
        style={{
          backgroundColor: "rgb(255, 255, 255)",
          filter: "blur(170px)",
          animationName: "atmosphere-breathe",
          animationDuration: "24s",
          animationDelay: "-12s",
          animationTimingFunction: "ease-in-out",
        }}
      />
      {/* LIME ZONE — primary. Lower-right, pure Lime — a separate area from
          the green zone. */}
      <div
        className="atmosphere-blob top-[22rem] end-[-8%] w-[28rem] h-[22rem] sm:w-[38rem] sm:h-[30rem] lg:w-[42rem] lg:h-[34rem] sm:top-[28rem] lg:top-[32rem]"
        style={{
          backgroundColor: "rgb(204, 208, 0)",
          filter: "blur(130px)",
          animationName: "atmosphere-lime-primary",
          animationDuration: "21s",
          animationDelay: "-8s",
          animationTimingFunction: "ease-in-out",
        }}
      />
      {/* LIME ZONE — tint. Same area, lighter same-family tone for depth. */}
      <div
        className="atmosphere-blob top-[26rem] end-[4%] w-[20rem] h-[16rem] sm:w-[26rem] sm:h-[22rem] lg:w-[30rem] lg:h-[26rem] sm:top-[32rem] lg:top-[36rem]"
        style={{
          backgroundColor: "rgb(233, 235, 145)",
          filter: "blur(150px)",
          animationName: "atmosphere-lime-tint",
          animationDuration: "13s",
          animationDelay: "-6s",
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
