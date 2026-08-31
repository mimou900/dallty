/**
 * Homepage hero background — "moving mint atmosphere" (explicit spec,
 * Aleric screenshot used as visual reference for the *background only*;
 * no Aleric branding/content/layout involved). Full replacement of the
 * static "Jade Sky" gradient (`@/components/ui/jade-sky`) that was here
 * before — that component stays available elsewhere, just isn't used for
 * the hero anymore. This is also the second replacement of the ORIGINAL
 * Deep-Green/Lime "zones" atmosphere that lived in this same file/export
 * earlier in the project (see styles.css's v13/v14 history comment) —
 * reusing that name/slot rather than adding a third hero-background file.
 *
 * The brief is explicit that this must NOT read as "distinct colored
 * blobs" or "an animated gradient" — one continuous, near-motionless field
 * of soft light. Two layers make that happen:
 *
 * 1. A STATIC 3-stop vertical gradient (#FBFFFC -> #ECFFF1 -> #DEFFE5) —
 *    the actual foundation color, painted once, never animated. This
 *    alone would already look correct as a still image.
 * 2. Three large, heavily-blurred radial fields in colors already close
 *    to that base, at low opacity, slowly drifting (translate3d + scale +
 *    opacity only — see the `mint-field-*` keyframes in styles.css) so
 *    they lighten/deepen regions of the base over a 20-30s loop instead
 *    of reading as their own shape. A fourth, extremely faint Lime field
 *    is the brief's "tiny atmospheric influence" — opacity peaks at 0.05,
 *    nowhere near a visible yellow-green tint.
 *
 * Vertical offsets are fixed rem values, not percentages — this hero
 * wrapper is auto-height (sized by its own content), and percentage
 * top/bottom on an absolutely positioned child resolves against that as
 * indeterminate (a real bug hit and fixed earlier in this exact file;
 * horizontal start/end stays percentage-based since width is never "auto"
 * the same way). `prefers-reduced-motion` needs no special-casing here —
 * styles.css already freezes every animation globally for it, and every
 * field's start/end keyframe state is itself a valid, fully-formed still
 * frame of the atmosphere, so freezing anywhere in the loop still looks
 * like "the same atmosphere," per the brief's own reduced-motion ask.
 */
export function HeroAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* The actual background — everything below only ever lightens/deepens this. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(180deg, #FBFFFC 0%, #ECFFF1 55%, #DEFFE5 100%)",
        }}
      />

      {/* Near-white glow — upper field, largest and softest. */}
      <div
        className="atmosphere-blob -top-20 start-[-8%] w-[36rem] h-[30rem] sm:w-[48rem] sm:h-[40rem] lg:w-[58rem] lg:h-[46rem] xl:w-[68rem] xl:h-[54rem]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0) 68%)",
          filter: "blur(140px)",
          animationName: "mint-field-white",
          animationDuration: "26s",
          animationDelay: "0s",
          animationTimingFunction: "ease-in-out",
        }}
      />

      {/* Mid mint (#ECFFF1 family) — opposite side, center height. */}
      <div
        className="atmosphere-blob top-10 end-[-6%] w-[32rem] h-[26rem] sm:w-[44rem] sm:h-[36rem] lg:w-[54rem] lg:h-[42rem] xl:w-[62rem] xl:h-[48rem]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(236, 255, 241, 0.95) 0%, rgba(236, 255, 241, 0) 68%)",
          filter: "blur(150px)",
          animationName: "mint-field-mid",
          animationDuration: "30s",
          animationDelay: "-12s",
          animationTimingFunction: "ease-in-out",
        }}
      />

      {/* Deeper pale mint (#DEFFE5 family) — anchors the richer lower hero. */}
      <div
        className="atmosphere-blob top-[18rem] start-[6%] w-[36rem] h-[28rem] sm:top-[22rem] sm:w-[48rem] sm:h-[38rem] lg:top-[26rem] lg:w-[58rem] lg:h-[44rem] xl:top-[30rem] xl:w-[66rem] xl:h-[50rem]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(222, 255, 229, 0.95) 0%, rgba(222, 255, 229, 0) 68%)",
          filter: "blur(160px)",
          animationName: "mint-field-deep",
          animationDuration: "24s",
          animationDelay: "-6s",
          animationTimingFunction: "ease-in-out",
        }}
      />

      {/* Lime — a whisper, never a visible color. Small and far softer than
          the mint fields above; exists purely so the atmosphere still
          feels like Dallty. */}
      <div
        className="atmosphere-blob top-[12rem] end-[10%] w-[18rem] h-[15rem] sm:top-[15rem] sm:w-[24rem] sm:h-[20rem] lg:top-[18rem] lg:w-[28rem] lg:h-[24rem]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(204, 208, 0, 0.35) 0%, rgba(204, 208, 0, 0) 65%)",
          filter: "blur(150px)",
          animationName: "mint-field-lime",
          animationDuration: "28s",
          animationDelay: "-18s",
          animationTimingFunction: "ease-in-out",
        }}
      />
    </div>
  );
}
