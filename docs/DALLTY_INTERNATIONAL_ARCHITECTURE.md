# Dallty — International Architecture

**Status:** Living document. Produced by Project 04 (International Country, Geography,
Currency & Localization Foundation).
**Last updated:** 2026-08-17.

Most of the international architecture already existed before this project (verified, not
assumed — see Project 00's audit and this project's own re-verification) and is genuinely
country-agnostic: `countries`/`currencies` (translations `jsonb`, not fixed columns),
`regions`/`cities` (generic, not `algeria_wilayas`/`algeria_communes`), the i18n runtime
(`LANGUAGES` config with data-driven `dir`). This project extended that foundation with the
specific gaps a real second-country launch would actually hit, and fixed one real
locale-formatting bug — it did not rebuild anything that already worked.

## Country model

`countries` (unchanged structurally): `id`, `iso_code`, `default_name`, `translations jsonb`
(other-language names, e.g. `{"fr": "...", "ar": "..."}` — this already satisfies "native/
localized name" without a separate column), `currency_code` (FK), `calling_code`,
`timezone`, `flag`, `display_order`, `active`, timestamps.

**New this project:** `marketplace_enabled boolean` — the distinction the brief calls for
between "exists in the reference system" and "marketplace is browsable." Algeria is the only
`true` row; every other seeded country (Project 00's audit confirmed ~200 countries already
seeded) stays `active` (usable as a phone-country-code option, a future billing country,
etc.) without appearing in marketplace search. **Verified, not assumed**: the public
business-read RLS policy now also requires the business's country to be marketplace-enabled
— tested live by creating an approved Algeria business and confirming it's still publicly
visible (unaffected), then attempting to change its country as the owner (blocked by a new
guard, detailed below).

**Not built:** ISO alpha-3 codes. No current consumer needs them; adding a nullable column
later is trivial and not worth doing speculatively.

## Currency

Unchanged — `currencies` (`code`, `name`, `symbol`, `decimal_digits`, `active`) was already
standalone reference data, already correctly used via FK from `countries` and `businesses`.

**Money storage — verified already correct, not a gap:** every monetary column in this
schema (`services.price`, `bookings.total_price`, etc.) is Postgres `numeric(10,2)`, an
exact decimal type, never `float`/`double precision`. The brief's warning against
floating-point money storage was already satisfied before this project; nothing needed
fixing. `decimal_digits` per currency exists on `currencies` for future non-2-decimal
currencies but isn't yet consumed by any formatting call site (a genuine, small follow-up
item, not fixed here — see Deferred).

**Fixed this project — a real, verified bug:** `src/lib/countries.ts`'s `formatMoney()`/
`formatInTimezone()` only accepted `locale: "en" | "ar"`, silently formatting French as
English. **Confirmed via grep that zero call sites across the codebase were passing this
parameter at all** — every one of the ~13 call sites relied on the default, which is why
the bug never surfaced despite French being a fully supported language. Fixed by widening
the type to the real `"en" | "fr" | "ar"` (all three map directly to valid Intl/BCP-47
tags, no per-language branching needed) and updating the highest-traffic call site — the
public business booking page (`business.$businessSlug.tsx`) — to actually pass the active
`lang` from `useLocale()`. The remaining ~8 call sites (mostly the business-owner dashboard,
which isn't localized yet per Project 00's i18n audit — English-only UI regardless) are
left on the default and are a documented, low-priority follow-up, not silently ignored.
Also fixed the leftover Gulf-market default currency (`"AED"`, flagged in Project 00's
audit) to `"DZD"` in both `formatMoney()`'s own default and `src/lib/admin.ts`'s `CURRENCY`
constant — matching the same fix already applied to `businesses.currency`'s column default
in Project 01.

## Administrative geography

Unchanged structurally — `regions` (country-scoped) → `cities` (region-scoped), already
generic, already seeded with the real Algeria dataset (69 regions matching the 2019 Law
n°26-06 reorganization, 1,541 communes — confirmed in Project 00's audit, not re-verified
here since nothing about the data itself changed).

**New this project — administrative level labels (`administrative_levels`):** what a
country *calls* its levels varies (Algeria: Wilaya/Commune; a future France launch would
want Région/Département/Commune) — this table gives each country's level 1 and level 2 a
localized label (`default_name` + `translations jsonb`, same pattern as `countries`/
`categories`). Seeded for Algeria: level 1 = "Wilaya"/"ولاية", level 2 = "Commune"/"بلدية".
**Verified live** via direct query after seeding.

**Explicitly not built, and why:** the brief asks for a fully generic N-level hierarchy
(`Level 1 → Level 2 → Level 3 → ...`). The existing `regions`→`cities` model is a fixed
2-level tree, and restructuring it into a true N-level tree would mean migrating the
already-seeded 1,610 rows and every consumer of those two tables — a much larger, riskier
change than this project's scope justified for a capability with zero current demand (no
country requiring a 3rd level has been discussed). `administrative_levels.level_number` is
constrained to `1`/`2` today specifically to make this limitation explicit in the schema
rather than silently implying more flexibility than exists. Extending to N levels is a
clearly flagged future migration, not assumed solved.

## Business country

**New this project — immutability, verified live:** `guard_business_marketplace()` (the
existing trigger that already blocked non-admin edits to `is_verified`/`marketplace_status`/
`plan`/`status`) now also blocks non-admin changes to `country_code`, matching the pattern
rather than adding a second trigger. **Live-tested**: a business owner attempting to change
their own business's `country_code` directly via PostgREST is blocked
("Only the Dallty team can change a business's country"); a normal field update (business
name) on the same row still succeeds, confirming the trigger didn't overreach.

