# Reference Data Foundation — Design

## Context

This is sub-project #1 of a larger "Platform Foundation" spec covering ~15 independent subsystems (business/salon terminology, localization, image pipeline, notifications, audit logs, global settings, search, feature flags, soft delete, API standards, and more). The full spec was too large for a single design, so it was decomposed into sub-projects; this document covers only the first and lowest-risk one: moving Categories, Countries, Currencies, and Algeria's administrative divisions (Wilaya → Commune) from scattered hardcoded arrays into proper, Super-Admin-managed database tables.

**Why now, first:** almost every other sub-project depends on this data existing — business categories, address forms, the phone-number country picker, and money formatting all need a real Countries/Currencies/Categories source of truth before they can be built or reworked correctly.

**Current state (verified against the live migrations):** none of `categories`, `countries`, `currencies`, `wilayas`, or `communes` exist today. `src/lib/countries.ts` hardcodes 22 countries (name, ISO code, currency, calling code, timezone, flag) used by the phone-number picker (`PhoneField`) and by `formatMoney`/`formatInTimezone`. `src/lib/business-schema.ts`'s `SALON_CATEGORIES` is a plain string array with no icon, description, or ordering. Neither has ever been Super-Admin-editable — changing either today requires a code deploy.

## Decisions made during brainstorming

- **Countries move fully into the database**, replacing the hardcoded array — not a parallel/optional data source.
- **Currency is a standalone `currencies` table**, referenced by `countries.currency_code`, not just a text field — this leaves room for a business or booking to carry its own currency independent of its country later, per the parent spec's "prepare for future multi-currency support."
- **Languages is explicitly out of scope here.** Its fields (Version, Completion %, Status) only make sense alongside the full Translation Manager, which is its own later sub-project. `profiles.locale` already exists as a plain column and is untouched by this work.
- **Wilaya/Commune get bilingual names (French + Arabic) and the full real dataset seeded now, not a placeholder** — matching how the existing `COUNTRIES` array already carries `name`/`nameAr`. **Correction found while writing the implementation plan:** Algeria's wilaya count is not the commonly-known 58 — a reorganization effective April 2026 (Law n° 26-06) split 11 new wilayas out of existing ones, bringing the total to **69**. The commune count (~1,541) is unaffected — communes were reassigned to new wilaya parents, not merged or split. The plan sources this from a dataset that reflects the post-reorganization structure rather than hardcoding the older 58-wilaya list.
- **Category/Country/Wilaya/Commune names are dedicated columns** (`name`, `name_fr`, `name_ar`), not routed through the future JSON-based Translation Manager — they're structured labels, not free UI prose, and the parent spec's own framing reserves the Translation Manager for UI text and explicitly excludes routing structured/user-generated content through it.
- **Category icons are lucide-react icon-name strings**, not uploaded image files — consistent with how every other icon in the codebase is already referenced (`import { X } from "lucide-react"`), and avoids standing up image storage for this pass (image handling is its own later sub-project).

## Schema

New migration file, following the codebase's established convention exactly: numbered timestamped file in `supabase/migrations/`, explicit `GRANT`s (`SELECT` to `anon`+`authenticated` since this is public reference data; writes to `service_role` only, gated by `is_super_admin(auth.uid())` for anything Super-Admin-editable), `ENABLE ROW LEVEL SECURITY`, one policy per operation.

```sql
-- Currencies: small, hand-managed reference table.
CREATE TABLE public.currencies (
  code            text PRIMARY KEY,          -- ISO 4217, e.g. 'DZD'
  name            text NOT NULL,
  symbol          text NOT NULL,
  decimal_digits  smallint NOT NULL DEFAULT 2,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Countries: replaces src/lib/countries.ts's hardcoded array.
CREATE TABLE public.countries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso_code       text NOT NULL UNIQUE,        -- 'DZ', 'AE', ...
  name           text NOT NULL,
  name_fr        text NOT NULL,
  name_ar        text NOT NULL,
  currency_code  text NOT NULL REFERENCES public.currencies(code),
  calling_code   text NOT NULL,               -- '+213'
  timezone       text NOT NULL,               -- 'Africa/Algiers'
  flag           text NOT NULL,               -- emoji, matches existing convention
  display_order  int NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Categories: replaces business-schema.ts's SALON_CATEGORIES string array.
CREATE TABLE public.categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  name_fr        text NOT NULL,
  name_ar        text NOT NULL,
  icon           text NOT NULL,               -- lucide-react icon name
  image_url      text,
  description    text,
  display_order  int NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Algeria administrative divisions. Country-specific by design per the
-- parent spec ("future countries should support their own administrative
-- divisions") -- not a generic cross-country tree.
CREATE TABLE public.wilayas (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code    text NOT NULL UNIQUE,   -- official 2-digit wilaya number, e.g. '16'
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
```

