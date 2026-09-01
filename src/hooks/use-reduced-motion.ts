import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** Same `useSyncExternalStore` + `matchMedia` shape as `useBreakpoint()`
 *  (see `use-breakpoint.ts`) — SSR snapshot defaults to `false` (motion
 *  allowed), the safe fallback since `matchMedia` isn't available during
 *  SSR; corrects itself on the client immediately after mount. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
