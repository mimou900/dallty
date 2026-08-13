# Reference Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded country array (`src/lib/countries.ts`) and hardcoded category list (`src/lib/business-schema.ts`'s `SALON_CATEGORIES`) with Super-Admin-managed database tables — Countries, Currencies, Categories, Wilayas, Communes — so this reference data can change without a code deploy.

**Architecture:** Five new Postgres tables under the codebase's existing RLS/grant convention (public read, Super-Admin-only write). A new `ReferenceDataProvider` React context, mounted once at the app root, fetches Countries/Currencies/Categories on load and exposes both React Query hooks (for components) and a synchronous in-memory cache (for the handful of existing utility functions — `formatPhoneDisplay`, `telHref` — that are called outside of React's render cycle and can't await a fetch). Existing consumers (`PhoneField`, `business/signup.tsx`'s category picker) are rewired to the new source; nothing downstream of `PhoneField` needs to change since the component's public interface (`PhoneFieldValue`) is unchanged.

**Tech Stack:** TanStack Start / React 19 / TanStack Query, Supabase Postgres. **This codebase has no test framework** (no vitest/jest, confirmed via `package.json` — zero test dependencies, zero `*.test.*` files). This plan adapts the skill's TDD step structure to the project's actual, established verification convention: `npx tsc --noEmit` for type safety, `npx eslint .` for lint, direct SQL verification via `npx supabase db query "..." --db-url "..."`, and live browser verification via the preview tools (screenshot, `read_page`, network requests). Every task's "verify" step uses these instead of a test runner.

**Spec:** `docs/superpowers/specs/2026-08-13-reference-data-foundation-design.md`

## Global Constraints

- Follow the codebase's exact migration convention: numbered timestamped file in `supabase/migrations/`, explicit `GRANT`s, `ENABLE ROW LEVEL SECURITY`, one policy per operation, writes gated by `is_super_admin(auth.uid())` (existing `SECURITY DEFINER STABLE` helper — do not redefine it).
- Field names in TypeScript match Postgres snake_case exactly (e.g. `currency_code`, `display_order`) — this codebase does not camelCase Supabase response fields anywhere (confirmed: `full_name`, `owner_id`, `created_at` throughout `src/lib/admin.ts` and `src/lib/account.functions.ts`).
- No new UUID convention needed — every existing table already uses `gen_random_uuid()` PKs; new tables follow suit.
- Do not remove `formatMoney`/`formatInTimezone`/`digitsOnly`/`toE164`/`isValidE164`/`isValidNational`/`nationalPhoneError`/`telHref`/`splitE164` from `src/lib/countries.ts`/`src/lib/phone.ts` — only the hardcoded-array-backed functions (`COUNTRIES`, `DEFAULT_COUNTRY`, `countryByCode`, `countryByName`, `detectCountryCode`) are replaced.
- Algeria's wilaya count is **69**, not the commonly-cited 58 — confirmed via web search: a reorganization under Law n° 26-06 (April 2026) split 11 new wilayas out of existing ones. The commune count (1,541) is unaffected. Do not seed the older 58-wilaya structure.
- Reference-data seed content (countries, wilaya/commune) is sourced from verified, checkable external datasets via a real transformation script — not hand-typed from memory. Two sources are used and their exact file paths/schemas are already confirmed in Tasks 2 and 3 below.

---

### Task 1: Schema migration — 5 reference-data tables + RLS

**Files:**
- Create: `supabase/migrations/20260813010000_reference_data_schema.sql`

**Interfaces:**
- Produces: tables `public.currencies(code, name, symbol, decimal_digits, active, created_at, updated_at)`, `public.countries(id, iso_code, name, name_fr, name_ar, currency_code, calling_code, timezone, flag, display_order, active, created_at, updated_at)`, `public.categories(id, name, name_fr, name_ar, icon, image_url, description, display_order, active, created_at, updated_at)`, `public.wilayas(id, code, name, name_ar, active)`, `public.communes(id, wilaya_id, name, name_ar, postal_code, active)`.

- [ ] **Step 1: Write the migration**

