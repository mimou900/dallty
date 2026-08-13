const KEY = "dallty:remember";

/**
 * Supabase always persists the session in localStorage. When "Remember me" is
 * off we mark the session as ephemeral and clear it when the tab is closed.
 */
export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  if (remember) window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, "0");
}

export function isRememberMe() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(KEY) !== "0";
}

/** Registers the tab-close cleanup. Returns an unsubscribe function. */
export function installEphemeralSessionGuard() {
  if (typeof window === "undefined") return () => {};
  const onHide = () => {
    if (isRememberMe()) return;
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        window.localStorage.removeItem(key);
      }
    }
  };
  window.addEventListener("pagehide", onHide);
  return () => window.removeEventListener("pagehide", onHide);
}
