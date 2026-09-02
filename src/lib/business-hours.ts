/**
 * Shared "is this business open right now, and what does today look like" helpers for the
 * Business Profile page. Pulled out of business-profile-hero.tsx / business-hours-location.tsx
 * so both the summary line ("Open until 20:00") and the full weekly hours list derive the
 * exact same notion of "today" and "open now" from one place, instead of two independent
 * (and possibly disagreeing) implementations.
 *
 * Real per-day hours come from `branch_hours` (business_id/opens_at/closes_at per weekday,
 * a row per branch — no row for a weekday means that branch is closed that day; there is no
 * `is_closed` column, per the same convention business-settings.functions.ts documents for
 * this exact table). This intentionally does NOT fall back to the legacy `businesses.opens_at
 * /closes_at` pair for a "no hours configured yet" branch — repeating one static pair across
 * all 7 days would be inventing data the business never entered (brief: "do not fabricate
 * hours"), so a branch with no `branch_hours` rows just reads as closed every day here.
 */

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type BranchHoursRow = { weekday: number; opens_at: string; closes_at: string };

/** "14:30:00" -> "2:30 PM". Tolerant of the "14:30" (no seconds) shape too. */
export function formatHourLabel(value: string): string {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${(m ?? "00").padStart(2, "0")} ${suffix}`;
}

/** JS `Date.getDay()` (0=Sunday) equivalent, computed in the business's own timezone rather
 *  than the visitor's — a business in Algiers open until 22:00 shouldn't read as "closed,
 *  it's tomorrow" for a customer browsing from a timezone that's already past midnight. */
export function todayWeekdayInTimezone(timezone: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || undefined,
      weekday: "short",
    }).formatToParts(new Date());
    const short = parts.find((p) => p.type === "weekday")?.value ?? "";
    const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(short);
    return idx === -1 ? new Date().getDay() : idx;
  } catch {
    return new Date().getDay();
  }
}

/** "HH:MM" in the business's own timezone, zero-padded, 24h — directly comparable to the
 *  "HH:MM:SS" strings `branch_hours` stores. */
function currentTimeInTimezone(timezone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || undefined,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
  }
}

export type OpenStatus =
  | { open: true; closesAt: string }
  | { open: false; opensAt: string | null };

/** Today's open/closed status, purely informational (same spirit as the booking wizard's own
 *  HoldCountdown — the server is the real source of truth for what's actually bookable). Only
 *  handles same-day ranges, matching every other hours display already in this codebase. */
export function todayOpenStatus(
  todayHours: BranchHoursRow | undefined,
  timezone: string | null | undefined,
): OpenStatus {
  if (!todayHours) return { open: false, opensAt: null };
  const now = currentTimeInTimezone(timezone);
  const opens = todayHours.opens_at.slice(0, 5);
  const closes = todayHours.closes_at.slice(0, 5);
  if (now >= opens && now < closes) return { open: true, closesAt: todayHours.closes_at };
  return { open: false, opensAt: now < opens ? todayHours.opens_at : null };
}
