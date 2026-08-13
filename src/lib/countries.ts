/** Price formatting that respects each business's own currency. */
export function formatMoney(
  amount: number | string | null | undefined,
  currency = "AED",
  locale: "en" | "ar" = "en",
) {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar" : "en", {
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
  locale: "en" | "ar" = "en",
) {
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
      ...options,
      timeZone: timezone || undefined,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(d);
  }
}
