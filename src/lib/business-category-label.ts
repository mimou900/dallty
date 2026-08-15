// A business's own descriptive noun, per spec decision #4: aggregate copy
// ("Nearby salons") stays beauty-flavored, but wherever a *specific*
// business's kind is named (a badge, a page title), it comes from that
// business's own category instead of a hardcoded "salon". businesses.categories
// is free text and isn't guaranteed to match categories.default_name
// exactly (confirmed against live data before writing this) — this falls
// back to the raw stored string, then to a generic label, rather than
// silently rendering nothing.

import type { Category } from "@/lib/reference-data";
import { translate } from "@/lib/reference-data";

export function businessCategoryLabel(
  categories: Category[],
  businessCategories: string[] | null | undefined,
  lang: string,
  fallback: string,
): string {
  const first = businessCategories?.[0]?.trim();
  if (!first) return fallback;

  const match = categories.find((c) => c.default_name.toLowerCase() === first.toLowerCase());
  if (match) return translate(match, lang);

  // No exact match in the seeded categories table — the stored free-text
  // value is still meaningful to a human reader, so show it as-is rather
  // than falling back to a generic label.
  return first;
}
