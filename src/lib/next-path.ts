/**
 * Remembers where the user was headed before the sign-in detour.
 * Written to both storages: OAuth can return in a fresh tab, where
 * sessionStorage is empty but localStorage survives.
 */
const KEY = "dallty:next";

export function isSafePath(path: string | null | undefined): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//"));
}

export function saveNextPath(path: string) {
  if (!isSafePath(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
    localStorage.setItem(KEY, path);
  } catch {
    /* storage unavailable — user lands on their role home instead */
  }
}

/** Reads and consumes the saved destination. */
export function takeNextPath(): string | null {
  try {
    const value = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
    return isSafePath(value) ? value : null;
  } catch {
    return null;
  }
}
