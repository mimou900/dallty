/** Supported launch markets. One row per country: ISO code, currency, IANA timezone. */
export type Country = {
  code: string;
  name: string;
  nameAr: string;
  currency: string;
  timezone: string;
  dial: string;
  flag: string;
};

export const COUNTRIES: Country[] = [
  { code: "DZ", name: "Algeria", nameAr: "الجزائر", currency: "DZD", timezone: "Africa/Algiers", dial: "+213", flag: "🇩🇿" },
  { code: "AE", name: "United Arab Emirates", nameAr: "الإمارات", currency: "AED", timezone: "Asia/Dubai", dial: "+971", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", nameAr: "السعودية", currency: "SAR", timezone: "Asia/Riyadh", dial: "+966", flag: "🇸🇦" },
  { code: "QA", name: "Qatar", nameAr: "قطر", currency: "QAR", timezone: "Asia/Qatar", dial: "+974", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait", nameAr: "الكويت", currency: "KWD", timezone: "Asia/Kuwait", dial: "+965", flag: "🇰🇼" },
  { code: "BH", name: "Bahrain", nameAr: "البحرين", currency: "BHD", timezone: "Asia/Bahrain", dial: "+973", flag: "🇧🇭" },
  { code: "OM", name: "Oman", nameAr: "عُمان", currency: "OMR", timezone: "Asia/Muscat", dial: "+968", flag: "🇴🇲" },
  { code: "EG", name: "Egypt", nameAr: "مصر", currency: "EGP", timezone: "Africa/Cairo", dial: "+20", flag: "🇪🇬" },
  { code: "MA", name: "Morocco", nameAr: "المغرب", currency: "MAD", timezone: "Africa/Casablanca", dial: "+212", flag: "🇲🇦" },
  { code: "TN", name: "Tunisia", nameAr: "تونس", currency: "TND", timezone: "Africa/Tunis", dial: "+216", flag: "🇹🇳" },
  { code: "LY", name: "Libya", nameAr: "ليبيا", currency: "LYD", timezone: "Africa/Tripoli", dial: "+218", flag: "🇱🇾" },
  { code: "JO", name: "Jordan", nameAr: "الأردن", currency: "JOD", timezone: "Asia/Amman", dial: "+962", flag: "🇯🇴" },
  { code: "LB", name: "Lebanon", nameAr: "لبنان", currency: "LBP", timezone: "Asia/Beirut", dial: "+961", flag: "🇱🇧" },
  { code: "IQ", name: "Iraq", nameAr: "العراق", currency: "IQD", timezone: "Asia/Baghdad", dial: "+964", flag: "🇮🇶" },
  { code: "PS", name: "Palestine", nameAr: "فلسطين", currency: "ILS", timezone: "Asia/Hebron", dial: "+970", flag: "🇵🇸" },
  { code: "SY", name: "Syria", nameAr: "سوريا", currency: "SYP", timezone: "Asia/Damascus", dial: "+963", flag: "🇸🇾" },
  { code: "YE", name: "Yemen", nameAr: "اليمن", currency: "YER", timezone: "Asia/Aden", dial: "+967", flag: "🇾🇪" },
  { code: "SD", name: "Sudan", nameAr: "السودان", currency: "SDG", timezone: "Africa/Khartoum", dial: "+249", flag: "🇸🇩" },
  { code: "MR", name: "Mauritania", nameAr: "موريتانيا", currency: "MRU", timezone: "Africa/Nouakchott", dial: "+222", flag: "🇲🇷" },
  { code: "SO", name: "Somalia", nameAr: "الصومال", currency: "SOS", timezone: "Africa/Mogadishu", dial: "+252", flag: "🇸🇴" },
  { code: "DJ", name: "Djibouti", nameAr: "جيبوتي", currency: "DJF", timezone: "Africa/Djibouti", dial: "+253", flag: "🇩🇯" },
  { code: "KM", name: "Comoros", nameAr: "جزر القمر", currency: "KMF", timezone: "Indian/Comoro", dial: "+269", flag: "🇰🇲" },
];

export const DEFAULT_COUNTRY = "DZ";

export function countryByCode(code?: string | null): Country {
  return COUNTRIES.find((c) => c.code === (code ?? "").toUpperCase()) ??
    COUNTRIES.find((c) => c.code === DEFAULT_COUNTRY)!;
}

export function countryByName(name?: string | null): Country | undefined {
  const n = (name ?? "").trim().toLowerCase();
  return COUNTRIES.find((c) => c.name.toLowerCase() === n || c.nameAr === (name ?? "").trim());
}

/** Guess the visitor's country from the browser timezone; falls back to Algeria. */
export function detectCountryCode(): string {
  if (typeof Intl === "undefined") return DEFAULT_COUNTRY;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hit = COUNTRIES.find((c) => c.timezone === tz);
    return hit?.code ?? DEFAULT_COUNTRY;
  } catch {
    return DEFAULT_COUNTRY;
  }
}

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
