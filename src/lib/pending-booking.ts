/**
 * Keeps a half-finished booking alive across the sign-in detour so the
 * customer comes back to the confirm step instead of starting over.
 *
 * Stored in localStorage (not sessionStorage) because OAuth can bounce the
 * customer through a new tab/window, and read non-destructively so a refresh
 * mid-confirm does not throw the booking away. It is cleared explicitly once
 * the booking is created, abandoned, or expired.
 */
export type PendingBooking = {
  salonId: string;
  serviceId: string | null;
  staffId: string | null;
  day: string;
  slot: string | null;
  step: number;
  /** Slot was already chosen: confirm it automatically once signed in. */
  autoConfirm?: boolean;
  /** Epoch ms, used to expire abandoned intents. */
  savedAt?: number;
};

const KEY = "dallty:pending-booking";
/** An intent older than this is stale — the slot has likely moved on. */
const MAX_AGE_MS = 60 * 60 * 1000;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function savePendingBooking(value: PendingBooking) {
  try {
    store()?.setItem(KEY, JSON.stringify({ ...value, savedAt: Date.now() }));
  } catch {
    /* storage unavailable — the user just re-picks a slot */
  }
}

/** Reads the intent without consuming it. Returns null when missing/stale. */
export function readPendingBooking(salonId: string): PendingBooking | null {
  try {
    const raw = store()?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBooking;
    if (parsed.salonId !== salonId) return null;
    if (parsed.savedAt && Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearPendingBooking();
      return null;
    }
    // A stale slot in the past is worse than none.
    if (parsed.slot && new Date(parsed.slot).getTime() < Date.now()) parsed.slot = null;
    return parsed;
  } catch {
    return null;
  }
}

/** Reads and consumes the intent in one go. */
export function takePendingBooking(salonId: string): PendingBooking | null {
  const parsed = readPendingBooking(salonId);
  if (parsed) clearPendingBooking();
  return parsed;
}

export function clearPendingBooking() {
  try {
    store()?.removeItem(KEY);
  } catch {
    /* noop */
  }
}
