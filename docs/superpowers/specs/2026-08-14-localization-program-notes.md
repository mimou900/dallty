# Localization Program — Cross-Project Decisions Log

Standing notes for the 6-project Dallty Localization/i18n/Translation-Manager/SEO
initiative. Each sub-project's brainstorm should read the section relevant to it
before proposing a design, so decisions made early in the program aren't lost by
the time later projects are brainstormed.

Program order: 1) Business Slugs 2) Core i18n Runtime 3) Locale-Prefixed Routing
4) Translation Manager 5) International SEO 6) Build-Time Guardrails.

## Project 1 — Business Slugs (in progress)

See `docs/superpowers/specs/2026-08-14-business-slugs-design.md` once written.
Key decisions: no transliteration (non-Latin names get `business-<hex>`, owner
edits later); `business_slug_redirects(id, business_id, old_slug, redirect_type,
created_at, created_by)` with `redirect_type` in `owner_rename` /
`admin_correction` / `collision_resolved`; slug rules (3–60 chars, `a-z0-9-`, no
`--`, no leading/trailing `-`, reserved-word list drawn from actual top-level
route segments); numbered suffixes (`-2`, `-3`) never reused once retired; 301 +
canonical on every redirect; max 3 slug changes per rolling 30 days.

## Project 2 — Core i18n Runtime

- **Namespace the translation files** — this is the one change the user called
  out as taking the design "from 9.6 to a true 10/10." Not `en.json` /
  `fr.json` / `ar.json`. Instead:
  ```
  /locales
    /en
      common.json
      auth.json
      booking.json
      marketplace.json
      dashboard.json
      admin.json
      settings.json
    /fr
      ...same namespace files...
    /ar
      ...same namespace files...
  ```
  Namespaces should map to the app's actual feature areas (confirm exact list
  against the route tree when this project is brainstormed — the list above is
  illustrative, not final).
- **Translation keys are permanent once created.** Never rename a key (e.g.
  `booking.book` → `booking.book_now`) — every rename breaks every language's
  translation of it. Only values change after creation. This needs to be a
  documented rule AND ideally enforced (see Project 6 — a build check that
  flags key removals/renames as a required review, not a silent diff).
- Lazy-load per active namespace + language (not just per language) — smaller
  chunks, matches the namespaced file structure.

## Project 3 — Locale-Prefixed Routing

- **Browser-language redirect must not fire if the user is already on a
  locale-prefixed path.** E.g. a French visitor who lands directly on `/en/...`
  (shared link, bookmark) must NOT be bounced to `/fr/...` — the redirect-once
  logic only applies on first visit to an *unprefixed* URL. Many sites get this
  wrong; explicitly design the guard condition (`if path already has a known
  locale prefix, skip detection entirely`) rather than relying on "only runs
  once" alone.
- **Do not prefix API/server-function routes.** Locale prefixes are a
  frontend/page concern only — `/fr/business/...` for pages, never
  `/api/fr/...` or prefixed `_serverFn` endpoints.

## Project 4 — Translation Manager

- Add **Import, Export, Compare, and Rollback** as first-class actions
  (Rollback called out as critical — publishing must create a restorable
  version, not just overwrite).
- Validation should also detect **unused/dead keys** — a key present in
  English that no component references anymore (e.g. `booking.old_button`) —
  and flag it, not just missing/extra/malformed keys relative to other
  languages.
- **Versioning uses full semantic versioning** (`1.1.3`, not `1.1`).
- **Caching**: ETag / content-hash based, keyed per language (and once
  namespaced, per namespace) so the browser only re-downloads what actually
  changed, not the whole language on every publish.
- **Biggest structural change for this project**: the publish workflow should
  be a real CMS pipeline —
  `Draft → Validate → Preview Website → Publish → Rollback if needed` —
  not a flat "upload → publish" toggle. "Preview Website" means Super Admin
  can view the live site rendered with the draft translation before it goes
  live, matching how CMS systems handle content review.

## Project 5 — International SEO

- **hreflang**: always emit `x-default` in addition to one tag per supported
  language on every page.
- **Sitemaps**: split by entity type per language, not one file per language.
  E.g. `sitemap-businesses-en.xml`, `sitemap-businesses-fr.xml`,
  `sitemap-categories-en.xml`, etc., all referenced from `sitemap-index.xml`.
  Framed explicitly as a scale concern — "once you reach 100k businesses" a
  single per-language sitemap stops being practical.

## Project 6 — Build-Time Guardrails

- Beyond "every key must exist in English": add **dead-translation
  detection** — a key that exists in the translation files but that no
  component in the codebase references anymore (e.g. `common.old_save`) should
  produce a build warning, not just missing-key errors.
- This is the natural enforcement point for the Project 2 "keys are permanent,
  only values change" rule — flag any diff that removes or renames a key
  (as opposed to just changing its value) as something requiring explicit
  human sign-off, since it will orphan every language's translation of it.

## Deferred (explicitly out of scope for now, revisit later)

- **AI-assisted translation**: future workflow of
  `Translate missing keys → AI → Human review → Publish`. Not part of any of
  the 6 projects above — the Translation Manager's data model (Project 4)
  should not preclude adding this later, but no AI translation UI/pipeline
  should be built now.