All five tables: `ENABLE ROW LEVEL SECURITY`; `SELECT` open to `anon`+`authenticated` (this is public reference data every visitor needs, signed in or not); `INSERT`/`UPDATE`/`DELETE` restricted to `is_super_admin(auth.uid())` for `currencies`/`countries`/`categories` (the three that get a management UI). `wilayas`/`communes` get the same read policy but no write policy at all beyond `service_role` — they're seeded once, not edited through the app.

## Seeding

One seed migration (or a data-only follow-up file) populating:
- `currencies`: the set implied by the full country list (DZD, AED, SAR, USD, EUR, ...).
- `countries`: every country (not just the current 22), sourced the same way the existing array was originally built, with `display_order` keeping Algeria first to preserve today's default-selection behavior.
- `wilayas`: all 58, official codes and bilingual names.
- `communes`: the full ~1,541, linked to their wilaya, bilingual names, postal codes where available.

## Frontend migration

- New `src/services/reference-data.service.ts` (or hooks directly in `src/lib/`) : `useCountries()`, `useCurrencies()`, `useCategories()`, `useWilayas()`, `useCommunes(wilayaId)` — React Query hooks reading from the new tables, replacing direct imports of the old arrays.
- `src/lib/countries.ts`'s `COUNTRIES`/`DEFAULT_COUNTRY`/`countryByCode` and `business-schema.ts`'s `SALON_CATEGORIES` are removed once every call site is migrated — no parallel hardcoded copy left behind. Call sites to update: `PhoneField`, `business/signup.tsx` (category picker, country/city fields), `formatMoney`/`formatInTimezone` callers, and anywhere else importing from `countries.ts` (confirmed multiple call sites earlier in this project: `salon.$salonId.tsx`, `login.tsx`/`auth.tsx`, `profile.tsx`).
- Existing address fields that today free-type "city" get a Wilaya → Commune cascading select once this data exists, feeding the existing `PlacesAutocomplete`/address flow rather than replacing it outright (that reconciliation is itself worth a short follow-up look once this table exists, not designed in detail here).

## Admin UI

New Super-Admin pages under `src/routes/_authenticated/admin/platform/`, matching the existing shell/guard pattern used by other platform-admin pages: `categories.tsx` (create/edit/reorder/activate) and `countries.tsx` (edit/activate/reorder; the 22 existing entries pre-seeded, editable but not typically re-created). Currencies are folded into the countries page as a simple inline list/edit section rather than a separate route — the table is small (one row per distinct currency in use) and edited rarely enough that a dedicated route would be overhead. Wilayas/communes get no management UI (seeded data only, per the decision above).

## Verification

1. Migration applies cleanly against the live Supabase project; row counts match expectations (58 wilayas, ~1,541 communes, all countries, currencies for each distinct currency code used).
2. Browser: phone-number picker on `/auth` and `/business/signup` still shows every country, defaults to Algeria, and behaves identically to today (same E.164 validation, same Algeria-specific rules from the earlier auth work).
3. Browser: business category picker at `/business/signup` now shows icons and is driven by the DB, not the old string array.
4. Super Admin: create/edit/deactivate a category and a country from the new admin pages; confirm changes reflect immediately on the public-facing pickers without a deploy.
5. Confirm no remaining imports of the deleted `SALON_CATEGORIES` or the old `COUNTRIES` array anywhere in `src/` (`grep -r` sweep).
