# Core i18n Runtime — Design Spec

Project 2 of 6 in the Dallty Localization initiative (see
`docs/superpowers/specs/2026-08-14-localization-program-notes.md` for the
cross-project decisions this design inherits). Project 1 (Business Slugs) is
complete. This project builds the underlying translation engine: namespaced
JSON files, a bundled loader, the `useTranslation()` API, French as a third
language, and data-driven RTL handling. It does **not** build locale-prefixed
URLs (Project 3), the Translation Manager CMS (Project 4), SEO plumbing
(Project 5), or build-time guardrails (Project 6) — each is a later project
in the program, and this design explicitly avoids assuming their mechanisms
in ways that would need to be re-architected later.

## Scope

**In scope:**
- The namespace registry and file structure.
- The bundled, zero-network-fetch loader (Stage 1 of a two-stage
  architecture; Stage 2 is Project 4's CMS pipeline, described but not
  built here).
- The `useTranslation()` / `t()` runtime API, route-level namespace
  preloading, and language-switch handling.
- Adding French as a third supported language.
- Data-driven direction (`dir`) and date-locale handling, replacing every
  `lang === "ar"` conditional in the codebase with a lookup against a
  language config table.
- Migrating the ~14 files that currently use the hardcoded bilingual `copy`
  object (in `src/lib/dallty-content.ts` via `useLocale()`) onto the new
  system.

**Out of scope (deferred to later projects, or explicitly not needed):**
- Translating the remaining ~100+ files (the business/admin dashboard,
  platform admin, etc.) that currently have no i18n hooks at all — full app
  coverage happens as a queue of ordinary plan-and-execute content passes,
  one per feature area, *after* this runtime exists. Not part of this spec
  or its implementation plan.
- The Storage-based Draft → Validate → Compile → Publish pipeline, the
  translation manifest, and hash-based selective re-download — all Project
  4. This spec documents the boundary but does not decide Project 4's
  internal mechanism.
- Pluralization engine (ICU MessageFormat or similar) — deferred; see
  "Pluralization" below for the interim convention.
- Locale-prefixed URLs (`/fr/...`) — Project 3. The current `?lang=`
  query-param mechanism stays as-is for this project.
- `emails.json` and `metadata.json` namespaces — reserved, not created,
  until Notifications/Email and SEO (Project 5) respectively need them.

## 1. Namespaces & file structure

Namespaces are organized by **business domain**, not by role/surface — a
`business.json` entry is defined once and consumed by both the
customer-facing detail page and the owner's settings form, rather than
duplicating field labels per surface. This mirrors the domain-oriented
pattern already used elsewhere in Dallty (reference data, the slug service).

```
/locales
  /en
    common.json        # Save, Cancel, Delete, Search, Back, Next, Close, Loading, Retry, Yes, No — nothing else
    auth.json
    validation.json     # required, invalid_email, phone_required, password_too_short, slug_reserved...
    errors.json         # auth.invalid_credentials, booking.slot_unavailable, network.timeout...
    marketplace.json     # home, search, browse, categories
    booking.json         # booking flow + customer-side bookings/favorites/reschedule
    business.json         # business-entity domain: profile fields, hours, business types, policies
    customer.json         # the person: profile, account, notification preferences
    services.json
    staff.json
    reviews.json
    settings.json         # Settings-page UI chrome (tabs, section headers, Save-changes copy)
    notifications.json    # in-app notification strings (booking_confirmed, review_received...)
    reports.json
    payments.json
    platform.json          # Super Admin platform-administration domain
  /fr  ...same files...
  /ar  ...same files...
```

**Active namespaces at launch** (16, all with an immediate consumer):
`common`, `auth`, `validation`, `errors`, `marketplace`, `booking`,
`business`, `customer`, `services`, `staff`, `reviews`, `settings`,
`notifications`, `reports`, `payments`, `platform`.

**Reserved namespaces** (documented, files not created until a production
feature depends on them):

| Namespace | Purpose | Planned for |
|---|---|---|
| `emails` | Transactional email localization (welcome, booking confirmation, OTP, password reset) | Future Notifications & Email System project |
| `metadata` | Localized SEO metadata (titles, descriptions, keywords, og/twitter) | Project 5 — International SEO |

