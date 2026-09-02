import { useSyncExternalStore } from "react";

/**
 * "up" (or near the very top of the page) vs "down" — the same signal Instagram's bottom
 * tab bar and most modern feed apps use to auto-collapse chrome while someone is actively
 * reading down a page, and restore it the moment they pause/reverse. A single shared
 * `scroll` listener on `window` (module-scoped, not per-hook-instance) backs every consumer
 * on the page at once — BottomNav and a page's own sticky CTA both subscribe to the exact
 * same store instead of running two independent scroll listeners computing the same thing.
 *
 * `THRESHOLD` ignores sub-pixel/momentum jitter so the state doesn't flicker on a single
 * scroll tick; the "near top" override forces "up" (i.e. fully visible chrome) whenever the
 * page is within `TOP_ZONE` of its top, regardless of the last recorded delta — arriving at
 * a fresh page (or scrolling back to the very top) should never show collapsed chrome.
 */

export type ScrollDirection = "up" | "down";

const THRESHOLD = 6;
const TOP_ZONE = 24;

let lastY = 0;
let direction: ScrollDirection = "up";
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function handleScroll() {
  const y = window.scrollY;
  if (y < TOP_ZONE) {
    lastY = y;
    if (direction !== "up") {
      direction = "up";
      notify();
    }
    return;
  }
  const delta = y - lastY;
  if (Math.abs(delta) < THRESHOLD) return;
  const next: ScrollDirection = delta > 0 ? "down" : "up";
  lastY = y;
  if (next !== direction) {
    direction = next;
    notify();
  }
}

function subscribe(callback: () => void) {
  if (listeners.size === 0) {
    lastY = window.scrollY;
    direction = lastY < TOP_ZONE ? "up" : direction;
    window.addEventListener("scroll", handleScroll, { passive: true });
  }
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) window.removeEventListener("scroll", handleScroll);
  };
}

function getSnapshot(): ScrollDirection {
  return direction;
}

/** SSR-safe default is "up" (fully visible) — the safe, functional fallback, matching
 *  `useBreakpoint`'s own convention. */
export function useScrollDirection(): ScrollDirection {
  return useSyncExternalStore(subscribe, getSnapshot, () => "up");
}