## Account country vs. detected country vs. marketplace country

- **Account country** — `profiles.country_code`, pre-existing (added in an earlier
  project), populated at signup.
- **Detected country** — **new this project**: `profiles.detected_country_code`, nullable,
  genuinely separate column (never overwrites `country_code`). **Foundation only — no IP
  geolocation service is wired up anywhere in this codebase**, before or after this
  project. Populating this column requires a real IP-to-country lookup (a MaxMind database,
  an ipapi-style service, or Cloudflare's own `cf-ipcountry` request header, which is
  actually already available for free given this app's Cloudflare Workers deployment target
  — the cheapest real option when this is built). Explicitly **PLANNED**, not implemented —
  building the lookup itself without an actual product surface to use its result would be
  speculative.
- **Marketplace country** — not a stored field. With exactly one marketplace-enabled
  country, it's definitionally Algeria; there is nothing meaningful to store for a
  guest with no session. The schema readiness for this to matter later is
  `countries.marketplace_enabled` itself (above), not a new profile column.

## Languages

Unchanged — confirmed still the deliberate Stage-1 architecture from the core-i18n-runtime
project: `LANGUAGES` (`src/lib/i18n.tsx`) is a static, git-tracked TypeScript config (`en`/
`fr`/`ar`, each with `dir`, `dateFnsLocale`), not a database table. This project's brief
(§28) explicitly confirms this should remain the case — "do not introduce Supabase Storage
translation loading yet... Translation Manager belongs to the later CMS/localization
project."

**No `languages`/`country_languages` database tables were created**, despite the brief
describing them (§19-21). Reasoning, made explicit rather than silently skipped: with
exactly one marketplace-enabled country (Algeria) and exactly three global languages that
every user already sees regardless of country, a per-country language-availability table
has zero behavioral difference from the status quo today — there is no second country to
diverge from Algeria's language set yet. Building it now would be pure speculation ahead of
a real consumer, contradicting the "only implement structures with an immediate consumer"
principle this whole session has followed. The moment a second marketplace country needs a
*different* language set than Algeria's, this is the natural next schema addition — a
`country_languages` join table (`country_id`, language code, `active`, `is_default`,
`display_order`) — and nothing built in this project blocks adding it.

**RTL, date-fns locale, direction — verified still correctly data-driven, no regression.**
`dirFor()` and `dateFnsLocale` selection continue to come from the `LANGUAGES` table lookup,
never a `lang === "ar"` conditional (confirmed unchanged).

## Business/user-generated content translation

Not built, correctly deferred per the brief's own instruction (§30-31): no machine
translation, no forced multilingual business content. The existing `name`/`name_ar` and
`description`/`description_ar` columns on `businesses` (French not yet modeled — a real
future gap, not addressed here since it wasn't flagged as this project's job) remain the
only business-content translation mechanism, correctly kept separate from the system-UI
i18n namespace files.

## SEO foundation

Not built (out of scope per brief §37/§58 — "does NOT implement the complete international
SEO engine"). What already provides stable identifiers for future SEO pages: `businesses.
slug` (unique, collision-handled, Project 00-verified), `countries.iso_code`, `regions`/
`cities` IDs. No country/region/city slug field was added — none exists as a consumer yet
(no SEO page-generation code reads one). Flagged as the natural next addition when the SEO
project actually starts.

## Country-scoped configuration

Per the brief's own instruction (§18: "do NOT create dozens of unused configuration
tables... only implement structures with an immediate consumer") — no new country-config
tables were created for payment methods, plans, commission, WhatsApp, deposits, taxes, or
similar. None of those subsystems exist yet (confirmed unchanged from Project 00's audit).
`countries.marketplace_enabled` is the one piece of country-scoped configuration this
project actually needed, because it's the one piece something (the public business-read RLS
policy) actually consumes today.

## RLS / security

All new tables (`administrative_levels`) follow the established pattern: public `SELECT`
(reference data), `is_super_admin()`-gated writes. **Verified live** in this project's own
IDOR/BOLA-style testing (reused from Project 03's methodology): no anonymous or ordinary
business-user write path to `countries`, `administrative_levels`, or the country-immutability
guard was found — every write is either Super-Admin-gated or blocked outright by the new
trigger.

## Frontend / phone selector

**Verified, no fix needed — single source of truth already.** `src/lib/countries.ts` (the
file this project touched) is a money/time *formatting* utility, not a country *list* — it
was already correctly free of any hardcoded country array. The phone-number country
selector (`src/components/dallty/phone-field.tsx`) calls `useCountries()`
(`src/lib/reference-data.tsx`), which queries the same `countries` table directly
(`active = true`, ordered by `display_order`) — confirmed by reading both files. There is no
second, duplicate phone-country list anywhere in the codebase.

## Summary: IMPLEMENTED vs. PLANNED

**IMPLEMENTED:** `countries.marketplace_enabled` (+ RLS enforcement, live-tested);
`administrative_levels` (+ Algeria seed, live-tested); business-country immutability guard
(live-tested); `profiles.detected_country_code` (schema only); `formatMoney`/
`formatInTimezone` French-locale bug fix + stale AED-default fix (one high-traffic call site
updated to pass real language).

**PLANNED, explicitly not built:** IP geolocation lookup (needs a real service/header
integration); `country_languages` table (no second country needs a different language set
yet); N-level administrative hierarchy (2-level only today); country/region/city SEO slugs;
manual "explore another country" browsing UX; business multi-language content fields beyond
existing `_ar` columns; remaining ~8 `formatMoney` call sites not yet passing `lang`
(dashboard is unlocalized anyway).