### The registry

The runtime never discovers namespaces by scanning `/locales` — it loads
only from a typed registry, so referencing an unknown or reserved namespace
is a compile-time error:

```ts
// src/lib/i18n/namespaces.ts
export const NAMESPACES = {
  common: { status: "active" },
  auth: { status: "active" },
  validation: { status: "active" },
  errors: { status: "active" },
  marketplace: { status: "active" },
  booking: { status: "active" },
  business: { status: "active" },
  customer: { status: "active" },
  services: { status: "active" },
  staff: { status: "active" },
  reviews: { status: "active" },
  settings: { status: "active" },
  notifications: { status: "active" },
  reports: { status: "active" },
  payments: { status: "active" },
  platform: { status: "active" },

  emails: { status: "reserved", plannedFor: "Notifications & Email System" },
  metadata: { status: "reserved", plannedFor: "International SEO" },
} as const satisfies Record<string, { status: "active" | "reserved"; plannedFor?: string }>;

export type ActiveNamespace = {
  [K in keyof typeof NAMESPACES]: (typeof NAMESPACES)[K]["status"] extends "active" ? K : never;
}[keyof typeof NAMESPACES];
```

**Rule:** a namespace is promoted `reserved → active` only when a production
feature actually depends on it — that's the trigger for creating its 3
per-language JSON files, not a milestone date.

### Structural rules (enforced by convention now; Project 6 can add automated checks later)

- **Max 300 keys per namespace.** Past that, split by sub-domain (e.g.
  `booking.json` → `booking.json` + `booking-calendar.json` +
  `booking-checkout.json`), each becoming its own registry entry.
- **Max nesting depth: `domain.action` or `domain.section.action`.** Never
  deeper (`booking.confirm` or `booking.confirm.button` — never
  `booking.confirm.modal.footer.primary.button`).
- **Navigation/menu labels pull from their own domain's namespace** (e.g.
  the "Staff" sidebar link's label lives in `staff.json`), not `common.json`
  — the same anti-duplication principle applied to nav chrome.
- **`common.json` stays capped** at true cross-cutting words only (the
  eleven listed above are the seed set; additions should be rare and
  genuinely universal).
- **Keys are permanent once created** (program-wide rule from the notes
  doc) — only values change after creation; a key rename orphans every
  language's translation of it.

## 2. Loading architecture — two stages

**Stage 1 (this project) — bundled, zero network fetch.** Namespace JSON
files are git-tracked source files, deployed as part of the normal build.
The loader uses Vite's native `import.meta.glob` to register every
namespace file as a lazy dynamic import, so each namespace+language pair
becomes its own content-hashed JS chunk:

```ts
// src/lib/i18n/loader.ts
import type { Lang } from "./index";
import type { ActiveNamespace } from "./namespaces";

const modules = import.meta.glob<{ default: Record<string, unknown> }>("/locales/*/*.json");

export async function loadNamespace(lang: Lang, namespace: ActiveNamespace) {
  const path = `/locales/${lang}/${namespace}.json`;
  const load = modules[path];
  if (!load) throw new Error(`Missing translation file: ${path}`);
  return (await load()).default;
}
```

This delivers every Stage-1 property from stock Vite tooling, with no custom
fetch/cache/manifest code:
- **No network fetch** — resolved as a normal JS module import.
- **SSR-friendly** — TanStack Start's SSR evaluates the same import path
  server-side; no fetch race, no first-paint loading state.
- **Fast repeat loads** — content-hashed chunk filenames mean the browser's
  ordinary HTTP cache handles "only re-download what changed" across
  deploys, automatically.
- **Versioned with the app** — a namespace file is a normal file in git
  history.
- **Impossible for a bad upload to break prod** — there is no upload path
  in this project. A malformed JSON file fails the build, not production.