```sql
-- Reference Data Foundation: Currencies, Countries, Categories, and
-- Algeria's administrative divisions (Wilaya -> Commune), all
-- Super-Admin-managed instead of hardcoded in the frontend.

CREATE TABLE public.currencies (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  symbol          text NOT NULL,
  decimal_digits  smallint NOT NULL DEFAULT 2,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.countries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_code       text NOT NULL UNIQUE,
  name           text NOT NULL,
  name_fr        text NOT NULL,
  name_ar        text NOT NULL,
  currency_code  text NOT NULL REFERENCES public.currencies(code),
  calling_code   text NOT NULL,
  timezone       text NOT NULL,
  flag           text NOT NULL,
  display_order  int NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  name_fr        text NOT NULL,
  name_ar        text NOT NULL,
  icon           text NOT NULL,
  image_url      text,
  description    text,
  display_order  int NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wilayas (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code    text NOT NULL UNIQUE,
  name    text NOT NULL,
  name_ar text NOT NULL,
  active  boolean NOT NULL DEFAULT true
);

CREATE TABLE public.communes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wilaya_id    uuid NOT NULL REFERENCES public.wilayas(id),
  name         text NOT NULL,
  name_ar      text NOT NULL,
  postal_code  text,
  active       boolean NOT NULL DEFAULT true
);
CREATE INDEX communes_wilaya_id_idx ON public.communes(wilaya_id);

-- Grants: public reference data, readable by anyone (signed in or not).
GRANT SELECT ON public.currencies, public.countries, public.categories, public.wilayas, public.communes TO anon, authenticated;
GRANT ALL ON public.currencies, public.countries, public.categories, public.wilayas, public.communes TO service_role;

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wilayas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "currencies_select" ON public.currencies FOR SELECT USING (true);
CREATE POLICY "currencies_write" ON public.currencies FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "countries_select" ON public.countries FOR SELECT USING (true);
CREATE POLICY "countries_write" ON public.countries FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "categories_select" ON public.categories FOR SELECT USING (true);
CREATE POLICY "categories_write" ON public.categories FOR ALL
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "wilayas_select" ON public.wilayas FOR SELECT USING (true);
CREATE POLICY "communes_select" ON public.communes FOR SELECT USING (true);
-- No write policy for wilayas/communes beyond service_role: seeded once, not edited via the app.
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db query -f supabase/migrations/20260813010000_reference_data_schema.sql --db-url "$DB_URL"`
Expected: `CREATE TABLE` x5, `GRANT`, `ALTER TABLE` x5, `CREATE POLICY` x7 with no errors.

- [ ] **Step 3: Verify the tables exist and are empty**

Run: `npx supabase db query "select table_name from information_schema.tables where table_schema='public' and table_name in ('currencies','countries','categories','wilayas','communes') order by table_name;" --db-url "$DB_URL"`
Expected: all 5 table names returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260813010000_reference_data_schema.sql
git commit -m "feat: add reference-data schema (currencies, countries, categories, wilayas, communes)"
```

---

### Task 2: Generate and apply the Countries + Currencies seed

Sourced from `mledoze/countries` (verified: 250 records at `https://raw.githubusercontent.com/mledoze/countries/master/dist/countries-unescaped.json`, fields `cca2`, `name.common`, `translations.fra.common`, `translations.ara.common`, `currencies` (object keyed by ISO 4217 code, each with `name`/`symbol`), `callingCodes`, `flag`) crossed with `manuelmhtr/countries-and-timezones` (verified: `https://raw.githubusercontent.com/manuelmhtr/countries-and-timezones/master/src/data.json`, `timezones` object mapping IANA name → `{ c: [country codes] }`, used in reverse to find each country's primary timezone).

**Files:**
- Create: `scripts/generate-country-seed.mjs`
- Create: `supabase/migrations/20260813010100_seed_currencies_countries.sql` (generated output, committed alongside the script)

