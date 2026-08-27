/**
 * Universal skeleton primitive — the one shared building block every loading
 * placeholder in the app should compose from (see `BusinessCardSkeleton` for
 * an example), instead of each screen hand-rolling its own `animate-pulse`
 * classes. `animate-pulse` already collapses to static under
 * `prefers-reduced-motion` via the app-wide reduced-motion rule in
 * styles.css, so reduced-motion users get a still placeholder for free.
 *
 * `aria-hidden`: a skeleton is a purely visual stand-in with nothing
 * meaningful to announce — the loading state itself should be conveyed by
 * the real control that triggered it (e.g. a button's `aria-busy`), not by
 * every individual placeholder shape.
 */
export type SkeletonVariant = "text" | "circle" | "image" | "button" | "rect";

const VARIANT_SHAPE: Record<SkeletonVariant, string> = {
  text: "rounded-full",
  circle: "rounded-full",
  button: "rounded-full",
  image: "rounded-2xl",
  rect: "rounded-2xl",
};

const VARIANT_DEFAULT_SIZE: Record<SkeletonVariant, string> = {
  text: "h-3.5 w-full",
  circle: "size-10",
  button: "h-11 w-24",
  image: "size-full",
  rect: "size-full",
};

export function Skeleton({
  variant = "rect",
  width,
  height,
  aspectRatio,
  className = "",
}: {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  /** e.g. "16 / 10" — for image-shaped placeholders that must reserve the
   *  real image's aspect ratio rather than a fixed pixel height. */
  aspectRatio?: string;
  className?: string;
}) {
  const hasExplicitSize = width !== undefined || height !== undefined || aspectRatio !== undefined;
  const style: React.CSSProperties = {};
  if (width !== undefined) style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === "number" ? `${height}px` : height;
  if (aspectRatio) style.aspectRatio = aspectRatio;

  return (
    <div
      aria-hidden
      style={style}
      className={`animate-pulse bg-primary/10 ${VARIANT_SHAPE[variant]} ${hasExplicitSize ? "" : VARIANT_DEFAULT_SIZE[variant]} ${className}`}
    />
  );
}
