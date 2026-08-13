import { useMemo } from "react";
import { Phone } from "lucide-react";

import { useCountries, getCountryByCode, getDefaultCountry } from "@/lib/reference-data";
import { digitsOnly, isValidNational, nationalPhoneError, toE164 } from "@/lib/phone";
import { telHref } from "@/lib/phone";

export type PhoneFieldValue = { countryCode: string; national: string };

/** Country dial-code select + national number. Stores as E.164 (`+213541678551`). */
export function PhoneField({
  value,
  onChange,
  label = "Phone number",
  required,
  id = "phone",
  hint,
  dir,
  disabled,
}: {
  value: PhoneFieldValue;
  onChange: (next: PhoneFieldValue) => void;
  label?: string;
  required?: boolean;
  id?: string;
  hint?: string;
  dir?: "ltr" | "rtl";
  disabled?: boolean;
}) {
  const countries = useCountries();
  const country = getCountryByCode(value.countryCode) ?? getDefaultCountry();
  const e164 = useMemo(
    () => toE164(country.calling_code, value.national),
    [country.calling_code, value.national],
  );
  const invalid = value.national.length > 0 && !isValidNational(country.calling_code, value.national);
  const errorMessage = invalid ? nationalPhoneError(country.calling_code, value.national) : null;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </label>
      <div className="flex gap-2" dir="ltr">
        <select
          aria-label="Country code"
          value={country.iso_code}
          onChange={(e) => onChange({ ...value, countryCode: e.target.value })}
          disabled={disabled}
          className="min-h-12 shrink-0 rounded-2xl bg-card/70 px-3 text-base font-semibold outline-none ring-ring focus:ring-2 disabled:opacity-60"
        >
          {(countries.data ?? [country]).map((c) => (
            <option key={c.iso_code} value={c.iso_code}>
              {c.flag} {c.calling_code}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          required={required}
          autoComplete="tel-national"
          placeholder="541 678 551"
          value={value.national}
          onChange={(e) => onChange({ ...value, national: digitsOnly(e.target.value).slice(0, 15) })}
          disabled={disabled}
          className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2 disabled:opacity-60"
        />
      </div>
      <p
        className={`mt-1.5 text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}
        dir={dir}
      >
        {invalid
          ? (errorMessage ?? "Enter a valid number for the selected country.")
          : (hint ?? (e164 ? `Saved as ${e164}` : "We only use this to confirm your appointment."))}
      </p>
    </div>
  );
}

/** Small click-to-call button used across staff / owner / admin appointment lists. */
export function CallButton({
  phone,
  name,
  className = "",
}: {
  phone?: string | null;
  name?: string | null;
  className?: string;
}) {
  const href = telHref(phone);
  if (!href) return null;
  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={name ? `Call ${name}` : "Call client"}
      className={`press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-bold text-primary-foreground ${className}`}
    >
      <Phone className="size-3.5" /> Call
    </a>
  );
}