**Interfaces:**
- Consumes: `public.currencies`, `public.countries` schema from Task 1.
- Produces: seeded rows in both tables; `DZ` has `display_order = 0` (sorts first, preserving today's default-selection behavior).

- [ ] **Step 1: Write the generation script**

```js
// scripts/generate-country-seed.mjs
// Fetches verified country + timezone datasets and emits a SQL seed file.
// Run with: node scripts/generate-country-seed.mjs

import { writeFileSync } from "node:fs";

const COUNTRIES_URL = "https://raw.githubusercontent.com/mledoze/countries/master/dist/countries-unescaped.json";
const TZ_URL = "https://raw.githubusercontent.com/manuelmhtr/countries-and-timezones/master/src/data.json";

function sqlQuote(value) {
  if (value == null) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const [countries, tzData] = await Promise.all([
    fetch(COUNTRIES_URL).then((r) => r.json()),
    fetch(TZ_URL).then((r) => r.json()),
  ]);

  // Invert the timezone map: country code -> primary IANA timezone.
  // Prefer a timezone whose country list is exactly [code] (unambiguous);
  // fall back to the first match otherwise.
  const primaryTz = new Map();
  for (const [tzName, info] of Object.entries(tzData.timezones)) {
    for (const code of info.c ?? []) {
      const exclusive = info.c.length === 1;
      if (!primaryTz.has(code) || exclusive) primaryTz.set(code, tzName);
    }
  }

  const currencyRows = new Map(); // code -> {name, symbol}
  const countryRows = [];

  for (const c of countries) {
    if (!c.cca2 || !c.currencies || !c.callingCodes?.length) continue;
    const currencyCode = Object.keys(c.currencies)[0];
    const currencyInfo = c.currencies[currencyCode];
    if (!currencyRows.has(currencyCode)) {
      currencyRows.set(currencyCode, {
        name: currencyInfo.name,
        symbol: currencyInfo.symbol ?? currencyCode,
      });
    }
    const timezone = primaryTz.get(c.cca2);
    if (!timezone) continue; // skip the handful of territories with no timezone match
    countryRows.push({
      isoCode: c.cca2,
      name: c.name.common,
      nameFr: c.translations?.fra?.common ?? c.name.common,
      nameAr: c.translations?.ara?.common ?? c.name.common,
      currencyCode,
      callingCode: `+${c.callingCodes[0]}`,
      timezone,
      flag: c.flag,
      displayOrder: c.cca2 === "DZ" ? 0 : 100,
    });
  }

  countryRows.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  const lines = [];
  lines.push("-- Generated by scripts/generate-country-seed.mjs -- do not hand-edit.");
  lines.push("");
  lines.push("INSERT INTO public.currencies (code, name, symbol) VALUES");
  lines.push(
    [...currencyRows.entries()]
      .map(([code, v]) => `  (${sqlQuote(code)}, ${sqlQuote(v.name)}, ${sqlQuote(v.symbol)})`)
      .join(",\n") + ";",
  );
  lines.push("");
  lines.push("INSERT INTO public.countries (iso_code, name, name_fr, name_ar, currency_code, calling_code, timezone, flag, display_order) VALUES");
  lines.push(
    countryRows
      .map(
        (c) =>
          `  (${sqlQuote(c.isoCode)}, ${sqlQuote(c.name)}, ${sqlQuote(c.nameFr)}, ${sqlQuote(c.nameAr)}, ${sqlQuote(c.currencyCode)}, ${sqlQuote(c.callingCode)}, ${sqlQuote(c.timezone)}, ${sqlQuote(c.flag)}, ${c.displayOrder})`,
      )
      .join(",\n") + ";",
  );

  writeFileSync("supabase/migrations/20260813010100_seed_currencies_countries.sql", lines.join("\n") + "\n");
  console.log(`Wrote ${currencyRows.size} currencies and ${countryRows.length} countries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script and inspect the output**

Run: `node scripts/generate-country-seed.mjs`
Expected: prints a currency count and a country count (roughly 150-160 countries survive the currency+calling-code+timezone filter out of 250 raw records — territories without their own currency or calling code are correctly skipped, not a bug).

- [ ] **Step 3: Apply the generated seed**

Run: `npx supabase db query -f supabase/migrations/20260813010100_seed_currencies_countries.sql --db-url "$DB_URL"`
Expected: two `INSERT 0 N` results, no foreign-key errors (every country's `currency_code` must exist in `currencies` — the script guarantees this by inserting currencies first from the same source data).

- [ ] **Step 4: Verify Algeria is present and sorts first**

Run: `npx supabase db query "select iso_code, name, currency_code, calling_code, timezone, display_order from public.countries order by display_order limit 3;" --db-url "$DB_URL"`
Expected: first row is `DZ`, `Algeria`, `DZD`, `+213`, `Africa/Algiers`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-country-seed.mjs supabase/migrations/20260813010100_seed_currencies_countries.sql
git commit -m "feat: seed currencies and countries from verified datasets"
```

---

### Task 3: Generate and apply the Algeria Wilaya + Commune seed

Sourced from `ihahachi/Algeria-Cities` (verified: `https://raw.githubusercontent.com/ihahachi/Algeria-Cities/main/json/algeria_cities.json`, 1,541 records confirmed by direct download and count, fields `commune_name`/`commune_name_fr`, `wilaya_code`/`wilaya_name`/`wilaya_name_fr`, `code_commune` — confirmed 69 unique `wilaya_code` values, range 1-69, zero missing fields across all 1,541 rows).

**Files:**
- Create: `scripts/generate-algeria-seed.mjs`
- Create: `supabase/migrations/20260813010200_seed_wilayas_communes.sql` (generated output)

**Interfaces:**
- Consumes: `public.wilayas`, `public.communes` schema from Task 1.
- Produces: 69 wilaya rows, 1,541 commune rows, each commune's `wilaya_id` resolved via the wilaya's `code`.

- [ ] **Step 1: Write the generation script**

```js
// scripts/generate-algeria-seed.mjs
// Fetches the verified Algeria administrative-division dataset and emits
// a SQL seed file. Run with: node scripts/generate-algeria-seed.mjs

import { writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const SOURCE_URL = "https://raw.githubusercontent.com/ihahachi/Algeria-Cities/main/json/algeria_cities.json";

function sqlQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const rows = await fetch(SOURCE_URL).then((r) => r.json());
  if (rows.length !== 1541) {
    console.warn(`Warning: expected 1541 communes, source returned ${rows.length}. Continuing anyway.`);
  }

  const wilayas = new Map(); // wilaya_code -> {id, name_fr, name_ar}
  for (const r of rows) {
    const code = String(r.wilaya_code).padStart(2, "0");
    if (!wilayas.has(code)) {
      wilayas.set(code, { id: randomUUID(), nameFr: r.wilaya_name_fr, nameAr: r.wilaya_name });
    }
  }
  if (wilayas.size !== 69) {
    console.warn(`Warning: expected 69 wilayas, source returned ${wilayas.size}. Continuing anyway.`);
  }

  const lines = [];
  lines.push("-- Generated by scripts/generate-algeria-seed.mjs -- do not hand-edit.");
  lines.push("");
  lines.push("INSERT INTO public.wilayas (id, code, name, name_ar) VALUES");
  lines.push(
    [...wilayas.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, w]) => `  (${sqlQuote(w.id)}, ${sqlQuote(code)}, ${sqlQuote(w.nameFr)}, ${sqlQuote(w.nameAr)})`)
      .join(",\n") + ";",
  );
  lines.push("");
  lines.push("INSERT INTO public.communes (wilaya_id, name, name_ar, postal_code) VALUES");
  lines.push(
    rows
      .map((r) => {
        const code = String(r.wilaya_code).padStart(2, "0");
        const wilayaId = wilayas.get(code).id;
        const postal = r.code_commune != null ? sqlQuote(String(r.code_commune)) : "NULL";
        return `  (${sqlQuote(wilayaId)}, ${sqlQuote(r.commune_name_fr)}, ${sqlQuote(r.commune_name)}, ${postal})`;
      })
      .join(",\n") + ";",
  );

  writeFileSync("supabase/migrations/20260813010200_seed_wilayas_communes.sql", lines.join("\n") + "\n");
  console.log(`Wrote ${wilayas.size} wilayas and ${rows.length} communes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

Run: `node scripts/generate-algeria-seed.mjs`
Expected: `Wrote 69 wilayas and 1541 communes.` with no warnings printed.

- [ ] **Step 3: Apply the generated seed**

Run: `npx supabase db query -f supabase/migrations/20260813010200_seed_wilayas_communes.sql --db-url "$DB_URL"`
Expected: `INSERT 0 69` then `INSERT 0 1541`.

- [ ] **Step 4: Verify counts and a spot check**

Run: `npx supabase db query "select (select count(*) from public.wilayas) as wilayas, (select count(*) from public.communes) as communes;" --db-url "$DB_URL"`
Expected: `{wilayas: 69, communes: 1541}`.

Run: `npx supabase db query "select w.name, count(c.id) from public.wilayas w join public.communes c on c.wilaya_id = w.id where w.code = '16' group by w.name;" --db-url "$DB_URL"`
Expected: wilaya code `16` is Algiers (`Alger`); confirm the name and a plausible non-zero commune count.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-algeria-seed.mjs supabase/migrations/20260813010200_seed_wilayas_communes.sql
git commit -m "feat: seed Algeria's 69 wilayas and 1541 communes"
```

---

### Task 4: Reference-data provider + hooks

**Files:**
- Create: `src/lib/reference-data.tsx`
- Modify: `src/routes/__root.tsx` (mount the provider)

**Interfaces:**
- Consumes: `supabase` client from `@/integrations/supabase/client`.
- Produces (consumed by Tasks 5-7):
  - `type Country = { id: string; iso_code: string; name: string; name_fr: string; name_ar: string; currency_code: string; calling_code: string; timezone: string; flag: string; display_order: number; active: boolean }`
  - `type Currency = { code: string; name: string; symbol: string; decimal_digits: number; active: boolean }`
  - `type Category = { id: string; name: string; name_fr: string; name_ar: string; icon: string; image_url: string | null; description: string | null; display_order: number; active: boolean }`
  - `type Wilaya = { id: string; code: string; name: string; name_ar: string; active: boolean }`
  - `type Commune = { id: string; wilaya_id: string; name: string; name_ar: string; postal_code: string | null; active: boolean }`
  - `useCountries(): UseQueryResult<Country[]>`
  - `useCurrencies(): UseQueryResult<Currency[]>`
  - `useCategories(): UseQueryResult<Category[]>`
  - `useWilayas(): UseQueryResult<Wilaya[]>`
  - `useCommunes(wilayaId: string | null): UseQueryResult<Commune[]>`
  - `getCountryByCode(isoCode: string): Country | undefined` — synchronous, reads the in-memory cache
  - `getDefaultCountry(): Country | { iso_code: "DZ"; calling_code: "+213"; flag: "🇩🇿"; ...minimal fallback }` — synchronous; returns the real Algeria row once loaded, a hardcoded minimal fallback before the first fetch resolves
  - `getCountriesSync(): Country[]` — synchronous, returns the full in-memory cache (empty array before the first fetch resolves); needed by `splitE164` in Task 5, which must search the whole list by calling-code prefix, not look up one known code
  - `ReferenceDataProvider: React.FC<{ children: React.ReactNode }>`

- [ ] **Step 1: Write the provider + hooks**

```tsx
// src/lib/reference-data.tsx
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Country = {
  id: string;
  iso_code: string;
  name: string;
  name_fr: string;
  name_ar: string;
  currency_code: string;
  calling_code: string;
  timezone: string;
  flag: string;
  display_order: number;
  active: boolean;
};

export type Currency = { code: string; name: string; symbol: string; decimal_digits: number; active: boolean };

export type Category = {
  id: string;
  name: string;
  name_fr: string;
  name_ar: string;
  icon: string;
  image_url: string | null;
  description: string | null;
  display_order: number;
  active: boolean;
};

export type Wilaya = { id: string; code: string; name: string; name_ar: string; active: boolean };

export type Commune = {
  id: string;
  wilaya_id: string;
  name: string;
  name_ar: string;
  postal_code: string | null;
  active: boolean;
};

/** Minimal fallback used only before the first Countries fetch resolves. */
const FALLBACK_COUNTRY: Country = {
  id: "",
  iso_code: "DZ",
  name: "Algeria",
  name_fr: "Algérie",
  name_ar: "الجزائر",
  currency_code: "DZD",
  calling_code: "+213",
  timezone: "Africa/Algiers",
  flag: "🇩🇿",
  display_order: 0,
  active: true,
};

// Synchronous cache for non-component call sites (formatPhoneDisplay, telHref).
// Populated by ReferenceDataProvider after the Countries query succeeds.
let countryCache: Country[] = [];

export function getCountryByCode(isoCode: string): Country | undefined {
  return countryCache.find((c) => c.iso_code === isoCode.toUpperCase());
}

export function getDefaultCountry(): Country {
  return getCountryByCode("DZ") ?? FALLBACK_COUNTRY;
}

export function getCountriesSync(): Country[] {
  return countryCache;
}

export function useCountries(): UseQueryResult<Country[]> {
  return useQuery({
    queryKey: ["reference-data", "countries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("countries")
        .select("*")
        .eq("active", true)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data as Country[];
    },
    staleTime: Infinity,
  });
}

export function useCurrencies(): UseQueryResult<Currency[]> {
  return useQuery({
    queryKey: ["reference-data", "currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("currencies").select("*").eq("active", true).order("code");
      if (error) throw error;
      return data as Currency[];
    },
    staleTime: Infinity,
  });
}

export function useCategories(): UseQueryResult<Category[]> {
  return useQuery({
    queryKey: ["reference-data", "categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("active", true)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
    staleTime: Infinity,
  });
}

export function useWilayas(): UseQueryResult<Wilaya[]> {
  return useQuery({
    queryKey: ["reference-data", "wilayas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wilayas").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data as Wilaya[];
    },
    staleTime: Infinity,
  });
}

export function useCommunes(wilayaId: string | null): UseQueryResult<Commune[]> {
  return useQuery({
    queryKey: ["reference-data", "communes", wilayaId],
    enabled: Boolean(wilayaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communes")
        .select("*")
        .eq("wilaya_id", wilayaId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as Commune[];
    },
    staleTime: Infinity,
  });
}

const ReferenceDataContext = createContext<null>(null);

/** Mounted once at the app root. Keeps the synchronous country cache warm. */
export function ReferenceDataProvider({ children }: { children: ReactNode }) {
  const countries = useCountries();

  useEffect(() => {
    if (countries.data) countryCache = countries.data;
  }, [countries.data]);

  return <ReferenceDataContext.Provider value={null}>{children}</ReferenceDataContext.Provider>;
}

export function useReferenceDataContext() {
  return useContext(ReferenceDataContext);
}
```

- [ ] **Step 2: Mount the provider in `__root.tsx`**

Find where `AuthProvider` wraps the app (confirmed in an earlier phase: `src/routes/__root.tsx` around the root component). Add `ReferenceDataProvider` as a sibling wrapper, outside `AuthProvider` (reference data doesn't depend on auth state — it's public):

```tsx
import { ReferenceDataProvider } from "@/lib/reference-data";
// ...
<ReferenceDataProvider>
  <AuthProvider>{/* existing app tree */}</AuthProvider>
</ReferenceDataProvider>
```

- [ ] **Step 3: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Start the dev server, open `/`, confirm no console errors, and confirm a network request to the `countries` table fires (via `read_network_requests` or the Network tab) and returns rows.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reference-data.tsx src/routes/__root.tsx
git commit -m "feat: add ReferenceDataProvider with countries/currencies/categories/wilayas/communes hooks"
```

---

### Task 5: Migrate `PhoneField` and `phone.ts`/`countries.ts` off the hardcoded array

**Files:**
- Modify: `src/lib/countries.ts` (remove `COUNTRIES`, `DEFAULT_COUNTRY`, `countryByCode`, `countryByName`, `detectCountryCode`; keep `formatMoney`, `formatInTimezone`)
- Modify: `src/lib/phone.ts` (update imports; `isValidNational`/`toE164`/`isValidE164` already take `dial: string` as a parameter and need no logic change, only their import of `DEFAULT_COUNTRY`/`countryByCode` in `splitE164`/`formatPhoneDisplay` needs to switch to `getCountryByCode`/`getDefaultCountry`)
- Modify: `src/components/dallty/phone-field.tsx` (switch from importing `COUNTRIES`/`countryByCode` to `useCountries()`/`getCountryByCode`)

**Interfaces:**
- Consumes: `useCountries`, `getCountryByCode`, `getDefaultCountry` from Task 4's `src/lib/reference-data.tsx`.
- Produces: `PhoneField`'s public props (`PhoneFieldValue`, `value`/`onChange`/`label`/`required`/`id`/`hint`/`dir`/`disabled`) are unchanged — every existing consumer (`auth.tsx`, `business/signup.tsx`, `salon.$salonId.tsx`, `profile.tsx`) needs no changes.

- [ ] **Step 1: Trim `countries.ts`**

Remove the `COUNTRIES` array, `DEFAULT_COUNTRY` constant, `countryByCode`, `countryByName`, and `detectCountryCode` functions. Keep `Country` type (re-export it from `reference-data.tsx` instead, or keep a local alias), `formatMoney`, and `formatInTimezone` exactly as they are today — both already take `currency`/`timezone` as explicit parameters, not from the array.

- [ ] **Step 2: Update `phone.ts`**

Replace the top import:

```ts
// Before:
import { COUNTRIES, DEFAULT_COUNTRY, countryByCode, detectCountryCode } from "@/lib/countries";
// After:
import { getCountriesSync, getCountryByCode, getDefaultCountry } from "@/lib/reference-data";
```

Replace `splitE164` (it still returns the same `{ countryCode, national }` shape — only the data source changes, from the hardcoded array to the synchronous cache):

```ts
export function splitE164(value?: string | null): { countryCode: string; national: string } {
  const raw = (value ?? "").trim();
  if (raw.startsWith("+")) {
    const match = [...getCountriesSync()]
      .sort((a, b) => b.calling_code.length - a.calling_code.length)
      .find((c) => raw.startsWith(c.calling_code));
    if (match) return { countryCode: match.iso_code, national: raw.slice(match.calling_code.length) };
  }
  return { countryCode: getDefaultCountry().iso_code, national: digitsOnly(raw) };
}
```

Replace `guessCountryCode` (timezone-based auto-detection is dropped — it required the full hardcoded array; the DB-backed default of Algeria matches the spec's own "default Algeria" requirement, and per-visitor timezone detection can be reintroduced later against the DB-backed list if wanted — not part of this plan's scope):

```ts
export function guessCountryCode(hint?: string | null): string {
  if (hint) return getCountryByCode(hint)?.iso_code ?? getDefaultCountry().iso_code;
  return getDefaultCountry().iso_code;
}
```

- [ ] **Step 3: Update `PhoneField`**

```tsx
// src/components/dallty/phone-field.tsx
import { useMemo } from "react";
import { Phone } from "lucide-react";

import { useCountries, getCountryByCode, getDefaultCountry } from "@/lib/reference-data";
import { digitsOnly, isValidNational, nationalPhoneError, toE164 } from "@/lib/phone";
import { telHref } from "@/lib/phone";

export type PhoneFieldValue = { countryCode: string; national: string };

export function PhoneField({ value, onChange, label = "Phone number", required, id = "phone", hint, dir, disabled }: {
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
  const e164 = useMemo(() => toE164(country.calling_code, value.national), [country.calling_code, value.national]);
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
      <p className={`mt-1.5 text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`} dir={dir}>
        {invalid
          ? (errorMessage ?? "Enter a valid number for the selected country.")
          : (hint ?? (e164 ? `Saved as ${e164}` : "We only use this to confirm your appointment."))}
      </p>
    </div>
  );
}

export function CallButton({ phone, name, className = "" }: { phone?: string | null; name?: string | null; className?: string }) {
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
```

- [ ] **Step 4: Fix `auth.tsx`, `business/signup.tsx`, and every other importer of the removed `countries.ts` exports**

Run: `grep -rn "DEFAULT_COUNTRY\|countryByCode\|detectCountryCode\|COUNTRIES" src/ --include="*.tsx" --include="*.ts"` and update each hit. This is not just an import-path swap — the old `Country` type's field names (`dial`, `code`) are renamed on the new one (`calling_code`, `iso_code`), so every call site's field access changes too. Confirmed example, `src/routes/auth.tsx`:

```ts
// Before:
import { countryByCode } from "@/lib/countries";
// ...
const contactDial = countryByCode(contactPhone.countryCode).dial;

// After:
import { getCountryByCode, getDefaultCountry } from "@/lib/reference-data";
// ...
const contactDial = (getCountryByCode(contactPhone.countryCode) ?? getDefaultCountry()).calling_code;
```

Apply the same `dial`→`calling_code`, `.code`→`.iso_code` rename at every other hit. (Confirmed call sites as of this plan: `src/routes/auth.tsx`, `src/routes/business/signup.tsx`, `src/routes/salon.$salonId.tsx`, `src/routes/_authenticated/profile.tsx`, `src/lib/phone.ts` — re-check with the grep above since the exact set may have grown since this plan was written.)

- [ ] **Step 5: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors, and specifically no "Cannot find name 'COUNTRIES'" / "has no exported member" errors.

- [ ] **Step 6: Verify in the browser**

Open `/auth?mode=signup`, confirm the phone country picker still defaults to 🇩🇿 +213, still shows every country (now from the DB — confirm a country not in the old 22-item array, e.g. a less common one, now appears), and Algeria phone validation still works exactly as before (`0555123456` → `+213555123456`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/countries.ts src/lib/phone.ts src/components/dallty/phone-field.tsx src/routes/
git commit -m "refactor: migrate PhoneField and phone.ts off the hardcoded country array"
```

---

### Task 6: Migrate Categories off `SALON_CATEGORIES`

**Files:**
- Modify: `src/lib/business-schema.ts` (remove `SALON_CATEGORIES` array)
- Modify: `src/routes/business/signup.tsx` (category picker section)

**Interfaces:**
- Consumes: `useCategories` from Task 4.
- Produces: the category-picker step in the business signup wizard now renders icons and is DB-driven; `categories` state (`string[]` of selected category names) is unchanged, so `registerBusiness`/`business.functions.ts` need no changes — categories are still stored on `salons` as an array of names, this task only changes where the *available* options come from.

- [ ] **Step 1: Remove `SALON_CATEGORIES` from `business-schema.ts`**

Delete the `SALON_CATEGORIES` constant. Leave `businessDetailsSchema`'s `categories: z.array(z.string()...)` field validation as-is — it validates against whatever strings are selected, independent of where the option list comes from.

- [ ] **Step 2: Update the category picker in `business/signup.tsx`**

Replace the import `import { SALON_CATEGORIES, ... } from "@/lib/business-schema"` with `import { useCategories } from "@/lib/reference-data"`. In the component, add `const categoryOptions = useCategories();` and change the render loop from mapping over the removed `SALON_CATEGORIES` string array to mapping over `categoryOptions.data ?? []`, using `category.name` as the toggled value exactly as the old string array did. Confirmed via grep: `admin.ts`'s `SERVICE_CATEGORIES` (service *types* like "hair"/"barber", a different concept from business categories) has no icon mapping to reuse — render each category's icon with a small local lookup instead:

```tsx
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

function CategoryIcon({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Sparkles;
  return <Icon className="size-4" />;
}
```

- [ ] **Step 3: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Open `/business/signup`, reach the salon-details step, confirm categories render with icons and toggle correctly, complete a throwaway signup through to salon creation, and confirm the selected category names land correctly on the created salon (query `select categories from salons where id = '<new id>'`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/business-schema.ts src/routes/business/signup.tsx
git commit -m "refactor: migrate business category picker off hardcoded SALON_CATEGORIES"
```

---

### Task 7: Super Admin CRUD — Categories, Countries, Currencies

**Files:**
- Create: `src/lib/reference-data.functions.ts` (server functions: `listCategoriesAdmin`, `upsertCategory`, `deleteCategory`, `listCountriesAdmin`, `upsertCountry`, `listCurrenciesAdmin`, `upsertCurrency`)
- Create: `src/routes/_authenticated/admin/platform/categories.tsx`
- Create: `src/routes/_authenticated/admin/platform/countries.tsx`

**Interfaces:**
- Consumes: `requireSupabaseAuth` middleware and `assertSuperAdmin`/`logAdminAction` from the existing `src/lib/platform.server.ts` (same pattern as `setUserSuspended` etc.).
- Produces: two new Super-Admin-only routes reachable from the existing platform-admin nav.

- [ ] **Step 1: Write the server functions**

```ts
// src/lib/reference-data.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const categoryInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  name_fr: z.string().trim().min(1).max(80),
  name_ar: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(60),
  image_url: z.string().trim().max(4000).optional(),
  description: z.string().trim().max(1000).optional(),
  display_order: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const listCategoriesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("categories").select("*").order("display_order");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("categories").upsert(data as never);
    if (error) throw new Error(error.message);
    await logAdminAction(supabaseAdmin, context.userId, "category.upsert", "category", data.id ?? null, data);
    return { ok: true };
  });

const countryInput = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  display_order: z.number().int(),
});

export const listCountriesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("countries").select("*").order("display_order");
    if (error) throw new Error(error.message);
    return data;
  });

export const upsertCountry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => countryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("countries")
      .update({ active: data.active, display_order: data.display_order } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(supabaseAdmin, context.userId, "country.update", "country", data.id, data);
    return { ok: true };
  });

export const listCurrenciesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.from("currencies").select("*").order("code");
    if (error) throw new Error(error.message);
    return data;
  });
```

Confirmed via direct read of `src/lib/platform.server.ts`: `assertSuperAdmin(supabase: AnySupabase, userId: string)` (line 8) and `logAdminAction(supabase, actorId, action, targetType, targetId?, details?)` (line 19) — the calls above use this exact signature and parameter order.

- [ ] **Step 2: Write the Categories admin page**

```tsx
// src/routes/_authenticated/admin/platform/categories.tsx
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listCategoriesAdmin, upsertCategory } from "@/lib/reference-data.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/categories")({
  component: CategoriesAdminPage,
});

function CategoriesAdminPage() {
  const list = useServerFn(listCategoriesAdmin);
  const upsert = useServerFn(upsertCategory);
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => list({ data: undefined }),
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      const row = categories.data?.find((c) => c.id === id);
      if (!row) return;
      await upsert({ data: { ...row, active } });
      await queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast.success(active ? "Category activated" : "Category deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update category");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-extrabold">Categories</h1>
      <div className="mt-4 space-y-2">
        {(categories.data ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-2xl glass-soft p-4">
            <div>
              <p className="font-bold">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.name_fr} / {c.name_ar}</p>
            </div>
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => toggleActive(c.id, !c.active)}
              className="press rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              {c.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the Countries admin page (with inline currencies section)**

Same shape as Step 2's Categories page, but querying `listCountriesAdmin`/`listCurrenciesAdmin` and calling `upsertCountry` on toggle — write this file (`src/routes/_authenticated/admin/platform/countries.tsx`) following the exact same list/toggle pattern as Step 2, with a second read-only section below listing currencies (name, symbol, code) since currencies aren't independently edited in this pass.

- [ ] **Step 4: Verify with typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

Sign in as the `super_admin` test account, navigate to `/admin/platform/categories` and `/admin/platform/countries`, toggle a category's active state, confirm the change persists on reload and an `admin_audit_log` row was written (`select * from admin_audit_log where action = 'category.upsert' order by created_at desc limit 1`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/reference-data.functions.ts src/routes/_authenticated/admin/platform/categories.tsx src/routes/_authenticated/admin/platform/countries.tsx
git commit -m "feat: add Super Admin CRUD pages for categories and countries"
```

---

### Task 8: Final verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Confirm no remaining references to removed exports**

Run: `grep -rn "SALON_CATEGORIES\|DEFAULT_COUNTRY\b" src/`
Expected: no matches.

- [ ] **Step 2: Full typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint .`
Expected: both clean.

- [ ] **Step 3: End-to-end browser pass**

- `/auth?mode=signup`: phone picker defaults to Algeria, shows the full DB-backed country list, Algeria validation still works.
- `/business/signup`: category picker shows DB-backed categories with icons; country/currency data used elsewhere on the page (if any) still renders.
- `/admin/platform/categories` and `/admin/platform/countries`: Super Admin can toggle active state; changes reflect on the public pickers without a restart.
- No new console errors on any of the above pages.

- [ ] **Step 4: Commit (if any fixups were needed)**

```bash
git add -A
git commit -m "chore: reference-data foundation verification fixups"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-13-reference-data-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