**Stage 2 (Project 4, not built here).** Storage will hold `draft/`,
`published/`, and `history/`; a Validate → Compile → Publish pipeline
produces a versioned bundle. What Stage 2 does *not* decide here, because
it is genuinely Project 4's call: whether "publish" means (a) CI pulls the
latest published bundle into `/locales` as a pre-deploy build step —
simplest, this project's loader stays unchanged, publish requires a
redeploy — or (b) the runtime is upgraded to fetch a manifest + hash-checked
namespace files at request time, enabling live publish without a redeploy.
No `manifest.json` exists in this project either — nothing here consumes
one yet, matching the "build only what has a consumer" rule from Section 1.

## 3. Runtime API

### The hook

```ts
const { t } = useTranslation("booking");
// or, when a component genuinely spans domains (e.g. Settings page shows business fields):
const { t } = useTranslation(["settings", "business"]);

t("confirm_button")                 // simple lookup
t("slots_left", { count: 3 })       // "{{count}} slots left" → interpolated
```

Interpolation is a small pure `{{variable}}` string replacer — no
ICU-message-format dependency.

### Pluralization

Explicitly out of scope for this project. Arabic's 6-way plural rules are a
substantial subsystem on their own. Interim convention: translators write
explicit keys per case where grammatically needed (`booking.slots_left_one`
/ `booking.slots_left_other`), the same pattern any i18n system uses before
investing in a plural engine. Revisit if real content surfaces enough cases
to justify one.

### Preloading — routes preload, components consume synchronously

`preloadNamespaces` is a thin wrapper over `loadNamespace` (Section 2) that
fetches a batch in parallel and writes each result into the same in-memory
cache `useTranslation()` reads from — it's how a route's `loader` warms the
cache before the component tree renders, so `t()` is never in a loading
state and needs no Suspense boundary:

```ts
// src/lib/i18n/loader.ts (continued)
const cache = new Map<string, Record<string, unknown>>(); // key: `${lang}/${namespace}`

export async function preloadNamespaces(lang: Lang, namespaces: ActiveNamespace[]) {
  await Promise.all(
    namespaces.map(async (ns) => {
      const key = `${lang}/${ns}`;
      if (!cache.has(key)) cache.set(key, await loadNamespace(lang, ns));
    }),
  );
}

export function getCachedNamespace(lang: Lang, namespace: ActiveNamespace) {
  return cache.get(`${lang}/${namespace}`);
}
```

```ts
export const Route = createFileRoute("/business/$businessSlug")({
  loader: async ({ context }) => {
    await preloadNamespaces(context.lang, ["marketplace", "business", "booking"]);
  },
  component: BusinessDetailPage,
});
```

`common` preloads once, always, from the root layout. `useTranslation(ns)`
reads via `getCachedNamespace` and also registers `ns` into the existing
`LocaleProvider`'s (`src/lib/i18n.tsx`) set of "namespaces used by the
active route" — the same set `setLang` re-preloads on a language switch
(below). If a component asks for a namespace nobody preloaded (a bug, not a
supported pattern), dev mode logs a console warning and it falls back to
returning the raw key — visible in review, never a crash.

### Missing-key fallback

A key missing for the active language silently falls back to the English
value, so users never see a broken UI. Dev mode logs a console warning.
Systematic missing-key detection across languages is Project 6's job.

### Language switching

The provider tracks which namespaces are currently in use by the active
route (populated by the same `preloadNamespaces` calls). `setLang(next)`
re-preloads that same namespace set for the new language and only commits
the language change once they resolve — so switching never flashes
untranslated content. First switch to a given language on a given route has
a brief async gap (loading a JS chunk); every subsequent switch is instant
(cached).

### Compile-time key safety

A small generator script reads `/locales/en/*.json` (the canonical,
always-complete namespace) and emits `src/lib/i18n/keys.gen.ts` — a TS
union type of valid dot-paths per namespace. `useTranslation("booking").t(...)`
then only accepts real `booking.*` keys — a typo is a compile error. This
follows the same auto-regeneration pattern already established in this
codebase for `routeTree.gen.ts` (a Vite plugin regenerates it whenever a
watched source file changes during `dev`, and it's regenerated as a normal
build step in CI); the generator script here hooks into Vite the same way,
watching `/locales/en/**/*.json`. Missing-key-*across-languages* detection
and dead-key detection stay Project 6's job.

