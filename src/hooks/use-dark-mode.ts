import { useSyncExternalStore } from "react";

/**
 * Reactive to the `.dark` class on `<html>` — the same mechanism the admin dashboard's own
 * theme toggle already uses (`src/components/admin/admin-shell.tsx`). There's no
 * customer-facing dark-mode toggle today, but `classList` is global, so an admin who enables
 * dark mode and then browses the customer site in the same tab does hit this. Extracted out of
 * the (now-removed) grain-gradient hero background so any component can react to the same
 * `.dark` class without a new theming mechanism.
 */
export function useIsDarkMode(): boolean {
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
