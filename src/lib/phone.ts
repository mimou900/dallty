import { COUNTRIES, DEFAULT_COUNTRY, countryByCode, detectCountryCode } from "@/lib/countries";

/** Digits only, no leading zeros stripped. */
export function digitsOnly(value: string) {
  return (value ?? "").replace(/\D+/g, "");
}

/**
 * Algerian mobile numbers: local dialling is `0[5679]XXXXXXXX` (10 digits,
 * operator prefix 05/06/07/09) or the same number without the trunk `0`
 * (9 digits) — never any other length.
 */
export function isValidAlgerianNational(national: string): boolean {
  const d = digitsOnly(national);
  return /^0[5679]\d{8}$/.test(d) || /^[5679]\d{8}$/.test(d);
}

/**
 * Build the canonical storage format: `+<dial><national>` with no spaces,
 * e.g. `+213541678551`. Leading zeros of the national number are dropped
 * because they are a domestic-dialling prefix, not part of the E.164 number.
 */
export function toE164(dial: string, national: string) {
  const d = digitsOnly(dial);
  const n = digitsOnly(national).replace(/^0+/, "");
  if (!d || !n) return "";
  return `+${d}${n}`;
}

/** A phone is usable when it has a dial code and 6–14 national digits. */
export function isValidE164(value: string) {
  return /^\+[1-9]\d{7,15}$/.test(value ?? "");
}

/**
 * Validate a national number against its country's own dialling rules
 * before it's normalized to E.164. Algeria gets exact-length local rules;
 * every other country falls back to the generic E.164 length check.
 */
export function isValidNational(dial: string, national: string): boolean {
  if (digitsOnly(dial) === "213") return isValidAlgerianNational(national);
  return isValidE164(toE164(dial, national));
}

/** Friendly, field-level validation message for a national phone number. */
export function nationalPhoneError(dial: string, national: string): string | null {
  if (!digitsOnly(national)) return "Enter a phone number";
  if (!isValidNational(dial, national)) {
    if (digitsOnly(dial) === "213") {
      return "Enter a valid Algerian number: 05/06/07/09 followed by 8 digits, or 9 digits without the leading 0";
    }
    return "Enter a valid phone number";
  }
  return null;
}

/** Split a stored E.164 number back into a country code + national part. */
export function splitE164(value?: string | null): { countryCode: string; national: string } {
  const raw = (value ?? "").trim();
  if (raw.startsWith("+")) {
    const match = [...COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => raw.startsWith(c.dial));
    if (match) return { countryCode: match.code, national: raw.slice(match.dial.length) };
  }
  return { countryCode: DEFAULT_COUNTRY, national: digitsOnly(raw) };
}

/** Best-effort country guess for a fresh phone field. */
export function guessCountryCode(hint?: string | null) {
  if (hint) return countryByCode(hint).code;
  return detectCountryCode();
}

/** Pretty display used in lists: `+213 541 678 551`. */
export function formatPhoneDisplay(value?: string | null) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const { countryCode, national } = splitE164(raw);
  const dial = countryByCode(countryCode).dial;
  if (!raw.startsWith("+")) return raw;
  return `${dial} ${national.replace(/(\d{3})(?=\d)/g, "$1 ").trim()}`;
}

/** Href for a click-to-call button. */
export function telHref(value?: string | null) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.startsWith("+") ? `+${digitsOnly(raw)}` : digitsOnly(raw);
  return cleaned ? `tel:${cleaned}` : null;
}