### Adding French

`LANGUAGES` (see Section 4) gains a `fr` entry. `language-switcher.tsx`'s
"segmented" variant currently hardcodes `l.code === "ar" ? "ع" : "EN"` —
replaced with a proper 3-way label lookup. `toggleLang()` (a binary en/ar
flip) is replaced with `cycleLang()` or removed in favor of the picker,
since a binary toggle doesn't generalize to 3 languages.

### Migrating the existing `copy` object

The current `useLocale().t` (the bilingual `copy` dictionary in
`src/lib/dallty-content.ts`) is retired in favor of per-namespace
`useTranslation()` calls. The ~14 files currently using it — and the
scattered `lang === "ar" ? x : y` ternaries in `business-card.tsx`,
`notification-center.tsx`, `password-strength.tsx`, `site-nav.tsx`, and
`business-category-label.ts` — get migrated key-by-key into the appropriate
namespace files as part of this project, since it's the one place real
translated content already exists.

## 4. RTL, date locale, and fonts — all data-driven

**Direction comes from a language config table, never from `lang === "ar"`.**
`dirFor()` currently hardcodes the Arabic check; it becomes a lookup:

```ts
export const LANGUAGES = [
  { code: "en", label: "English", native: "English", dir: "ltr", dateFnsLocale: enUS },
  { code: "fr", label: "French", native: "Français", dir: "ltr", dateFnsLocale: fr },
  { code: "ar", label: "Arabic", native: "العربية", dir: "rtl", dateFnsLocale: arDZ },
] as const;

export function dirFor(lang: Lang): "ltr" | "rtl" {
  return LANGUAGES.find((l) => l.code === lang)?.dir ?? "ltr";
}
```

Adding a future RTL language (Hebrew, Persian) is then a new table row, not
a new conditional anywhere in the app. `isRtl` on the locale context stays
as a derived convenience (`dir === "rtl"`), computed from `dirFor()`, never
from its own language check.

**Two real bugs fixed in the same pass:**
- `isArabic` is currently exposed on the locale context but unused anywhere
  outside its own definition — dropped entirely rather than carried forward
  as an API shaped like the anti-pattern this section removes.
- `notification-center.tsx` hardcodes `lang === "ar" ? arDZ : enUS` for
  date-fns locale selection. With French added, this would silently format
  French dates as English. Folding `dateFnsLocale` into the `LANGUAGES`
  table (above) fixes it and makes date formatting scale the same way
  direction does.

**Fonts are a separate axis from direction.** Arabic script needs its own
font stack; that's a per-*language* concern (French and English share one),
not a per-*direction* one — worth keeping decoupled so a future RTL
language with a different script doesn't get silently mapped to the Arabic
font. Implementation will check how the Arabic font is currently selected
and make sure it's keyed off `lang`, not `dir`.

**CSS logical properties are already correct.** The codebase already uses
Tailwind's `start-`/`end-`/`me-` logical utilities rather than
`left-`/`right-`, so RTL layout already flips correctly off the `dir`
attribute alone. No changes needed; new namespace-driven UI should keep
using logical properties.

## Migration & verification plan

1. Migrate the ~14 files currently using the bilingual `copy` object (plus
   the 5 files with scattered `lang === "ar"` ternaries) onto
   `useTranslation()` and the new namespace files.
2. `tsc`/`eslint` clean, per this session's standing convention.
3. Browser pass across all three languages: layout stays LTR for
   English/French and flips RTL for Arabic; `<html lang>`/`<html dir>`
   update correctly for all three; date-fns renders booking dates in the
   correct per-language locale (specifically catches the French
   date-formatting bug above); the compile-time key-typo guard rejects a
   deliberately-introduced bad key (smoke test, not a permanent suite — no
   test framework in this codebase).
4. Spot-check migrated content: home page, business detail page, auth, and
   bookings render correctly in all three languages with no missing-key
   fallbacks firing (no unexpected English leaking into a French/Arabic
   screen).
