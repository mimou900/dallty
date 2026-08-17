/**
 * All three languages this app supports (`src/lib/i18n.tsx`'s `LANGUAGES`) map directly to
 * valid Intl/BCP-47 locale tags, so `lang` can be passed straight through — no per-language
 * branching needed here. Before this fix, `locale` only accepted `"en" | "ar"`, so a French
 * caller silently fell through to English number/date formatting; no caller in the codebase
 * was passing this param at all (all ~13 call sites relied on the default), which is why
 * the bug was invisible in practice. Callers should pass the active `lang` from
 * `useLocale()` going forward — see business.$businessSlug.tsx for the fixed example.
 */
type FormatLang = "en" | "fr" | "ar";

/** Price formatting that respects each business's own currency. */
export function formatMoney(
  amount: number | string | null | undefined,
  currency = "DZD",
  lang: FormatLang = "en",
) {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency}`;
  }
}

/** Time formatting in the business's own time zone. */
export function formatInTimezone(
  date: Date | string,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" },
  lang: FormatLang = "en",
) {
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat(lang, {
      ...options,
      timeZone: timezone || undefined,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(d);
  }
}
