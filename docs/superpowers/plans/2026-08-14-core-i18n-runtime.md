# Core i18n Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the namespaced-JSON translation runtime (registry, bundled loader, `useTranslation()` hook, compile-time key safety), add French as a third language with fully data-driven RTL/date-locale handling, and migrate every file currently using the old bilingual `copy` object (or an ad-hoc `lang === "ar"` ternary) onto the new system.

**Architecture:** Namespace JSON files live under `/locales/<lang>/<namespace>.json`, git-tracked and loaded via Vite's native `import.meta.glob` — zero network fetch, SSR-safe by construction. Routes preload the namespaces they need via their TanStack Start `loader` before rendering; `useTranslation(namespace)` then reads synchronously from an in-memory cache with no loading state of its own. A generated TS union type makes referencing an unknown key a compile error.

**Tech Stack:** Vite (`import.meta.glob`), TanStack Start (route loaders), React Context (existing `LocaleProvider`), date-fns locales.

**Spec:** `docs/superpowers/specs/2026-08-14-core-i18n-runtime-design.md` — the plan argues from this spec; read both.

## Global Constraints

- Keys are permanent once created — never rename a key after this plan lands; only values change. (Program-wide rule.)
- `common.json` stays capped at genuinely cross-cutting words — see Task 1 for the exact seed list; this plan's own additions to it are itemized in Task 5/Task 11 and are deliberate exceptions (nav chrome shared across multiple unrelated surfaces), not scope creep.
- Max 300 keys per namespace; max nesting depth `domain.action` or `domain.section.action` — never deeper.
- Navigation/menu labels pull from their own domain's namespace, not `common.json`, **except** where a label is demonstrably shared across unrelated surfaces (documented case-by-case in this plan where it applies).
- Missing translation key → silently falls back to English, with a `console.warn` in dev. Never throw, never render a raw key to a real user.
- Pluralization is out of scope — use explicit `_one`/`_other` keys only where grammar actually requires it (none of this plan's content needs it; noted for future namespaces).
- No Supabase Storage, manifest, or CMS work of any kind — that is entirely Project 4's job, not this plan's.
- `npx tsc --noEmit` and `npx eslint .` must stay clean (zero *new* errors — this codebase has pre-existing prettier-formatting lint debt unrelated to this work, established in every prior sub-project this session) after every task.
- No test framework in this codebase — verification is `tsc`/`eslint`/browser, using the Browser pane preview tools against `dallty-dev` (port 8080).
- Dev server auto-regenerates `src/routeTree.gen.ts` and picks up new/changed files; no manual build step needed between tasks.
- Never edit historical migration files. This plan needs no DB migration at all — i18n runtime state is entirely app-level (JSON files + React context), not persisted to Postgres.

---

## File Structure

**New files:**
- `src/lib/i18n/namespaces.ts` — the typed namespace registry (`NAMESPACES`, `ActiveNamespace`).
- `src/lib/i18n/loader.ts` — `loadNamespace` / `preloadNamespaces` / `getCachedNamespace`, built on `import.meta.glob`.
- `src/lib/i18n/hooks.ts` — `useTranslation(namespace | namespace[])`.
- `src/lib/i18n/generate-keys.ts` — the key-type generator script (reads `/locales/en/*.json`, writes `src/lib/i18n/keys.gen.ts`).
- `src/lib/i18n/keys.gen.ts` — generated, git-ignored like `routeTree.gen.ts`; not created by hand, produced by Task 3.
- `/locales/en/*.json`, `/locales/fr/*.json`, `/locales/ar/*.json` — 16 namespaces × 3 languages = 48 files.

**Modified files:**
- `src/lib/i18n.tsx` — `LANGUAGES` becomes data-driven (adds `dir`/`dateFnsLocale` per entry), `dirFor()`/`isRtl` derive from the table, `isArabic`/`pick`/`toggleLang` removed, `LocaleProvider` gains the "namespaces used by the active route" tracking that language-switching re-preloads.
- `src/components/dallty/language-switcher.tsx` — 3-way label map, `variant="segmented"` no longer hardcodes `ar`/`en`.
- `src/routes/__root.tsx` — adds the `fr` hreflang alternate.
- `vite.config.ts` — registers the key-generator as a small Vite plugin (mirrors how `routeTree.gen.ts` is wired).
- Every file listed in Tasks 5–11 below.

**Vite config note:** `tsconfig.json`/`vite.config.ts` already resolve `@/*` to `src/*`; `/locales/*` is a new top-level directory (sibling to `src/`), so `import.meta.glob("/locales/*/*.json")` uses an absolute-from-project-root glob — this is standard Vite glob syntax and needs no new path alias.

---

## Task 1: Namespace registry + empty stub files

**Files:**
- Create: `src/lib/i18n/namespaces.ts`
- Create: `/locales/en/common.json`, `/locales/en/auth.json`, `/locales/en/validation.json`, `/locales/en/errors.json`, `/locales/en/marketplace.json`, `/locales/en/booking.json`, `/locales/en/business.json`, `/locales/en/customer.json`, `/locales/en/services.json`, `/locales/en/staff.json`, `/locales/en/reviews.json`, `/locales/en/settings.json`, `/locales/en/notifications.json`, `/locales/en/reports.json`, `/locales/en/payments.json`, `/locales/en/platform.json` (16 files)
- Create: the same 16 filenames under `/locales/fr/` and `/locales/ar/` (32 more files)

**Interfaces:**
- Produces: `NAMESPACES: Record<string, {status: "active"|"reserved"; plannedFor?: string}>`, `type ActiveNamespace` — consumed by every later task's loader/hook signatures.

- [ ] **Step 1: Write the registry**

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

export type NamespaceName = keyof typeof NAMESPACES;

export type ActiveNamespace = {
  [K in NamespaceName]: (typeof NAMESPACES)[K]["status"] extends "active" ? K : never;
}[NamespaceName];

export const ACTIVE_NAMESPACES = (Object.keys(NAMESPACES) as NamespaceName[]).filter(
  (n) => NAMESPACES[n].status === "active",
) as ActiveNamespace[];
```

- [ ] **Step 2: Create the 48 stub files**

Every file gets `{}` as placeholder content — later tasks (5–11) fill in real keys for the namespaces they touch; namespaces with no consumer in this plan (`validation`, `errors`, `business`, `customer`, `services`, `staff`, `reviews`, `reports`, `payments`) stay `{}` until a future content pass gives them one. This is not a "placeholder" in the plan-writing sense (no step here claims to add real content) — it's the correct empty state for an active-but-not-yet-populated namespace, matching the "build only what has a consumer" principle applied at the key level.

Run, from the project root:
```bash
node -e "
const fs = require('fs');
const namespaces = ['common','auth','validation','errors','marketplace','booking','business','customer','services','staff','reviews','settings','notifications','reports','payments','platform'];
for (const lang of ['en','fr','ar']) {
  fs.mkdirSync('locales/' + lang, { recursive: true });
  for (const ns of namespaces) {
    fs.writeFileSync('locales/' + lang + '/' + ns + '.json', '{}\n');
  }
}
"
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors (the registry has no consumers yet, so this just confirms the file itself is valid TS).

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/namespaces.ts locales
git commit -m "feat: add the i18n namespace registry and 48 stub translation files"
```

---

## Task 2: Bundled loader

**Files:**
- Create: `src/lib/i18n/loader.ts`

**Interfaces:**
- Consumes: `ActiveNamespace` (Task 1), `Lang` (existing, `src/lib/i18n.tsx`).
- Produces: `loadNamespace(lang, namespace): Promise<Record<string, unknown>>`, `preloadNamespaces(lang, namespaces: ActiveNamespace[]): Promise<void>`, `getCachedNamespace(lang, namespace): Record<string, unknown> | undefined` — consumed by Task 4 (hook) and every route-loader task (5–11).

- [ ] **Step 1: Write the loader**

```ts
// src/lib/i18n/loader.ts
import type { Lang } from "./index-types";
import type { ActiveNamespace } from "./namespaces";

const modules = import.meta.glob<{ default: Record<string, unknown> }>("/locales/*/*.json");

const cache = new Map<string, Record<string, unknown>>(); // key: `${lang}/${namespace}`

export async function loadNamespace(
  lang: Lang,
  namespace: ActiveNamespace,
): Promise<Record<string, unknown>> {
  const path = `/locales/${lang}/${namespace}.json`;
  const load = modules[path];
  if (!load) throw new Error(`Missing translation file: ${path}`);
  return (await load()).default;
}

export async function preloadNamespaces(
  lang: Lang,
  namespaces: ActiveNamespace[],
): Promise<void> {
  await Promise.all(
    namespaces.map(async (ns) => {
      const key = `${lang}/${ns}`;
      if (!cache.has(key)) cache.set(key, await loadNamespace(lang, ns));
    }),
  );
}

export function getCachedNamespace(
  lang: Lang,
  namespace: ActiveNamespace,
): Record<string, unknown> | undefined {
  return cache.get(`${lang}/${namespace}`);
}
```

`src/lib/i18n/index-types.ts` doesn't exist yet and shouldn't be created here — `Lang` already lives in `src/lib/i18n.tsx` (re-exported from `src/lib/dallty-content.ts` today, see Task 4). Replace the import with the real path:

```ts
import type { Lang } from "@/lib/i18n";
```

(Written as a two-step above deliberately, so the implementer notices `Lang`'s real location rather than inventing a new file — fix this import before running Step 2.)

- [ ] **Step 2: Manual smoke check via browser console**

With `dallty-dev` running, open any page, then in the browser console (via `javascript_tool` or the Browser pane):

```js
const mod = await import('/src/lib/i18n/loader.ts');
await mod.preloadNamespaces('en', ['common']);
mod.getCachedNamespace('en', 'common'); // should return {} (Task 1's stub)
```

Expected: returns `{}` with no thrown error, confirming the glob path resolves correctly.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/loader.ts
git commit -m "feat: add the bundled per-namespace translation loader"
```

---

## Task 3: Compile-time key-safety generator

**Files:**
- Create: `src/lib/i18n/generate-keys.ts`
- Modify: `vite.config.ts`
- Modify: `.gitignore` (add `src/lib/i18n/keys.gen.ts`, matching how `routeTree.gen.ts` is handled — check `.gitignore` first; if `routeTree.gen.ts` is NOT git-ignored in this repo, don't ignore `keys.gen.ts` either — match whatever the existing convention actually is)

**Interfaces:**
- Produces: `src/lib/i18n/keys.gen.ts` exporting `type NamespaceKeys<N extends ActiveNamespace>` (a per-namespace union of valid dot-paths) — consumed by Task 4's `useTranslation`/`t()` signature.

- [ ] **Step 1: Check whether `routeTree.gen.ts` is git-ignored**

```bash
grep routeTree .gitignore
```

If it prints a match, add `src/lib/i18n/keys.gen.ts` to `.gitignore` the same way. If no match (the file is committed), do not add `keys.gen.ts` to `.gitignore` either — commit it alongside every task that changes namespace content, exactly like `routeTree.gen.ts` gets committed alongside route changes in this codebase.

- [ ] **Step 2: Write the generator**

```ts
// src/lib/i18n/generate-keys.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EN_DIR = join(process.cwd(), "locales", "en");
const OUT_FILE = join(process.cwd(), "src", "lib", "i18n", "keys.gen.ts");

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

export function generateKeysFile(): void {
  const files = readdirSync(EN_DIR).filter((f) => f.endsWith(".json"));
  const blocks = files.map((file) => {
    const namespace = file.replace(/\.json$/, "");
    const content = JSON.parse(readFileSync(join(EN_DIR, file), "utf-8"));
    const keys = flattenKeys(content);
    const union = keys.length > 0 ? keys.map((k) => `"${k}"`).join(" | ") : "never";
    return `  ${namespace}: ${union};`;
  });

  const out = `// AUTO-GENERATED by src/lib/i18n/generate-keys.ts — do not edit by hand.
export type NamespaceKeyMap = {
${blocks.join("\n")}
};
`;
  writeFileSync(OUT_FILE, out);
}
```

This project is pure ESM (`"type": "module"` in `package.json`) — the script deliberately has **no** `require()`/`require.main` "run directly" block (that's CommonJS-only and throws `ReferenceError: require is not defined` under ESM). It's only ever invoked by importing `generateKeysFile` from `vite.config.ts` (Step 3), never executed standalone.

- [ ] **Step 3: Wire it into Vite's plugin list**

This project's `vite.config.ts` doesn't call Vite's `defineConfig` directly — it wraps `@lovable.dev/vite-tanstack-config`'s own `defineConfig`, which internally sets up the TanStack Router/React/Tailwind plugins itself (see the file's own top-of-file warning comment: "do NOT add them manually or the app will break with duplicate plugins"). Confirmed via `node_modules/@lovable.dev/vite-tanstack-config/dist/index.d.ts`: `LovableViteTanstackOptions` exposes a dedicated top-level `plugins?: PluginOption[]` field — that, not the `vite: {...}` passthrough (which is Vite's own raw `UserConfig` and risks duplicating the wrapper's internal plugins), is the supported extension point for adding a custom plugin. Read the current `vite.config.ts` first — it may have shifted since this plan was written — then add a `plugins` array as a new top-level sibling to the existing `tanstackStart`/`vite` keys inside the `defineConfig({...})` call:

```ts
// near the top of vite.config.ts, with the other imports
import { sep } from "node:path";
import { generateKeysFile } from "./src/lib/i18n/generate-keys";

// inside the defineConfig({...}) call, as a new top-level key alongside
// `tanstackStart` and `vite` (NOT nested inside `vite: {...}`):
export default defineConfig({
  plugins: [
    {
      name: "i18n-keys-generator",
      buildStart() {
        generateKeysFile();
      },
      configureServer(server) {
        generateKeysFile();
        server.watcher.add("locales/en/**/*.json");
        server.watcher.on("change", (file) => {
          if (file.includes(`${sep}locales${sep}en${sep}`)) {
            generateKeysFile();
          }
        });
      },
    },
  ],
  tanstackStart: {
    // ...unchanged, keep whatever is already here...
  },
  vite: {
    // ...unchanged, keep whatever is already here...
  },
});
```

- [ ] **Step 4: Run dev server and confirm the file generates**

With `dallty-dev` running (restart it if it was already running, so the new Vite plugin loads), confirm `src/lib/i18n/keys.gen.ts` now exists and contains 16 namespace entries, each currently `never` (since Task 1's stub files are `{}`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/generate-keys.ts vite.config.ts .gitignore
git commit -m "feat: generate compile-time translation key types from the English namespace files"
```
(Only add `keys.gen.ts` to this commit if Step 1 determined it should be committed, not ignored.)

---

## Task 4: `useTranslation()` hook + interpolation

**Files:**
- Create: `src/lib/i18n/hooks.ts`

**Interfaces:**
- Consumes: `getCachedNamespace` (Task 2), `ActiveNamespace` (Task 1), `NamespaceKeyMap` (Task 3), `useLocale` (existing, `src/lib/i18n.tsx` — read-only `lang` for now; Task 5 modifies the provider itself).
- Produces: `useTranslation(namespace: N | N[]): { t: (key, vars?) => string }` — consumed by every migration task (5–11).

- [ ] **Step 1: Write the hook**

```ts
// src/lib/i18n/hooks.ts
import { useMemo } from "react";

import { useLocale } from "@/lib/i18n";
import { getCachedNamespace } from "./loader";
import type { ActiveNamespace } from "./namespaces";
import type { NamespaceKeyMap } from "./keys.gen";

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{{${name}}}`,
  );
}

export function useTranslation<N extends ActiveNamespace>(namespace: N | N[]) {
  const { lang } = useLocale();
  const namespaces = Array.isArray(namespace) ? namespace : [namespace];

  const dicts = useMemo(
    () => namespaces.map((ns) => ({ ns, dict: getCachedNamespace(lang, ns) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, namespaces.join(",")],
  );

  function t(key: NamespaceKeyMap[N], vars?: Record<string, string | number>): string {
    for (const { ns, dict } of dicts) {
      if (!dict) continue;
      const value = getPath(dict, key as string);
      if (typeof value === "string") return interpolate(value, vars);
    }
    if (import.meta.env.DEV) {
      console.warn(`[i18n] missing key "${String(key)}" in namespace(s) [${namespaces.join(", ")}] for lang "${lang}"`);
    }
    return key as string;
  }

  return { t };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. (`keys.gen.ts` exists from Task 3, even if every namespace is currently `never` — the hook file itself type-checks against the generated map regardless of its content.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/hooks.ts
git commit -m "feat: add the useTranslation hook with {{variable}} interpolation"
```

---

## Task 5: LANGUAGES data table, French, RTL/date-locale fixes, `common.json` content, and the nav/shell migration

This is the first content task — it fills in `common.json` (all three languages) and migrates the files whose entire translated surface is nav/shell chrome: `site-nav.tsx`, `client-shell.tsx`, plus the runtime rewrite itself.

**Files:**
- Modify: `src/lib/i18n.tsx`
- Modify: `src/components/dallty/language-switcher.tsx`
- Modify: `src/routes/__root.tsx`
- Modify: `src/components/dallty/site-nav.tsx`
- Modify: `src/components/dallty/client-shell.tsx`
- Modify: `locales/en/common.json`, `locales/fr/common.json`, `locales/ar/common.json`

**Interfaces:**
- Consumes: `useTranslation` (Task 4), `preloadNamespaces` (Task 2).
- Produces: rewritten `LANGUAGES`, `dirFor`, `LocaleProvider` (with namespace-tracking + language-switch re-preload) — consumed by every subsequent task's route loaders and by `__root.tsx`.

- [ ] **Step 1: Write `common.json`'s English content**

```json
// locales/en/common.json
{
  "brand": "Dallty",
  "tagline": "Find. Book. Relax.",
  "sign_in": "Sign in",
  "footer": "© 2026 Dallty. Find. Book. Relax.",
  "language": "Language",
  "nav": {
    "home": "Home",
    "search": "Search",
    "bookings": "Bookings",
    "favorites": "Favorites",
    "profile": "Profile"
  },
  "menu": {
    "customers": "For customers",
    "business": "For business",
    "explore": "Explore",
    "search": "Search",
    "bookings": "My bookings",
    "favorites": "Favorites",
    "account": "Account",
    "notifications": "Notifications",
    "dashboard": "Dashboard",
    "list_business": "List your business",
    "business_sign_in": "Business sign in",
    "staff_sign_in": "Staff sign in",
    "business_dashboard": "Business dashboard",
    "create_account": "Create account",
    "sign_out": "Sign out"
  }
}
```

- [ ] **Step 2: Write `common.json`'s French content**

```json
// locales/fr/common.json
{
  "brand": "Dallty",
  "tagline": "Trouvez. Réservez. Détendez-vous.",
  "sign_in": "Se connecter",
  "footer": "© 2026 Dallty. Trouvez. Réservez. Détendez-vous.",
  "language": "Langue",
  "nav": {
    "home": "Accueil",
    "search": "Recherche",
    "bookings": "Réservations",
    "favorites": "Favoris",
    "profile": "Profil"
  },
  "menu": {
    "customers": "Pour les clients",
    "business": "Pour les professionnels",
    "explore": "Découvrir",
    "search": "Recherche",
    "bookings": "Mes réservations",
    "favorites": "Favoris",
    "account": "Compte",
    "notifications": "Notifications",
    "dashboard": "Tableau de bord",
    "list_business": "Inscrire votre établissement",
    "business_sign_in": "Connexion professionnel",
    "staff_sign_in": "Connexion employé",
    "business_dashboard": "Tableau de bord professionnel",
    "create_account": "Créer un compte",
    "sign_out": "Déconnexion"
  }
}
```

- [ ] **Step 3: Write `common.json`'s Arabic content**

```json
// locales/ar/common.json
{
  "brand": "دلّتي",
  "tagline": "اكتشف. احجز. واستمتع.",
  "sign_in": "تسجيل الدخول",
  "footer": "© 2026 دلّتي. اكتشف. احجز. واستمتع.",
  "language": "اللغة",
  "nav": {
    "home": "الرئيسية",
    "search": "بحث",
    "bookings": "حجوزاتي",
    "favorites": "المفضلة",
    "profile": "حسابي"
  },
  "menu": {
    "customers": "للعملاء",
    "business": "للأعمال",
    "explore": "استكشف",
    "search": "بحث",
    "bookings": "حجوزاتي",
    "favorites": "المفضلة",
    "account": "حسابي",
    "notifications": "الإشعارات",
    "dashboard": "لوحة التحكم",
    "list_business": "أضف نشاطك التجاري",
    "business_sign_in": "دخول أصحاب الأعمال",
    "staff_sign_in": "دخول الموظفين",
    "business_dashboard": "لوحة تحكم النشاط",
    "create_account": "إنشاء حساب",
    "sign_out": "تسجيل الخروج"
  }
}
```

- [ ] **Step 4: Rewrite `src/lib/i18n.tsx`'s `LANGUAGES` table and `dirFor`**

Read the current file first (`src/lib/i18n.tsx`) to confirm line numbers before editing — it was last touched by the Business Slugs project and may have shifted. Replace the `LANGUAGES` constant and `dirFor` function with:

```ts
import { arDZ, enUS, fr } from "date-fns/locale";

export const LANGUAGES = [
  { code: "en" as const, label: "English", native: "English", dir: "ltr" as const, dateFnsLocale: enUS },
  { code: "fr" as const, label: "French", native: "Français", dir: "ltr" as const, dateFnsLocale: fr },
  { code: "ar" as const, label: "Arabic", native: "العربية", dir: "rtl" as const, dateFnsLocale: arDZ },
];

export function dirFor(lang: Lang): "ltr" | "rtl" {
  return LANGUAGES.find((l) => l.code === lang)?.dir ?? "ltr";
}

export function dateFnsLocaleFor(lang: Lang) {
  return LANGUAGES.find((l) => l.code === lang)?.dateFnsLocale ?? enUS;
}
```

`Lang` itself is currently `"en" | "ar"` (re-exported from `src/lib/dallty-content.ts`). Change its definition to `"en" | "fr" | "ar"` — it's defined in `dallty-content.ts` as `export type Lang = "en" | "ar";`; update it there to `export type Lang = "en" | "fr" | "ar";`. Also update `isLang`:

```ts
export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "fr" || value === "ar";
}
```

And `detectBrowserLang`:

```ts
function detectBrowserLang(): Lang {
  if (typeof navigator === "undefined") return DEFAULT_LANG;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of candidates) {
    const code = (raw || "").toLowerCase();
    if (code.startsWith("ar")) return "ar";
    if (code.startsWith("fr")) return "fr";
    if (code.startsWith("en")) return "en";
  }
  return DEFAULT_LANG;
}
```

- [ ] **Step 5: Remove `isArabic`, `pick`, `toggleLang`; add namespace tracking + re-preload on switch**

In the `LocaleValue` type and `LocaleProvider`'s `value` object, remove `isArabic` and `pick` entirely (grep the codebase for `.isArabic` and `.pick(` after this step — Tasks 6–11 remove the remaining call sites, so a few will still exist until those land; that's expected mid-plan and gets cleaned up by Task 12's final sweep, not a blocker for this task's own commit). Keep `isRtl` but derive it from `dirFor`:

```ts
isRtl: dirFor(lang) === "rtl",
```

Add namespace tracking and rewrite `setLang` to re-preload before committing:

The current top-of-file React import is `import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";` — add `useRef` to it (needed by the code below).

```ts
import { preloadNamespaces } from "@/lib/i18n/loader";
import type { ActiveNamespace } from "@/lib/i18n/namespaces";

// inside LocaleProvider, alongside the existing `preferred` state:
const activeNamespacesRef = useRef<Set<ActiveNamespace>>(new Set());

const registerNamespaces = useCallback((namespaces: ActiveNamespace[]) => {
  for (const ns of namespaces) activeNamespacesRef.current.add(ns);
}, []);

const setLang = useCallback(
  async (next: Lang) => {
    await preloadNamespaces(next, Array.from(activeNamespacesRef.current));
    persist(next);
    setPreferred(next);
    window.history.replaceState(
      window.history.state,
      "",
      localizedPath(window.location.pathname, next, window.location.search),
    );
  },
  [],
);
```

Add `registerNamespaces` to the exported context value (`LocaleValue` type gains `registerNamespaces: (namespaces: ActiveNamespace[]) => void`). `toggleLang` is removed from the type and the value object — every current call site (`client-shell.tsx`, `admin-shell.tsx`) is fixed in this task and Task 11 respectively. The fallback object returned by `useLocale()` when used outside the provider also needs `registerNamespaces: () => {}` added and `isArabic`/`pick`/`toggleLang` removed to match the new `LocaleValue` shape.

`useTranslation` (Task 4) needs one addition to actually populate this tracking — update `src/lib/i18n/hooks.ts`:

```ts
export function useTranslation<N extends ActiveNamespace>(namespace: N | N[]) {
  const { lang, registerNamespaces } = useLocale();
  const namespaces = Array.isArray(namespace) ? namespace : [namespace];

  useEffect(() => {
    registerNamespaces(namespaces);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespaces.join(",")]);

  // ...(rest unchanged from Task 4)
```

- [ ] **Step 6: Preload `common` from the root layout**

In `src/routes/__root.tsx`, inside the root component (before/alongside `LocaleProvider`), add a `beforeLoad` or root-level effect that always preloads `common` for the resolved language:

```ts
// in the root route's beforeLoad (or equivalent existing hook — read __root.tsx first
// to find where `lang` is already resolved server-side, and add this call there):
await preloadNamespaces(lang, ["common"]);
```

Also add the French hreflang alternate next to the existing `en`/`ar` ones:

```tsx
<link rel="alternate" hrefLang="fr" href={SITE_URL + localizedPath(pathname, "fr", searchStr)} />
```

- [ ] **Step 7: Fix `language-switcher.tsx`'s 3-way label map**

Replace the "segmented" variant's `{l.code === "ar" ? "ع" : "EN"}` with a lookup table:

```ts
const SHORT_LABEL: Record<Lang, string> = { en: "EN", fr: "FR", ar: "ع" };
```

```tsx
{SHORT_LABEL[l.code]}
```

- [ ] **Step 8: Migrate `site-nav.tsx`**

Replace `import { copy, type Lang } from "@/lib/dallty-content";` with `import type { Lang } from "@/lib/i18n";` and add `import { useTranslation } from "@/lib/i18n/hooks";`. In `useNavLinks`, replace `const m = copy[lang].menu;` with a `useTranslation("common")` call — since `useNavLinks` is a plain function (not itself a hook called at the top of a component in a way that changes per-render... it IS called inside `NavMenu`/`SiteHeader`, both components, so `useNavLinks` itself is a custom hook and can call `useTranslation` directly):

```ts
function useNavLinks(lang: Lang) {
  const { user, roles } = useAuth();
  const { t } = useTranslation("common");
  const home = landingForRoles(roles);
  const isManager = home !== "/bookings";

  const customer = [
    { to: "/" as const, label: t("menu.explore"), icon: Sparkles },
    { to: "/search" as const, label: t("menu.search"), icon: Search },
    { to: "/bookings" as const, label: t("menu.bookings"), icon: Calendar },
    { to: "/favorites" as const, label: t("menu.favorites"), icon: Heart },
    { to: "/profile" as const, label: t("menu.account"), icon: User },
  ];

  const business = [
    { to: "/business/signup" as const, label: t("menu.list_business"), icon: Store },
    ...(user ? [] : [{ to: "/auth" as const, label: t("menu.business_sign_in"), icon: Briefcase }]),
    { to: "/staff/signup" as const, label: t("menu.staff_sign_in"), icon: Users },
    ...(isManager ? [{ to: home, label: t("menu.business_dashboard"), icon: LayoutDashboard }] : []),
  ];

  return { customer, business, user, home, isManager, m: buildLegacyM(t) };
}
```

The `m` object is consumed throughout `NavMenu`/`SiteHeader` for other keys (`m.open`, `m.customers`, `m.dashboard`, `m.signOut`, `m.createAccount`, `m.business`). Rather than rewrite every call site individually (higher risk of missing one in a large file), build a small compatibility object once, matching the OLD `m` shape exactly, sourced from the new `t()`:

```ts
function buildLegacyM(t: ReturnType<typeof useTranslation<"common">>["t"]) {
  return {
    open: "Menu", // aria-label only, never localized before either — leave as-is, it's an English-only aria-label bug pre-dating this migration, out of scope
    close: "Close menu",
    customers: t("menu.customers"),
    business: t("menu.business"),
    explore: t("menu.explore"),
    search: t("menu.search"),
    bookings: t("menu.bookings"),
    favorites: t("menu.favorites"),
    account: t("menu.account"),
    notifications: t("menu.notifications"),
    dashboard: t("menu.dashboard"),
    listBusiness: t("menu.list_business"),
    businessSignIn: t("menu.business_sign_in"),
    staffSignIn: t("menu.staff_sign_in"),
    businessDashboard: t("menu.business_dashboard"),
    createAccount: t("menu.create_account"),
    signOut: t("menu.sign_out"),
    language: t("language"),
  };
}
```

Replace every `copy[lang].X` reference in this file (`copy[lang].brand`, `.tagline`, `.signIn`, `.dir`) with `t("brand")`, `t("tagline")`, `t("sign_in")`, and `dirFor(lang)` (imported from `@/lib/i18n`) respectively — add a second `useTranslation("common")` call where needed or reuse the same `t` from a top-level call in `NavMenu`/`SiteHeader` (both components already call `useNavLinks`; add `const { t } = useTranslation("common");` directly in `NavMenu` and `SiteHeader` too, for their own `t("brand")`/`t("sign_in")`/`dirFor(lang)` needs, separate from `useNavLinks`'s internal one — two `useTranslation("common")` calls in the same render tree is fine, the loader cache makes it free).

Replace line 191's `{lang === "ar" ? "اللغة" : "Language"}` with `{t("language")}`.

- [ ] **Step 9: Migrate `client-shell.tsx`**

Replace `import { copy } from "@/lib/dallty-content";` with `import { useTranslation } from "@/lib/i18n/hooks";`. Replace `const { lang, toggleLang } = useLocale();` — `toggleLang` no longer exists (Step 5). `client-shell.tsx` passed `onToggleLang={toggleLang}` to `<SiteHeader>`, but `SiteHeader`'s `NavProps` already treats `onToggleLang` as optional and doesn't actually appear to be called anywhere inside `site-nav.tsx` based on the current file (confirm this via `grep onToggleLang src/components/dallty/site-nav.tsx` before editing — if it truly is unused, remove the prop from `NavProps` and stop passing it here; if it turns out to be used, replace it with `LanguageSwitcher`'s own picker instead of a toggle, since a binary toggle has no meaning across 3 languages).

Replace `<BottomNav tabs={copy[lang].tabs} />` with:

```tsx
const { t } = useTranslation("common");
// ...
<BottomNav tabs={[t("nav.home"), t("nav.search"), t("nav.bookings"), t("nav.favorites"), t("nav.profile")]} />
```

- [ ] **Step 10: Typecheck and lint**

Run: `npx tsc --noEmit` and `npx eslint src/lib/i18n.tsx src/lib/i18n/hooks.ts src/lib/i18n/loader.ts src/components/dallty/language-switcher.tsx src/components/dallty/site-nav.tsx src/components/dallty/client-shell.tsx src/routes/__root.tsx src/lib/dallty-content.ts`
Expected: zero errors on both. Fix any remaining references to the removed `isArabic`/`pick`/`toggleLang` in files this task touches (other files still referencing them are expected until Tasks 6–11 land — do not chase those down here).

- [ ] **Step 11: Browser verification**

With `dallty-dev` running: load `/`, confirm the header/nav renders correctly in English. Switch to French via the language switcher — confirm the nav labels change, layout stays LTR, no console errors, no missing-key warnings in the console. Switch to Arabic — confirm RTL layout (sheet opens from the correct side, text flows right-to-left), nav labels in Arabic. Switch back to English. Open the mobile nav sheet in all three languages, confirm bottom nav tab labels are translated.

- [ ] **Step 12: Commit**

```bash
git add src/lib/i18n.tsx src/lib/dallty-content.ts src/lib/i18n/hooks.ts src/components/dallty/language-switcher.tsx src/components/dallty/site-nav.tsx src/components/dallty/client-shell.tsx src/routes/__root.tsx locales/en/common.json locales/fr/common.json locales/ar/common.json
git commit -m "feat: add French language support, data-driven RTL, and migrate nav/shell chrome to common.json"
```

---

## Task 6: `marketplace.json` — home page, search, categories, business cards

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/search.tsx`
- Modify: `src/components/dallty/business-card.tsx`
- Modify: `src/lib/business-category-label.ts`
- Modify: `locales/en/marketplace.json`, `locales/fr/marketplace.json`, `locales/ar/marketplace.json`
- Modify: `src/lib/dallty-content.ts` (remove the retired `copy` export and `categories` array; keep `Business` type + `businesses` seed array — see Step 6)

**Interfaces:**
- Consumes: `useTranslation` (Task 4), `preloadNamespaces` (Task 2).

- [ ] **Step 1: Write `marketplace.json`'s English content**

```json
// locales/en/marketplace.json
{
  "hero_title": "Beauty booking, made effortless.",
  "hero_sub": "Discover trusted salons, barbers and spas near you. Real availability, instant confirmation, under a minute.",
  "search_placeholder": "Try “haircut tonight near me”",
  "search_btn": "Search",
  "suggestions": ["Haircut tonight", "Massage near me", "Best barber", "Nails"],
  "stats": [["10,000+", "Salons"], ["4.9★", "Average rating"], ["60 sec", "To book"]],
  "categories_title": "What are you looking for?",
  "nearby_title": "Nearby salons",
  "nearby_sub": "Handpicked places open around you right now",
  "see_all": "See all",
  "open": "Open now",
  "closed": "Closed",
  "instant": "Instant booking",
  "km": "km away",
  "book": "Book",
  "steps_title": "Booking takes four taps",
  "steps": [
    ["Choose service", "Pick the treatment you want."],
    ["Choose date", "See real availability."],
    ["Choose time", "Morning, evening, last minute."],
    ["Confirm", "Pay now or at the salon."]
  ],
  "cta_title": "Your next appointment is one tap away.",
  "cta_sub": "Download Dallty and book in seconds.",
  "cta_btn": "Get the app",
  "categories": {
    "hair": "Hair",
    "barber": "Barber",
    "nails": "Nails",
    "spa": "Spa",
    "makeup": "Makeup",
    "lashes": "Lashes"
  },
  "business_type_fallback": "Business",
  "details": "Details",
  "driving_minutes": "min drive",
  "walking_minutes": "min walk"
}
```

- [ ] **Step 2: Write `marketplace.json`'s French content**

```json
// locales/fr/marketplace.json
{
  "hero_title": "La réservation beauté, en toute simplicité.",
  "hero_sub": "Découvrez des salons, coiffeurs et spas de confiance près de chez vous. Disponibilité réelle, confirmation instantanée, en moins d'une minute.",
  "search_placeholder": "Essayez « coupe ce soir près de moi »",
  "search_btn": "Rechercher",
  "suggestions": ["Coupe ce soir", "Massage près de moi", "Meilleur coiffeur", "Ongles"],
  "stats": [["10 000+", "Salons"], ["4,9★", "Note moyenne"], ["60 sec", "Pour réserver"]],
  "categories_title": "Que recherchez-vous ?",
  "nearby_title": "Salons à proximité",
  "nearby_sub": "Une sélection de lieux ouverts près de chez vous en ce moment",
  "see_all": "Tout voir",
  "open": "Ouvert maintenant",
  "closed": "Fermé",
  "instant": "Réservation instantanée",
  "km": "km",
  "book": "Réserver",
  "steps_title": "Réservez en quatre étapes",
  "steps": [
    ["Choisir un service", "Sélectionnez le soin que vous voulez."],
    ["Choisir une date", "Consultez les disponibilités réelles."],
    ["Choisir un horaire", "Matin, soir, dernière minute."],
    ["Confirmer", "Payez maintenant ou sur place."]
  ],
  "cta_title": "Votre prochain rendez-vous n'est qu'à un clic.",
  "cta_sub": "Téléchargez Dallty et réservez en quelques secondes.",
  "cta_btn": "Télécharger l'application",
  "categories": {
    "hair": "Cheveux",
    "barber": "Coiffeur",
    "nails": "Ongles",
    "spa": "Spa",
    "makeup": "Maquillage",
    "lashes": "Cils"
  },
  "business_type_fallback": "Établissement",
  "details": "Détails",
  "driving_minutes": "min en voiture",
  "walking_minutes": "min à pied"
}
```

- [ ] **Step 3: Write `marketplace.json`'s Arabic content**

```json
// locales/ar/marketplace.json
{
  "hero_title": "احجز جمالك بكل سهولة.",
  "hero_sub": "اكتشف أفضل الصالونات والحلاقين والسبا بالقرب منك. مواعيد حقيقية وتأكيد فوري.",
  "search_placeholder": "جرّب «قص شعر الليلة قريب مني»",
  "search_btn": "بحث",
  "suggestions": ["قص شعر الليلة", "مساج قريب مني", "أفضل حلاق", "أظافر"],
  "stats": [["+10,000", "صالون"], ["4.9★", "متوسط التقييم"], ["60 ثانية", "للحجز"]],
  "categories_title": "عن ماذا تبحث؟",
  "nearby_title": "صالونات قريبة",
  "nearby_sub": "أماكن مختارة ومفتوحة الآن بالقرب منك",
  "see_all": "عرض الكل",
  "open": "مفتوح الآن",
  "closed": "مغلق",
  "instant": "حجز فوري",
  "km": "كم",
  "book": "احجز",
  "steps_title": "الحجز في أربع خطوات",
  "steps": [
    ["اختر الخدمة", "حدد الخدمة التي تريدها."],
    ["اختر اليوم", "مواعيد متاحة فعلياً."],
    ["اختر الوقت", "صباحاً أو مساءً أو فوراً."],
    ["أكّد الحجز", "ادفع الآن أو في الصالون."]
  ],
  "cta_title": "موعدك القادم على بعد نقرة واحدة.",
  "cta_sub": "حمّل دلّتي واحجز في ثوانٍ.",
  "cta_btn": "حمّل التطبيق",
  "categories": {
    "hair": "شعر",
    "barber": "حلاقة",
    "nails": "أظافر",
    "spa": "سبا",
    "makeup": "مكياج",
    "lashes": "رموش"
  },
  "business_type_fallback": "نشاط تجاري",
  "details": "التفاصيل",
  "driving_minutes": "د بالسيارة",
  "walking_minutes": "د مشياً"
}
```

- [ ] **Step 4: Migrate `index.tsx`**

Add the route's `loader` (or extend the existing one, if `index.tsx` already has one — read the file first) to preload:

```ts
loader: async ({ context }) => {
  await preloadNamespaces(context.lang, ["marketplace", "common"]);
},
```

Replace `const { lang, t, toggleLang } = useLocale();` with `const { lang } = useLocale();` plus `const { t } = useTranslation("marketplace");` (for marketplace-domain keys) and a second `useTranslation("common")` where `t.tabs`/menu content is needed (the `BottomNav` at the bottom of the file). Replace every `t.X` reference:
- `t.dir` → `dirFor(lang)` (import from `@/lib/i18n`)
- `t.heroTitle` → `t("hero_title")`, `t.heroSub` → `t("hero_sub")`, `t.searchBtn` → `t("search_btn")`
- `t.stats.map(...)` → `t("stats")` returns the array as-is (interpolation only applies to string values, so `t()` called on an array-valued key needs a small carve-out — see note below)
- `t.categoriesTitle` → `t("categories_title")`, `t.nearbyTitle` → `t("nearby_title")`, `t.nearbySub` → `t("nearby_sub")`, `t.seeAll` → `t("see_all")`
- `t.stepsTitle` → `t("steps_title")`, `t.steps.map(...)` → `t("steps")` (array)
- `t.ctaTitle` → `t("cta_title")`, `t.ctaSub` → `t("cta_sub")`, `t.ctaBtn` → `t("cta_btn")`
- `t.menu.X` → use a second `useTranslation("common")` call's `t("menu.X")`
- `t.footer` → `useTranslation("common")`'s `t("footer")`
- `t.tabs` (passed to `<BottomNav>`) → build the array from `common`'s `nav.*` keys, same pattern as Task 5 Step 9.

**Array-valued keys note:** `useTranslation`'s `t()` (Task 4) types its return as `string` and calls `interpolate()` on it, which assumes a string. `stats`, `suggestions`, and `steps` are arrays. Add a second accessor to the hook for this, since forcing everything through the string-only `t()` would require an unsafe cast at every call site:

```ts
// add to src/lib/i18n/hooks.ts, alongside t():
function tArray(key: NamespaceKeyMap[N]): unknown[] {
  for (const { dict } of dicts) {
    if (!dict) continue;
    const value = getPath(dict, key as string);
    if (Array.isArray(value)) return value;
  }
  if (import.meta.env.DEV) {
    console.warn(`[i18n] missing array key "${String(key)}"`);
  }
  return [];
}

return { t, tArray };
```

Use `tArray("stats")`, `tArray("suggestions")`, `tArray("steps")` in `index.tsx` in place of the old `t.stats`/`t.steps` array access.

- [ ] **Step 5: Migrate `search.tsx`**

Same pattern as `index.tsx` Step 4, but `search.tsx` only used `t.dir`, `t.searchBtn`, `t.tabs` — a much smaller diff. Add the same `loader` namespace preload (`["marketplace", "common"]`), replace those three references the same way.

- [ ] **Step 6: Migrate `business-card.tsx`**

Replace the two `lang === "ar" ? X : Y` ternaries (driving/walking minutes) with `useTranslation("marketplace")`'s `t("driving_minutes")`/`t("walking_minutes")`. Replace `lang === "ar" ? "التفاصيل" : "Details"` with `t("details")`. The `business[lang]` and `t.open`/`t.closed`/`t.instant`/`t.book`/`t.km` references — `t` here currently comes from `copy[lang]` (`const t = copy[lang];` near the top of the component, confirm exact line via a fresh read of the file since it may have shifted) — replace with `useTranslation("marketplace")`'s `t("open")`/`t("closed")`/`t("instant")`/`t("book")`/`t("km")`. `business[lang].name`/`.area`/`.tags` (the `Business`-type per-listing bilingual fields) stay exactly as-is — that's seed/fallback listing data, explicitly out of scope (see Step 6's note in the File Structure section above); it does NOT get a `fr` variant in this plan, since `Business`'s type only has `en`/`ar` and extending it is deferred along with the rest of `use-live-businesses.ts`'s fallback data.

`BusinessCard` receives `lang: Lang` as a prop from its caller — that stays unchanged; the component internally now also calls `useTranslation("marketplace")` for app-chrome strings, independent of the `lang` prop used for the business's own bilingual fields.

- [ ] **Step 7: Migrate `business-category-label.ts`**

This is a plain function, not a component, so it can't call `useTranslation()` (a hook) directly. Change its signature to accept the resolved fallback string as a parameter instead of computing it internally:

```ts
// before: businessCategoryLabel(categories, businessCategories, lang) internally did
//   if (!first) return lang === "ar" ? "نشاط تجاري" : "Business";
// after:
export function businessCategoryLabel(
  categories: Category[],
  businessCategories: string[] | null,
  lang: string,
  fallback: string,
): string | null {
  // ...same lookup logic...
  if (!first) return fallback;
  // ...
}
```

Update its one call site (`business-overview.tsx`) to pass the translated fallback:

```tsx
const { t } = useTranslation("marketplace");
// ...
businessCategoryLabel(categories, business.categories, lang, t("business_type_fallback"))
```

- [ ] **Step 8: Remove the retired `copy` export and `categories` array from `dallty-content.ts`**

Delete the `copy` object and the `categories` array (both now fully replaced by `marketplace.json`/`common.json`). Keep `Lang` (still re-exported, now `"en" | "fr" | "ar"` per Task 5 Step 4), `Business` type, and the `businesses` seed array exactly as-is — these are unrelated fallback/demo listing data, not app-chrome translations, and stay out of scope for this plan.

Grep for any remaining `import { categories } from "@/lib/dallty-content"` or `import { copy` after this deletion — `tsc` will catch any missed import as a build error, which is the intended safety net; fix each one found.

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit` and `npx eslint src/routes/index.tsx src/routes/search.tsx src/components/dallty/business-card.tsx src/lib/business-category-label.ts src/components/dallty/business-overview.tsx src/lib/dallty-content.ts src/lib/i18n/hooks.ts`
Expected: zero errors.

- [ ] **Step 10: Browser verification**

Load `/` in English — confirm hero, stats, categories, nearby section, steps, CTA, footer all render. Switch to French — confirm every section re-renders in French with no missing-key console warnings, category pills show French labels. Switch to Arabic — confirm RTL + Arabic content, category pills. Load `/search` in all three languages, confirm the search bar placeholder and tabs translate. Confirm a business card's "Details"/"Book" labels and driving/walking-time labels translate in all three languages (use the browser's network/console tools to confirm no `[i18n] missing key` warnings fire).

- [ ] **Step 11: Commit**

```bash
git add src/routes/index.tsx src/routes/search.tsx src/components/dallty/business-card.tsx src/lib/business-category-label.ts src/components/dallty/business-overview.tsx src/lib/dallty-content.ts src/lib/i18n/hooks.ts locales/en/marketplace.json locales/fr/marketplace.json locales/ar/marketplace.json
git commit -m "feat: migrate home page, search, and business cards to marketplace.json"
```

---

## Task 7: `auth.json` — sign-in/sign-up, password policy, password strength

**Files:**
- Modify: `src/routes/auth.tsx`
- Modify: `src/lib/password-policy.ts`
- Modify: `src/components/dallty/password-strength.tsx`
- Modify: `locales/en/auth.json`, `locales/fr/auth.json`, `locales/ar/auth.json`

**Interfaces:**
- Consumes: `useTranslation` (Task 4).
- Produces: `PasswordRule.labelKey: string` (replacing `label`/`labelAr`) — this is an internal type change to `password-policy.ts`, not consumed elsewhere per the earlier dependency check (only `account-security.tsx`, `password-strength.tsx`, `reset-password.tsx` import from this file, and only `password-strength.tsx` reads `.label`/`.labelAr`).

- [ ] **Step 1: Write `auth.json`'s English content**

```json
// locales/en/auth.json
{
  "sign_in_title": "Welcome back",
  "sign_up_title": "Create your account",
  "sign_in_sub": "Sign in to manage your bookings.",
  "sign_up_sub": "Pick how you'll use Dallty. You can book in seconds after this.",
  "full_name": "Full name",
  "phone": "Phone number",
  "phone_invalid": "Enter a valid phone number so salons can reach you.",
  "email": "Email",
  "password": "Password",
  "remember": "Remember me",
  "forgot": "Forgot password?",
  "sign_in": "Sign in",
  "sign_up": "Create account",
  "or": "or",
  "google": "Continue with Google",
  "apple": "Continue with Apple",
  "apple_soon": "Coming soon",
  "new_here": "New to Dallty?",
  "have_account": "Already have an account?",
  "switch_sign_up": "Create an account",
  "switch_sign_in": "Sign in",
  "business": "Business owner? Register your business",
  "join_team": "I work at a business",
  "check_email": "Check your email to confirm your account.",
  "signed_in": "Signed in",
  "welcome": "Welcome to Dallty",
  "reset_sent": "Password reset link sent — check your inbox.",
  "enter_email": "Enter your email first, then tap Forgot password.",
  "password_strength": { "weak": "Weak", "good": "Good", "strong": "Strong" },
  "password_rule": {
    "length": "At least 8 characters",
    "letter": "Contains letters",
    "number": "Contains numbers",
    "upper": "One uppercase letter",
    "lower": "One lowercase letter",
    "symbol": "One symbol"
  }
}
```

- [ ] **Step 2: Write `auth.json`'s French content**

```json
// locales/fr/auth.json
{
  "sign_in_title": "Content de vous revoir",
  "sign_up_title": "Créez votre compte",
  "sign_in_sub": "Connectez-vous pour gérer vos réservations.",
  "sign_up_sub": "Choisissez comment vous voulez utiliser Dallty. Vous pourrez réserver en quelques secondes ensuite.",
  "full_name": "Nom complet",
  "phone": "Numéro de téléphone",
  "phone_invalid": "Entrez un numéro de téléphone valide pour que les salons puissent vous joindre.",
  "email": "E-mail",
  "password": "Mot de passe",
  "remember": "Se souvenir de moi",
  "forgot": "Mot de passe oublié ?",
  "sign_in": "Se connecter",
  "sign_up": "Créer un compte",
  "or": "ou",
  "google": "Continuer avec Google",
  "apple": "Continuer avec Apple",
  "apple_soon": "Bientôt disponible",
  "new_here": "Nouveau sur Dallty ?",
  "have_account": "Vous avez déjà un compte ?",
  "switch_sign_up": "Créer un compte",
  "switch_sign_in": "Se connecter",
  "business": "Propriétaire d'un salon ? Inscrivez votre établissement",
  "join_team": "Je travaille dans un établissement",
  "check_email": "Vérifiez votre e-mail pour confirmer votre compte.",
  "signed_in": "Connecté",
  "welcome": "Bienvenue sur Dallty",
  "reset_sent": "Lien de réinitialisation envoyé — vérifiez votre boîte de réception.",
  "enter_email": "Entrez d'abord votre e-mail, puis appuyez sur Mot de passe oublié.",
  "password_strength": { "weak": "Faible", "good": "Correct", "strong": "Fort" },
  "password_rule": {
    "length": "Au moins 8 caractères",
    "letter": "Contient des lettres",
    "number": "Contient des chiffres",
    "upper": "Une majuscule",
    "lower": "Une minuscule",
    "symbol": "Un symbole"
  }
}
```

- [ ] **Step 3: Write `auth.json`'s Arabic content**

```json
// locales/ar/auth.json
{
  "sign_in_title": "أهلاً بعودتك",
  "sign_up_title": "أنشئ حسابك",
  "sign_in_sub": "سجّل الدخول لإدارة حجوزاتك.",
  "sign_up_sub": "اختر كيف تريد استخدام دلّتي. يمكنك الحجز خلال ثوانٍ بعد ذلك.",
  "full_name": "الاسم الكامل",
  "phone": "رقم الهاتف",
  "phone_invalid": "أدخل رقم هاتف صحيح ليتمكن الصالون من التواصل معك.",
  "email": "البريد الإلكتروني",
  "password": "كلمة المرور",
  "remember": "تذكرني",
  "forgot": "نسيت كلمة المرور؟",
  "sign_in": "تسجيل الدخول",
  "sign_up": "إنشاء حساب",
  "or": "أو",
  "google": "المتابعة عبر Google",
  "apple": "المتابعة عبر Apple",
  "apple_soon": "قريباً",
  "new_here": "جديد على دلّتي؟",
  "have_account": "لديك حساب بالفعل؟",
  "switch_sign_up": "أنشئ حساباً",
  "switch_sign_in": "تسجيل الدخول",
  "business": "صاحب صالون؟ سجّل نشاطك التجاري",
  "join_team": "أعمل في نشاط تجاري",
  "check_email": "تحقق من بريدك لتأكيد الحساب.",
  "signed_in": "تم تسجيل الدخول",
  "welcome": "أهلاً بك في دلّتي",
  "reset_sent": "تم إرسال رابط إعادة التعيين إلى بريدك.",
  "enter_email": "أدخل بريدك أولاً ثم اضغط نسيت كلمة المرور.",
  "password_strength": { "weak": "ضعيفة", "good": "جيدة", "strong": "قوية" },
  "password_rule": {
    "length": "٨ أحرف على الأقل",
    "letter": "يحتوي على أحرف",
    "number": "يحتوي على أرقام",
    "upper": "حرف كبير واحد",
    "lower": "حرف صغير واحد",
    "symbol": "رمز خاص واحد"
  }
}
```

- [ ] **Step 4: Migrate `auth.tsx`**

Delete the local `const copy = { en: {...}, ar: {...} };` object entirely. Replace `const { lang: locale } = useLocale(); const t = copy[locale];` with `const { lang: locale } = useLocale(); const { t } = useTranslation("auth");`. Every existing `t.X` call site in the file (confirmed list: `t.phoneInvalid`, `t.checkEmail`, `t.welcome`, `t.signedIn`, `t.enterEmail`, `t.resetSent`, `t.signInTitle`, `t.signUpTitle`, `t.signInSub`, `t.signUpSub`, `t.fullName`, `t.phone`, `t.email`, `t.password`, `t.remember`, `t.forgot`, `t.signIn`, `t.signUp`, `t.or`, `t.google`, `t.appleSoon`, `t.apple`, `t.newHere`, `t.haveAccount`, `t.switchSignUp`, `t.switchSignIn`, `t.business`, `t.joinTeam`) becomes `t("phone_invalid")`, `t("check_email")`, `t("welcome")`, `t("signed_in")`, `t("enter_email")`, `t("reset_sent")`, `t("sign_in_title")`, `t("sign_up_title")`, `t("sign_in_sub")`, `t("sign_up_sub")`, `t("full_name")`, `t("phone")`, `t("email")`, `t("password")`, `t("remember")`, `t("forgot")`, `t("sign_in")`, `t("sign_up")`, `t("or")`, `t("google")`, `t("apple_soon")`, `t("apple")`, `t("new_here")`, `t("have_account")`, `t("switch_sign_up")`, `t("switch_sign_in")`, `t("business")`, `t("join_team")` respectively — TypeScript's compile-time key checking (Task 3) will flag any missed or mistyped call site as a build error, so run `tsc` after this rename pass and fix everything it flags before moving on.

`const dir = locale === "ar" ? "rtl" : "ltr";` becomes `const dir = dirFor(locale);` (import `dirFor` from `@/lib/i18n`).

Add the route's `loader` to preload `["auth", "common"]` for the resolved language (`auth.tsx`'s own route file — confirm the exact `createFileRoute` export name and existing loader, if any, via a fresh read).

- [ ] **Step 5: Migrate `password-policy.ts`**

Replace every rule's `label`/`labelAr` pair with a single `labelKey`:

```ts
export type PasswordRule = {
  id: string;
  labelKey: "length" | "letter" | "number" | "upper" | "lower" | "symbol";
  test: (value: string) => boolean;
};

const CLIENT_RULES: PasswordRule[] = [
  { id: "length", labelKey: "length", test: (v) => v.length >= 8 },
  { id: "letter", labelKey: "letter", test: (v) => /[A-Za-z]/.test(v) },
  { id: "number", labelKey: "number", test: (v) => /\d/.test(v) },
];

const PRIVILEGED_RULES: PasswordRule[] = [
  { id: "length", labelKey: "length", test: (v) => v.length >= 8 },
  { id: "upper", labelKey: "upper", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", labelKey: "lower", test: (v) => /[a-z]/.test(v) },
  { id: "number", labelKey: "number", test: (v) => /\d/.test(v) },
  { id: "symbol", labelKey: "symbol", test: (v) => /[^A-Za-z0-9]/.test(v) },
];
```

- [ ] **Step 6: Migrate `password-strength.tsx`**

Remove the `lang?: "en" | "ar"` prop entirely — the component now sources its own language from context via `useTranslation`, fixing the pre-existing bug where `account-security.tsx` and `reset-password.tsx` never passed `lang` and so always showed English regardless of active language. Replace the local `levelLabel` ternary-dictionary with `t("password_strength.weak")`/`.good`/`.strong`, and `c.rule.label`/`.labelAr` with `t(\`password_rule.${c.rule.labelKey}\`)`:

```tsx
export function PasswordStrength({
  value,
  policy = "privileged",
  className = "",
}: {
  value: string;
  policy?: PasswordPolicyId;
  className?: string;
}) {
  const { t } = useTranslation("auth");
  const checks = useMemo(() => checkPassword(value, policy), [value, policy]);
  // ...
  const levelLabel = t(`password_strength.${level}`);
  // ...
  {t(`password_rule.${c.rule.labelKey}`)}
```

Note: `t()`'s TypeScript signature (Task 4) types `key` as the generated union for the namespace, and a template-literal key like `` `password_strength.${level}` `` won't narrow to that union statically — this specific call site needs an `as NamespaceKeyMap["auth"]` cast (safe here since `level` is itself a `"weak" | "good" | "strong"` union matching the JSON's three keys exactly, and `labelKey` is similarly constrained). Add the cast rather than fighting the type system for one dynamic-key call site.

Update the two callers (`account-security.tsx` line ~530, `reset-password.tsx` line ~135) to drop the (never-passed) `lang` prop — no change needed there since it was never passed, just confirm via `tsc` that removing the prop from the type doesn't break anything (it won't, since neither caller supplied it).

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit` and `npx eslint src/routes/auth.tsx src/lib/password-policy.ts src/components/dallty/password-strength.tsx`
Expected: zero errors.

- [ ] **Step 8: Browser verification**

Load `/auth` in English — confirm sign-in/sign-up forms, password strength checklist. Type a weak password, confirm the checklist updates live. Switch to French mid-flow (if the language switcher is reachable from this page) or navigate fresh in French — confirm every label, the password strength bar text, and rule checklist show French. Same for Arabic (RTL layout, Arabic labels). Confirm `/reset-password` (a page that never passed `lang` to `PasswordStrength` before) now correctly shows the checklist in whatever the active app language is, not always English — this is the bug-fix verification for Step 6.

- [ ] **Step 9: Commit**

```bash
git add src/routes/auth.tsx src/lib/password-policy.ts src/components/dallty/password-strength.tsx locales/en/auth.json locales/fr/auth.json locales/ar/auth.json
git commit -m "feat: migrate auth forms and password strength to auth.json, fix password-strength always showing English"
```

---

## Task 8: `booking.json` — cancel-booking dialogs (customer + admin)

**Files:**
- Modify: `src/routes/_authenticated/bookings.tsx`
- Modify: `src/routes/_authenticated/admin/appointments.tsx`
- Modify: `src/routes/_authenticated/admin/my-appointments.tsx`
- Modify: `locales/en/booking.json`, `locales/fr/booking.json`, `locales/ar/booking.json`

**Interfaces:**
- Consumes: `useTranslation` (Task 4).

- [ ] **Step 1: Write `booking.json`'s English content**

```json
// locales/en/booking.json
{
  "cancel_confirm_body": "Are you sure you want to cancel this appointment? This action cannot be undone.",
  "customer": {
    "cancel_title": "Cancel booking?",
    "keep": "Keep booking",
    "confirm": "Cancel appointment"
  },
  "admin": {
    "cancel_title": "Cancel appointment?",
    "keep": "Keep appointment",
    "confirm": "Cancel appointment"
  }
}
```

- [ ] **Step 2: Write `booking.json`'s French content**

```json
// locales/fr/booking.json
{
  "cancel_confirm_body": "Voulez-vous vraiment annuler ce rendez-vous ? Cette action est irréversible.",
  "customer": {
    "cancel_title": "Annuler la réservation ?",
    "keep": "Conserver la réservation",
    "confirm": "Annuler le rendez-vous"
  },
  "admin": {
    "cancel_title": "Annuler le rendez-vous ?",
    "keep": "Conserver le rendez-vous",
    "confirm": "Annuler le rendez-vous"
  }
}
```

- [ ] **Step 3: Write `booking.json`'s Arabic content**

```json
// locales/ar/booking.json
{
  "cancel_confirm_body": "هل أنت متأكد من إلغاء هذا الموعد؟ لا يمكن التراجع عن هذا الإجراء.",
  "customer": {
    "cancel_title": "إلغاء الحجز؟",
    "keep": "احتفظ بالحجز",
    "confirm": "إلغاء الموعد"
  },
  "admin": {
    "cancel_title": "إلغاء الموعد؟",
    "keep": "احتفظ بالموعد",
    "confirm": "إلغاء الموعد"
  }
}
```

- [ ] **Step 4: Migrate `bookings.tsx`**

Replace `const { pick } = useLocale();` with `const { t } = useTranslation("booking");`. Replace the four `pick(...)` calls:
- `pick("Cancel booking?", "إلغاء الحجز؟")` → `t("customer.cancel_title")`
- `pick("Are you sure...", "هل أنت متأكد...")` → `t("cancel_confirm_body")`
- `pick("Keep booking", "احتفظ بالحجز")` → `t("customer.keep")`
- `pick("Cancel appointment", "إلغاء الموعد")` → `t("customer.confirm")`

Add the route's `loader` to preload `["booking", "common"]`.

- [ ] **Step 5: Migrate `admin/appointments.tsx`**

Same pattern, using `t("admin.cancel_title")`, `t("cancel_confirm_body")`, `t("admin.keep")`, `t("admin.confirm")`. Add the route's `loader` to preload `["booking", "common"]`.

- [ ] **Step 6: Migrate `admin/my-appointments.tsx`**

Identical migration to Step 5 (this file's cancel dialog is byte-for-byte the same content as `admin/appointments.tsx`).

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit` and `npx eslint src/routes/_authenticated/bookings.tsx src/routes/_authenticated/admin/appointments.tsx src/routes/_authenticated/admin/my-appointments.tsx`
Expected: zero errors.

- [ ] **Step 8: Browser verification**

On `/bookings` (customer), open the cancel-booking dialog in English, French, and Arabic — confirm the title/body/buttons translate and the dialog still functions (cancel actually cancels). Repeat on `/admin/appointments` and `/admin/my-appointments` (requires an authenticated business-owner/staff session — if not reachable without a real login in this environment, verify via source review that the `t()` calls resolve correctly and defer the live click-through to Task 12's final sweep).

- [ ] **Step 9: Commit**

```bash
git add src/routes/_authenticated/bookings.tsx src/routes/_authenticated/admin/appointments.tsx src/routes/_authenticated/admin/my-appointments.tsx locales/en/booking.json locales/fr/booking.json locales/ar/booking.json
git commit -m "feat: migrate cancel-booking dialogs to booking.json"
```

---

## Task 9: `notifications.json` — notification center + date-fns locale fix

**Files:**
- Modify: `src/components/dallty/notification-center.tsx`
- Modify: `locales/en/notifications.json`, `locales/fr/notifications.json`, `locales/ar/notifications.json`

**Interfaces:**
- Consumes: `useTranslation` (Task 4), `dateFnsLocaleFor` (Task 5).

- [ ] **Step 1: Write `notifications.json` content (all three languages)**

```json
// locales/en/notifications.json
{ "title": "Notifications", "mark_all_read": "Mark all read", "loading": "Loading…", "empty": "You're all caught up.", "unread": "unread" }
```

```json
// locales/fr/notifications.json
{ "title": "Notifications", "mark_all_read": "Tout marquer comme lu", "loading": "Chargement…", "empty": "Vous êtes à jour.", "unread": "non lu" }
```

```json
// locales/ar/notifications.json
{ "title": "الإشعارات", "mark_all_read": "تعليم الكل كمقروء", "loading": "جارٍ التحميل…", "empty": "لا توجد إشعارات جديدة.", "unread": "غير مقروء" }
```

- [ ] **Step 2: Migrate `notification-center.tsx`**

Delete the local `strings` object. Replace `const { lang } = useLocale(); const t = strings[lang === "ar" ? "ar" : "en"];` with:

```ts
const { lang } = useLocale();
const { t } = useTranslation("notifications");
```

Every `t.title`/`t.markAll`/`t.loading`/`t.empty`/`t.unread` becomes `t("title")`/`t("mark_all_read")`/`t("loading")`/`t("empty")`/`t("unread")`.

Fix the date-fns locale bug: replace `locale: lang === "ar" ? arDZ : enUS` with `locale: dateFnsLocaleFor(lang)` (import `dateFnsLocaleFor` from `@/lib/i18n`, drop the now-unused `import { arDZ, enUS } from "date-fns/locale";`).

Register this namespace in the parent route's loader (this component renders inside `site-nav.tsx`'s header and `admin-shell.tsx`'s topbar — both are shell chrome without their own route loader per se; add `preloadNamespaces(lang, ["notifications"])` directly inside `NotificationCenter`'s own effect, or — simpler and consistent with the rest of this plan — add it to the root layout's always-preloaded set alongside `common` from Task 5 Step 6, since the bell icon appears on nearly every authenticated page).

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/dallty/notification-center.tsx`
Expected: zero errors.

- [ ] **Step 4: Browser verification**

Sign in (or use an already-authenticated browser session if available), open the notification bell in English, French, Arabic — confirm title/empty-state/mark-all-read text translates. If any notifications exist with a relative timestamp ("2 hours ago"), confirm it renders in French date-fns formatting when the language is French (this is the specific bug this step fixes — previously it would have silently stayed in English formatting).

- [ ] **Step 5: Commit**

```bash
git add src/components/dallty/notification-center.tsx locales/en/notifications.json locales/fr/notifications.json locales/ar/notifications.json
git commit -m "feat: migrate notification center to notifications.json, fix French date-fns locale bug"
```

---

## Task 10: Business detail page — namespace preloading (no new content)

**Files:**
- Modify: `src/routes/business.$businessSlug.tsx`

**Interfaces:**
- Consumes: `preloadNamespaces` (Task 2).

This route's own inline content (booking-flow toasts, tab labels) is hardcoded English-only today — it was never bilingual, so it's not part of "migrate the existing translated surface" and stays out of scope (deferred to a future content pass). The route DOES need to preload namespaces for its child component `BusinessOverview`, which calls `businessCategoryLabel(...)` (migrated in Task 6) and therefore needs `marketplace` loaded.

- [ ] **Step 1: Add namespace preloading to the route loader**

```ts
loader: async ({ context }) => {
  await preloadNamespaces(context.lang, ["marketplace", "common"]);
},
```

(Confirm the exact `context.lang` access pattern by reading how Task 6's `index.tsx`/`search.tsx` loaders resolved it, for consistency — TanStack Start route context conventions should already be established by that point in execution.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Browser verification**

Load `/business/<any-real-slug>` in English, French, Arabic — confirm the business type badge (from `businessCategoryLabel`) shows the correct translated fallback/category text in each language, with no console warnings about missing namespaces.

- [ ] **Step 4: Commit**

```bash
git add src/routes/business.\$businessSlug.tsx
git commit -m "feat: preload marketplace/common namespaces on the business detail route"
```

---

## Task 11: `admin-shell.tsx` — the business dashboard shell

The largest single migration in this plan. `admin-shell.tsx` uses its own `label`/`labelAr` field-pair pattern (not the `copy` object), and several of its strings — section headings, quick actions, the command palette, the marketplace-status banner — currently have **no Arabic translation at all** (always rendered in English regardless of language). This task both relocates existing bilingual content and writes the missing Arabic for the first time, plus French for everything.

**Files:**
- Modify: `src/components/admin/admin-shell.tsx`
- Modify: `locales/en/common.json`, `locales/fr/common.json`, `locales/ar/common.json` (additions)
- Modify: `locales/en/booking.json`, `locales/fr/booking.json`, `locales/ar/booking.json` (additions)
- Modify: `locales/en/customer.json`, `locales/fr/customer.json`, `locales/ar/customer.json` (first content — was empty)
- Modify: `locales/en/services.json`, `locales/fr/services.json`, `locales/ar/services.json` (first content — was empty)
- Modify: `locales/en/staff.json`, `locales/fr/staff.json`, `locales/ar/staff.json` (first content — was empty)
- Modify: `locales/en/reviews.json`, `locales/fr/reviews.json`, `locales/ar/reviews.json` (first content — was empty)
- Modify: `locales/en/payments.json`, `locales/fr/payments.json`, `locales/ar/payments.json` (first content — was empty)
- Modify: `locales/en/reports.json`, `locales/fr/reports.json`, `locales/ar/reports.json` (first content — was empty)
- Modify: `locales/en/settings.json`, `locales/fr/settings.json`, `locales/ar/settings.json` (first content — was empty)
- Modify: `locales/en/marketplace.json`, `locales/fr/marketplace.json`, `locales/ar/marketplace.json` (additions)
- Modify: `locales/en/platform.json`, `locales/fr/platform.json`, `locales/ar/platform.json` (first content — was empty)

**Interfaces:**
- Consumes: `useTranslation` (Task 4), `preloadNamespaces` (Task 2).

- [ ] **Step 1: Namespace mapping table — read this before writing any JSON**

Every nav item and string in `admin-shell.tsx` maps to exactly one namespace + key below. This table is the single source of truth for Steps 2–9; follow it exactly so the eventual `t()` calls in Step 10 line up.

| Current content | Namespace | Key |
|---|---|---|
| "Dashboard" nav item | `common` | `menu.dashboard` (reuse — already exists from Task 5) |
| "Calendar" (admin), "My calendar" (staff) | `booking` | `nav_calendar`, `nav_my_calendar` |
| "Bookings" (admin, → /admin/appointments) | `booking` | `nav_appointments` |
| "My appointments" (staff) | `booking` | `nav_my_appointments` |
| "My hours" (staff) | `staff` | `nav_my_hours` |
| "Open calendar" (quick action) | `booking` | `quick_open_calendar` |
| "New booking" (quick action) | `booking` | `quick_new_booking` |
| "Clients" nav item | `customer` | `nav_clients` |
| "Add client" (quick action) | `customer` | `quick_add_client` |
| "Customers" (command palette heading) | `customer` | `palette_heading` |
| "Services" nav item | `services` | `nav_services` |
| "Add service" (quick action) | `services` | `quick_add_service` |
| "Services" (command palette heading) | `services` | `palette_heading` |
| "Specialists" nav item (both admin + staff sections) | `staff` | `nav_specialists` |
| "Add specialist" (quick action) | `staff` | `quick_add_specialist` |
| "Specialists" (command palette heading) | `staff` | `palette_heading` |
| "Reviews" nav item (both sections) | `reviews` | `nav_reviews` |
| "Payments" nav item | `payments` | `nav_payments` |
| "Reports" nav item | `reports` | `nav_reports` |
| "Billing" nav item (soon badge) | `payments` | `nav_billing` |
| "Notifications" nav item | `common` | `menu.notifications` (reuse) |
| "Business settings" nav item | `settings` | `nav_business_settings` |
| "Marketplace status" nav item | `settings` | `nav_marketplace_status` |
| Marketplace-status banner (4 status variants + helper + trial line) | `settings` | `banner_*` (see Step 2) |
| "Today" / "Business" / "Finance" / "Account" section headings | `common` | `section_today`, `section_business`, `section_finance`, `section_account` |
| "My work" / "Feedback" section headings (staff) | `common` | `section_my_work`, `section_feedback` |
| "Platform" section heading | `platform` | `nav_section_label` |
| "Manage any business" | `platform` | `manage_any_business` |
| "Global data" | `platform` | `nav_overview` |
| "Directory" | `platform` | `nav_directory` |
| "Businesses" | `platform` | `nav_businesses` |
| "Marketplace approvals" | `platform` | `nav_marketplace_approvals` |
| "Platform users" | `platform` | `nav_users` |
| "Categories" | `platform` | `nav_categories` |
| "Reserved URLs" | `platform` | `nav_reserved_slugs` |
| "Countries" | `platform` | `nav_countries` |
| "Auth policies" | `platform` | `nav_auth_policies` |
| "Soon" badge | `common` | `soon` |
| Command palette placeholder, "No matches.", "Go to", "Unnamed" fallback | `common` | `palette_placeholder`, `palette_no_matches`, `palette_go_to`, `palette_unnamed` |
| "Sign out" | `common` | `menu.sign_out` (reuse) |
| "Close menu" / "Open menu" (aria-labels) | `common` | `close_menu`, `open_menu` |
| "Quick create" / "Create" | `common` | `quick_create_label`, `quick_create` |
| "Switch language" (aria-label) | `common` | `switch_language` |
| "Toggle dark mode" (aria-label) | `common` | `toggle_dark_mode` |
| "Live support" (aria-label) | `common` | `live_support` |
| "Customer app" | `common` | `customer_app` |
| "Dallty Business" (brand line) / "Business" (subtitle) | `common` | `brand_business`, `brand_business_subtitle` |

- [ ] **Step 2: Write the marketplace-status banner keys (`settings.json`) — English**

```json
// locales/en/settings.json
{
  "nav_business_settings": "Business settings",
  "nav_marketplace_status": "Marketplace status",
  "banner_pending_review": "Your business is under marketplace review",
  "banner_rejected": "Your business was not approved for the marketplace",
  "banner_hidden": "Your business is hidden from the marketplace",
  "banner_not_listed": "Your business is not listed yet",
  "banner_helper": "You have full access to your dashboard — only public marketplace visibility is affected.",
  "banner_trial_ends": "Trial ends {{date}}."
}
```

- [ ] **Step 3: `settings.json` French and Arabic**

```json
// locales/fr/settings.json
{
  "nav_business_settings": "Paramètres du salon",
  "nav_marketplace_status": "Statut sur la marketplace",
  "banner_pending_review": "Votre établissement est en cours d'examen pour la marketplace",
  "banner_rejected": "Votre établissement n'a pas été approuvé pour la marketplace",
  "banner_hidden": "Votre établissement est masqué sur la marketplace",
  "banner_not_listed": "Votre établissement n'est pas encore répertorié",
  "banner_helper": "Vous avez un accès complet à votre tableau de bord — seule la visibilité publique sur la marketplace est concernée.",
  "banner_trial_ends": "L'essai se termine le {{date}}."
}
```

```json
// locales/ar/settings.json
{
  "nav_business_settings": "إعدادات النشاط التجاري",
  "nav_marketplace_status": "حالة المتجر",
  "banner_pending_review": "نشاطك التجاري قيد المراجعة للانضمام إلى المتجر",
  "banner_rejected": "لم تتم الموافقة على نشاطك التجاري للانضمام إلى المتجر",
  "banner_hidden": "نشاطك التجاري مخفي عن المتجر",
  "banner_not_listed": "نشاطك التجاري غير مدرج بعد",
  "banner_helper": "لديك وصول كامل إلى لوحة التحكم الخاصة بك — فقط الظهور العام في المتجر متأثر.",
  "banner_trial_ends": "تنتهي الفترة التجريبية في {{date}}."
}
```

- [ ] **Step 4: `booking.json`, `customer.json`, `services.json`, `staff.json`, `reviews.json`, `payments.json`, `reports.json` additions — English**

```json
// additions to locales/en/booking.json (merge into the existing file from Task 8, don't overwrite it)
{
  "nav_calendar": "Calendar",
  "nav_my_calendar": "My calendar",
  "nav_appointments": "Bookings",
  "nav_my_appointments": "My appointments",
  "quick_open_calendar": "Open calendar",
  "quick_new_booking": "New booking"
}
```

```json
// locales/en/customer.json
{ "nav_clients": "Clients", "quick_add_client": "Add client", "palette_heading": "Customers" }
```

```json
// locales/en/services.json
{ "nav_services": "Services", "quick_add_service": "Add service", "palette_heading": "Services" }
```

```json
// locales/en/staff.json
{
  "nav_specialists": "Specialists",
  "quick_add_specialist": "Add specialist",
  "palette_heading": "Specialists",
  "nav_my_hours": "My hours"
}
```

```json
// locales/en/reviews.json
{ "nav_reviews": "Reviews" }
```

```json
// locales/en/payments.json
{ "nav_payments": "Payments", "nav_billing": "Billing" }
```

```json
// locales/en/reports.json
{ "nav_reports": "Reports" }
```

- [ ] **Step 5: Same additions — French**

```json
// additions to locales/fr/booking.json
{
  "nav_calendar": "Calendrier",
  "nav_my_calendar": "Mon calendrier",
  "nav_appointments": "Réservations",
  "nav_my_appointments": "Mes rendez-vous",
  "quick_open_calendar": "Ouvrir le calendrier",
  "quick_new_booking": "Nouvelle réservation"
}
```

```json
// locales/fr/customer.json
{ "nav_clients": "Clients", "quick_add_client": "Ajouter un client", "palette_heading": "Clients" }
```

```json
// locales/fr/services.json
{ "nav_services": "Services", "quick_add_service": "Ajouter un service", "palette_heading": "Services" }
```

```json
// locales/fr/staff.json
{
  "nav_specialists": "Spécialistes",
  "quick_add_specialist": "Ajouter un spécialiste",
  "palette_heading": "Spécialistes",
  "nav_my_hours": "Mes horaires"
}
```

```json
// locales/fr/reviews.json
{ "nav_reviews": "Avis" }
```

```json
// locales/fr/payments.json
{ "nav_payments": "Paiements", "nav_billing": "Facturation" }
```

```json
// locales/fr/reports.json
{ "nav_reports": "Rapports" }
```

- [ ] **Step 6: Same additions — Arabic**

```json
// additions to locales/ar/booking.json
{
  "nav_calendar": "التقويم",
  "nav_my_calendar": "تقويمي",
  "nav_appointments": "الحجوزات",
  "nav_my_appointments": "مواعيدي",
  "quick_open_calendar": "افتح التقويم",
  "quick_new_booking": "حجز جديد"
}
```

```json
// locales/ar/customer.json
{ "nav_clients": "العملاء", "quick_add_client": "إضافة عميل", "palette_heading": "العملاء" }
```

```json
// locales/ar/services.json
{ "nav_services": "الخدمات", "quick_add_service": "إضافة خدمة", "palette_heading": "الخدمات" }
```

```json
// locales/ar/staff.json
{
  "nav_specialists": "المختصون",
  "quick_add_specialist": "إضافة مختص",
  "palette_heading": "المختصون",
  "nav_my_hours": "ساعات العمل"
}
```

```json
// locales/ar/reviews.json
{ "nav_reviews": "التقييمات" }
```

```json
// locales/ar/payments.json
{ "nav_payments": "المدفوعات", "nav_billing": "الفوترة" }
```

```json
// locales/ar/reports.json
{ "nav_reports": "التقارير" }
```

- [ ] **Step 7: `platform.json` (first content) — all three languages**

```json
// locales/en/platform.json
{
  "nav_section_label": "Platform",
  "manage_any_business": "Manage any business",
  "nav_overview": "Global data",
  "nav_directory": "Directory",
  "nav_businesses": "Businesses",
  "nav_marketplace_approvals": "Marketplace approvals",
  "nav_users": "Platform users",
  "nav_categories": "Categories",
  "nav_reserved_slugs": "Reserved URLs",
  "nav_countries": "Countries",
  "nav_auth_policies": "Auth policies"
}
```

```json
// locales/fr/platform.json
{
  "nav_section_label": "Plateforme",
  "manage_any_business": "Gérer n'importe quel établissement",
  "nav_overview": "Données globales",
  "nav_directory": "Annuaire",
  "nav_businesses": "Établissements",
  "nav_marketplace_approvals": "Approbations marketplace",
  "nav_users": "Utilisateurs de la plateforme",
  "nav_categories": "Catégories",
  "nav_reserved_slugs": "URL réservées",
  "nav_countries": "Pays",
  "nav_auth_policies": "Politiques d'authentification"
}
```

```json
// locales/ar/platform.json
{
  "nav_section_label": "المنصة",
  "manage_any_business": "إدارة أي نشاط تجاري",
  "nav_overview": "البيانات العامة",
  "nav_directory": "الفهرس",
  "nav_businesses": "الأنشطة التجارية",
  "nav_marketplace_approvals": "موافقات المتجر",
  "nav_users": "المستخدمون",
  "nav_categories": "الفئات",
  "nav_reserved_slugs": "الروابط المحجوزة",
  "nav_countries": "الدول",
  "nav_auth_policies": "سياسات الدخول"
}
```

- [ ] **Step 8: `common.json` additions (merge into the Task 5 file, don't overwrite) — English**

```json
{
  "section_today": "Today",
  "section_business": "Business",
  "section_finance": "Finance",
  "section_account": "Account",
  "section_my_work": "My work",
  "section_feedback": "Feedback",
  "soon": "Soon",
  "palette_placeholder": "Search customers, bookings, services, staff…",
  "palette_no_matches": "No matches.",
  "palette_go_to": "Go to",
  "palette_unnamed": "Unnamed",
  "close_menu": "Close menu",
  "open_menu": "Open menu",
  "quick_create_label": "Quick create",
  "quick_create": "Create",
  "switch_language": "Switch language",
  "toggle_dark_mode": "Toggle dark mode",
  "live_support": "Live support",
  "customer_app": "Customer app",
  "brand_business": "Dallty Business",
  "brand_business_subtitle": "Business"
}
```

- [ ] **Step 9: `common.json` additions — French and Arabic**

```json
{
  "section_today": "Aujourd'hui",
  "section_business": "Établissement",
  "section_finance": "Finances",
  "section_account": "Compte",
  "section_my_work": "Mon travail",
  "section_feedback": "Avis",
  "soon": "Bientôt",
  "palette_placeholder": "Rechercher clients, réservations, services, employés…",
  "palette_no_matches": "Aucun résultat.",
  "palette_go_to": "Aller à",
  "palette_unnamed": "Sans nom",
  "close_menu": "Fermer le menu",
  "open_menu": "Ouvrir le menu",
  "quick_create_label": "Création rapide",
  "quick_create": "Créer",
  "switch_language": "Changer de langue",
  "toggle_dark_mode": "Basculer le mode sombre",
  "live_support": "Support en direct",
  "customer_app": "Application client",
  "brand_business": "Dallty Business",
  "brand_business_subtitle": "Professionnel"
}
```

```json
{
  "section_today": "اليوم",
  "section_business": "النشاط التجاري",
  "section_finance": "المالية",
  "section_account": "الحساب",
  "section_my_work": "عملي",
  "section_feedback": "الآراء",
  "soon": "قريباً",
  "palette_placeholder": "ابحث عن عملاء، حجوزات، خدمات، موظفين…",
  "palette_no_matches": "لا توجد نتائج.",
  "palette_go_to": "الانتقال إلى",
  "palette_unnamed": "بدون اسم",
  "close_menu": "إغلاق القائمة",
  "open_menu": "فتح القائمة",
  "quick_create_label": "إنشاء سريع",
  "quick_create": "إنشاء",
  "switch_language": "تبديل اللغة",
  "toggle_dark_mode": "تبديل الوضع الداكن",
  "live_support": "الدعم المباشر",
  "customer_app": "تطبيق العملاء",
  "brand_business": "دلّتي بزنس",
  "brand_business_subtitle": "الأعمال"
}
```

- [ ] **Step 10: Rewrite `admin-shell.tsx`**

Change `NavItem` to carry a translation key instead of `label`/`labelAr`. This file only ever touches 10 of the 16 active namespaces (per the Step 1 table) — define a local union for exactly those, rather than the full `ActiveNamespace`, so `T_BY_NAMESPACE` below can be a total, cast-free `Record`:

```ts
type ShellNamespace =
  | "common" | "booking" | "customer" | "services" | "staff"
  | "reviews" | "payments" | "reports" | "settings" | "platform";

type NavItem = {
  to: string;
  namespace: ShellNamespace;
  labelKey: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  soon?: boolean;
};
```

Rewrite `ADMIN_SECTIONS`, `STAFF_SECTIONS`, `PLATFORM_NAV` per the Step 1 table, e.g.:

```ts
export const ADMIN_SECTIONS: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "section_today",
    items: [
      { to: "/admin", namespace: "common", labelKey: "menu.dashboard", icon: LayoutDashboard, exact: true },
      { to: "/admin/calendar", namespace: "booking", labelKey: "nav_calendar", icon: CalendarDays },
      { to: "/admin/appointments", namespace: "booking", labelKey: "nav_appointments", icon: ClipboardList },
    ],
  },
  {
    labelKey: "section_business",
    items: [
      { to: "/admin/customers", namespace: "customer", labelKey: "nav_clients", icon: Users },
      { to: "/admin/services", namespace: "services", labelKey: "nav_services", icon: Scissors },
      { to: "/admin/staff", namespace: "staff", labelKey: "nav_specialists", icon: UserCog },
      { to: "/admin/reviews", namespace: "reviews", labelKey: "nav_reviews", icon: Star },
    ],
  },
  {
    labelKey: "section_finance",
    items: [
      { to: "/admin/payments", namespace: "payments", labelKey: "nav_payments", icon: Wallet },
      { to: "/admin/reports", namespace: "reports", labelKey: "nav_reports", icon: BarChart3 },
      { to: "/admin/billing", namespace: "payments", labelKey: "nav_billing", icon: CreditCard, soon: true },
    ],
  },
  {
    labelKey: "section_account",
    items: [
      { to: "/admin/notifications", namespace: "common", labelKey: "menu.notifications", icon: Bell },
      { to: "/admin/settings", namespace: "settings", labelKey: "nav_business_settings", icon: Settings },
      { to: "/admin/marketplace", namespace: "settings", labelKey: "nav_marketplace_status", icon: Store },
    ],
  },
];

export const ADMIN_NAV: NavItem[] = ADMIN_SECTIONS.flatMap((s) => s.items).filter((i) => !i.soon);

export const STAFF_SECTIONS: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "section_my_work",
    items: [
      { to: "/admin/my-appointments", namespace: "booking", labelKey: "nav_my_appointments", icon: ClipboardList },
      { to: "/admin/calendar", namespace: "booking", labelKey: "nav_my_calendar", icon: CalendarDays },
      { to: "/admin/availability", namespace: "staff", labelKey: "nav_my_hours", icon: Clock },
    ],
  },
  {
    labelKey: "section_feedback",
    items: [{ to: "/admin/reviews", namespace: "reviews", labelKey: "nav_reviews", icon: Star }],
  },
];

export const STAFF_NAV: NavItem[] = STAFF_SECTIONS.flatMap((s) => s.items);

export const PLATFORM_NAV: NavItem[] = [
  { to: "/admin/platform/overview", namespace: "platform", labelKey: "nav_overview", icon: BarChart3 },
  { to: "/admin/platform/directory", namespace: "platform", labelKey: "nav_directory", icon: Search },
  { to: "/admin/platform/businesses", namespace: "platform", labelKey: "nav_businesses", icon: Building2 },
  { to: "/admin/platform/marketplace", namespace: "platform", labelKey: "nav_marketplace_approvals", icon: Store },
  { to: "/admin/platform/users", namespace: "platform", labelKey: "nav_users", icon: ShieldCheck },
  { to: "/admin/platform/categories", namespace: "platform", labelKey: "nav_categories", icon: Tags },
  { to: "/admin/platform/reserved-slugs", namespace: "platform", labelKey: "nav_reserved_slugs", icon: Link2 },
  { to: "/admin/platform/countries", namespace: "platform", labelKey: "nav_countries", icon: Globe },
  { to: "/admin/platform/auth-policies", namespace: "platform", labelKey: "nav_auth_policies", icon: KeyRound },
];

const QUICK_ACTIONS: { namespace: ShellNamespace; labelKey: string; to: string }[] = [
  { namespace: "services", labelKey: "quick_add_service", to: "/admin/services" },
  { namespace: "staff", labelKey: "quick_add_specialist", to: "/admin/staff" },
  { namespace: "booking", labelKey: "quick_open_calendar", to: "/admin/calendar" },
  { namespace: "booking", labelKey: "quick_new_booking", to: "/admin/appointments" },
  { namespace: "customer", labelKey: "quick_add_client", to: "/admin/customers" },
];
```

In `AdminShell` (and `GlobalCommand`, `renderLink`, `sectionHeading`), add:

```ts
const { t: tCommon } = useTranslation("common");
const { t: tBooking } = useTranslation("booking");
const { t: tCustomer } = useTranslation("customer");
const { t: tServices } = useTranslation("services");
const { t: tStaff } = useTranslation("staff");
const { t: tReviews } = useTranslation("reviews");
const { t: tPayments } = useTranslation("payments");
const { t: tReports } = useTranslation("reports");
const { t: tSettings } = useTranslation("settings");
const { t: tPlatform } = useTranslation("platform");

const T_BY_NAMESPACE: Record<ShellNamespace, (key: string) => string> = {
  common: tCommon as (key: string) => string,
  booking: tBooking as (key: string) => string,
  customer: tCustomer as (key: string) => string,
  services: tServices as (key: string) => string,
  staff: tStaff as (key: string) => string,
  reviews: tReviews as (key: string) => string,
  payments: tPayments as (key: string) => string,
  reports: tReports as (key: string) => string,
  settings: tSettings as (key: string) => string,
  platform: tPlatform as (key: string) => string,
};

function label(item: NavItem): string {
  return T_BY_NAMESPACE[item.namespace](item.labelKey);
}
```

`T_BY_NAMESPACE` is typed as `Record<ShellNamespace, ...>` (the 10-member local union from Step 10's `NavItem` type, not the full 16-member `ActiveNamespace`) — every key is present, so this is a total mapping with no cast needed. Each individual `tX as (key: string) => string` cast is still required because `useTranslation`'s `t()` is typed per-namespace (`(key: NamespaceKeyMap[N]) => string`), and this object intentionally erases that per-namespace precision to let `label()` call any of them through one shared shape — safe here since `label()` is only ever called with a `NavItem` whose `labelKey` was itself written against the correct namespace's real keys in Step 10's data above (i.e. the precision is checked once, at the data-definition call sites, not lost).

Replace every `locale === "ar" ? item.labelAr : item.label` with `label(item)`. Replace `sectionHeading(section.label)` calls with `sectionHeading(tCommon(section.labelKey as NamespaceKeyMap["common"]))` for the 4 `ADMIN_SECTIONS`/2 `STAFF_SECTIONS` headings, and the two inline `locale === "ar" ? "المنصة" : "Platform"` / `"إدارة أي نشاط تجاري" : "Manage any business"` calls become `tPlatform("nav_section_label")` / `tPlatform("manage_any_business")`.

Replace remaining hardcoded strings:
- `locale === "ar" ? "قريباً" : "Soon"` → `tCommon("soon")`
- `"Search customers, bookings, services, staff…"` placeholder → `tCommon("palette_placeholder")`
- `"No matches."` → `tCommon("palette_no_matches")`
- `"Go to"` heading → `tCommon("palette_go_to")`
- `"Customers"` / `"Specialists"` / `"Services"` command-group headings → `tCustomer("palette_heading")` / `tStaff("palette_heading")` / `tServices("palette_heading")`
- `c.full_name || "Unnamed"` → `c.full_name || tCommon("palette_unnamed")`
- `"Sign out"` → `tCommon("menu.sign_out" as NamespaceKeyMap["common"])`
- `aria-label="Close menu"` (×2) → `tCommon("close_menu")`
- `aria-label="Open menu"` → `tCommon("open_menu")`
- `aria-label="Quick create"` → `tCommon("quick_create_label")`, `"Create"` text → `tCommon("quick_create")`
- `aria-label="Switch language"` → `tCommon("switch_language")`, and the button's own `{locale === "ar" ? "EN" : "ع"}` — reuse the `SHORT_LABEL` map from Task 5 Step 7 (import it, or inline a 3-way lookup consistent with it) instead of a 2-way ternary, so a French-active session shows a sensible short code too, and clicking it should call the picker's cycle behavior rather than `toggleLang` (removed in Task 5) — replace `onClick={toggleLocale}` with a 3-way cycle: `onClick={() => setLang(lang === "en" ? "fr" : lang === "fr" ? "ar" : "en")}` (import `setLang` from `useLocale()` instead of the removed `toggleLang`/`useAdminLocale` wrapper — update `useAdminLocale` accordingly or remove it and call `useLocale()` directly).
- `aria-label="Toggle dark mode"` → `tCommon("toggle_dark_mode")`
- `aria-label="Live support"` → `tCommon("live_support")`
- The 4 marketplace-status ternary strings → `tSettings("banner_pending_review")` / `tSettings("banner_rejected")` / `tSettings("banner_hidden")` / `tSettings("banner_not_listed")`
- `"You have full access to your dashboard — only public marketplace visibility is affected."` → `tSettings("banner_helper")`
- The trial-ends line (currently string-concatenated, not using `t()` interpolation) → `` tSettings("banner_trial_ends", { date: new Date(ownedBusiness.data.trial_ends_at).toLocaleDateString() }) `` (this is exactly the `{{variable}}` interpolation Task 4 built `t()` to handle)
- `"Customer app"` → `tCommon("customer_app")`
- Sidebar brand block: `"Dallty"` stays literal (it's a proper noun/wordmark, not translated content — matches how `common.brand` in `common.json` is `"Dallty"` in all three languages already), `"Business"` subtitle → `tCommon("brand_business_subtitle")`
- Mobile drawer's `"Dallty Business"` → `tCommon("brand_business")`
- `current ? (locale === "ar" ? current.labelAr : current.label) : "Dallty Business"` → `current ? label(current) : tCommon("brand_business")`

Add `preloadNamespaces` for all 10 namespaces this component needs, called once when `AdminShell` mounts (it's not itself a route with a `loader` — it's a layout component wrapping every `/admin/*` page — so add a `useEffect` that preloads on mount/language-change rather than a route loader):

```ts
useEffect(() => {
  void preloadNamespaces(lang, [
    "common", "booking", "customer", "services", "staff",
    "reviews", "payments", "reports", "settings", "platform",
  ]);
}, [lang]);
```

`ActiveNamespace` itself is not needed in this file — `ShellNamespace` (Step 10) covers every namespace this component touches. Import `NamespaceKeyMap` from `@/lib/i18n/keys.gen` for the `as NamespaceKeyMap["common"]` casts used above (`sectionHeading`, the "Sign out" line).

- [ ] **Step 11: Typecheck and lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/admin/admin-shell.tsx`
Expected: zero errors. This file has the most casts in the whole plan (`T_BY_NAMESPACE`, several `as NamespaceKeyMap[...]`) — if `tsc` flags any of them as genuinely unsound (not just "TypeScript can't prove it, but it's fine because—"), re-examine rather than blindly widening the cast.

- [ ] **Step 12: Browser verification**

Sign in as a business-owner test account (or use whatever authenticated-session technique is available in this environment). Load `/admin` in English — confirm every sidebar section heading, nav label, the topbar (search placeholder, Create button + quick actions, notification bell, language switcher, dark-mode toggle, support link), and (if the test business isn't yet marketplace-approved) the status banner all render correctly. Open the command palette (`Cmd/Ctrl+K`), confirm the placeholder and "Go to" heading, type a query, confirm "No matches." or the Customers/Specialists/Services group headings render. Switch to French — repeat the full check, confirming **every** string translates, including the ones that previously had no Arabic at all (section headings, quick actions, command palette, banner) — these are new content, not just relocated content, so verify they actually appear rather than falling back to a missing-key warning. Switch to Arabic — same full check, plus confirm RTL layout (sidebar on the correct side, icons/text order correct). Confirm the 3-way language button in the topbar cycles en → fr → ar → en correctly.

- [ ] **Step 13: Commit**

```bash
git add src/components/admin/admin-shell.tsx locales
git commit -m "feat: migrate admin-shell nav, command palette, and banner to per-domain namespaces"
```

---

## Task 12: Final verification sweep

**Files:** none (verification only, fixes only if something is found broken).

- [ ] **Step 1: Full typecheck and lint**

Run: `npx tsc --noEmit` — expected zero errors.
Run: `npx eslint .` — expected zero *new* errors (compare against the pre-existing prettier-formatting debt baseline established in every prior sub-project this session; if any file this plan touched shows a formatting error, run `npx eslint --fix` on that specific file).

- [ ] **Step 2: Grep for leftover old-system references**

```bash
grep -rn "lang === \"ar\"" src --include="*.tsx" --include="*.ts"
grep -rn "\.isArabic\|\.pick(" src --include="*.tsx" --include="*.ts"
grep -rn "from \"@/lib/dallty-content\"" src --include="*.tsx" --include="*.ts"
```

Expected: the first two return nothing (every ternary and `pick`/`isArabic` usage was migrated across Tasks 5–11). The third may still show `use-live-businesses.ts` and files importing the `Business`/`Lang` types (both intentionally kept, per Task 6 Step 8) — confirm any hit is one of those two categories, not a missed `copy`/`categories` import.

- [ ] **Step 3: Browser walkthrough — all three languages, full migrated surface**

Using the preview tools against `dallty-dev` (port 8080), for each of English, French, and Arabic:
1. `/` — hero, stats, categories, nearby businesses, steps, CTA, footer, bottom nav.
2. `/search` — search bar, tabs.
3. `/business/<a-real-slug>` — business type badge.
4. `/auth` — sign-in and sign-up forms, password strength checklist (type a password to trigger it).
5. `/bookings` — cancel-booking dialog.
6. Notification bell (wherever reachable in the current session) — title/empty-state, and a relative timestamp if any notification exists (confirms the date-fns locale fix).
7. `/admin` (if an authenticated business-owner/staff session is reachable) — full sidebar, topbar, command palette, quick actions, marketplace-status banner if applicable.

For each screen in each language: confirm no `console.warn` lines starting with `[i18n] missing key` (read via `read_console_messages`), confirm layout is LTR for English/French and RTL for Arabic, confirm no leftover English text on French/Arabic screens (or vice versa) anywhere in the migrated surface.

- [ ] **Step 4: Confirm the compile-time key guard actually works**

Temporarily introduce a deliberate typo — change one `t("brand")` call site (anywhere) to `t("brnad")` — run `npx tsc --noEmit`, confirm it fails with a type error pointing at that line. Revert the typo. This confirms Task 3's generator is genuinely wired into the build, not just present but unused.

- [ ] **Step 5: Final commit (only if this sweep surfaced fixes)**

If Steps 1–4 found anything to fix, fix it, then:
```bash
git add -A
git commit -m "fix: address issues found during core-i18n-runtime final verification sweep"
```
If nothing needed fixing, there is nothing to commit here — the plan is done as of Task 11's commit.
