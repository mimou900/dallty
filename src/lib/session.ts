const KEY = "dallty:remember";
const OTP_PENDING_KEY = "dallty:otp-pending";

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

/**
 * Marks that `userId` has a fully valid session but still owes an OTP
 * step-up before using the app. Stored in localStorage (not sessionStorage)
 * because the session itself may be persisted there too — a step-up left
 * pending across a browser restart must still be enforced on reopen.
 */
export function setOtpPending(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OTP_PENDING_KEY, userId);
}

/** Does `userId` still owe an OTP step-up? */
export function isOtpPending(userId: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OTP_PENDING_KEY) === userId;
}

/** Clears the OTP step-up marker — call on successful verification or sign-out. */
export function clearOtpPending() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OTP_PENDING_KEY);
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
