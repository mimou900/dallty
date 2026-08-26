import { useSyncExternalStore } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

const TABLET_QUERY = "(min-width: 768px)";
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(callback: () => void) {
  const tablet = window.matchMedia(TABLET_QUERY);
  const desktop = window.matchMedia(DESKTOP_QUERY);
  tablet.addEventListener("change", callback);
  desktop.addEventListener("change", callback);
  return () => {
    tablet.removeEventListener("change", callback);
    desktop.removeEventListener("change", callback);
  };
}

function getSnapshot(): Breakpoint {
  if (window.matchMedia(DESKTOP_QUERY).matches) return "desktop";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "mobile";
}

/** Mobile gets the full-screen sheet flows; desktop gets anchored popovers. Server
 *  snapshot defaults to "mobile" (the safe, functional fallback) since matchMedia
 *  isn't available during SSR — corrects itself on the client after mount. */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, () => "mobile");
}
