# Business Slugs — Design Spec

**Program context:** Project 1 of 6 in the Dallty Localization/i18n/Translation-Manager/SEO
initiative (see `docs/superpowers/specs/2026-08-14-localization-program-notes.md` for the
full program breakdown and decisions carried forward to Projects 2-6). This project is a
prerequisite for locale-prefixed URLs (`/en/business/<slug>`) — those don't make sense on
top of opaque UUIDs, so human-readable, SEO-friendly business URLs come first.

**Goal:** Replace UUID-based business URLs (`/business/<uuid>`) with slug-based URLs
(`/business/<slug>`), with permanent redirect history, Super-Admin-manageable reserved
words, and a reusable slug engine other entities (categories, specialists, cities) can
adopt later without rebuilding this logic.

## 1. Architecture

Framed as a small **Canonical URL Service**, not a business-specific hack — the slug
generation, validation, reserved-word, and uniqueness logic lives in a generic module
(`src/lib/slug-service.ts`) parameterized by which table/entity it's operating on.
Businesses are the only consumer wired up in this project; the module's functions accept
table/column names as parameters rather than hardcoding `businesses` everywhere, so a
future project can point the same functions at a `categories` or `specialists` table
without rewriting the algorithm.

Three new pieces of state:

- `businesses.slug` (text) — the current canonical slug.
- `businesses.slug_source` (text: `auto` | `custom`) — whether the current slug was
  system-generated or explicitly set by a human. Never flips back to `auto` once a human
  edits it.
- `business_slug_redirects` — every retired slug, permanently. Never deleted.
- `reserved_slugs` — Super-Admin-managed list of words that can never be a slug.

## 2. Database Schema

```sql
-- businesses table additions
ALTER TABLE businesses
  ADD COLUMN slug text,
  ADD COLUMN slug_source text NOT NULL DEFAULT 'auto'
    CHECK (slug_source IN ('auto', 'custom'));
-- After backfill (Section 8): NOT NULL + UNIQUE + lower(slug) unique index added.

CREATE TABLE reserved_slugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_slug_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  old_slug text NOT NULL,
  new_slug text NOT NULL,
  redirect_type text NOT NULL
    CHECK (redirect_type IN ('owner_rename', 'admin_correction', 'collision_resolved')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz
);

CREATE UNIQUE INDEX business_slug_redirects_old_slug_idx ON business_slug_redirects (old_slug);
```

**Cross-table uniqueness (belt-and-suspenders, not just app-level checks):**

```sql
-- A slug can never be both a live businesses.slug and a retired old_slug at once.
CREATE OR REPLACE FUNCTION check_business_slug_not_retired() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM business_slug_redirects WHERE old_slug = NEW.slug
  ) THEN
    RAISE EXCEPTION 'slug "%" is retired and cannot be reused', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER businesses_slug_not_retired
  BEFORE INSERT OR UPDATE OF slug ON businesses
  FOR EACH ROW EXECUTE FUNCTION check_business_slug_not_retired();

CREATE OR REPLACE FUNCTION check_redirect_slug_not_live() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM businesses WHERE slug = NEW.old_slug) THEN
    RAISE EXCEPTION 'slug "%" is currently live and cannot be retired under a different business', NEW.old_slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER business_slug_redirects_not_live
  BEFORE INSERT ON business_slug_redirects
  FOR EACH ROW EXECUTE FUNCTION check_redirect_slug_not_live();
```

Reserved-word seed data (system route segments, confirmed against the actual route tree,
plus system namespaces reserved for the next decade of growth):

```
admin, api, auth, login, logout, signup, register, oauth, verify-otp, reset-password,
dashboard, settings, help, support, about, pricing, blog, book, search, categories,
business, business-id, legacy, salon, staff, account, availability, bookings, favorites,
profile, reschedule, appointments, calendar, customers, marketplace, notifications,
payments, reports, reviews, services, terms, privacy, contact, www, static, assets,
uploads, images, media, cdn, robots.txt, favicon.ico, sitemap.xml, feed, rss, graphql,
health, status
```

Each seeded as `active = true` with `reason = 'system route'` or `reason = 'reserved namespace'`.

## 3. Slug Generation (`src/lib/slug-service.ts`)

```ts
export function slugify(name: string): { value: string; usable: boolean } {
  const normalized = name.normalize("NFC");
  const stripped = normalized
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .normalize("NFC");
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { value: slug, usable: slug.length >= 3 && slug.length <= 60 };
}
```

If `usable` is false (empty, too short, or the name was non-Latin/non-slugifiable —
e.g. Arabic-only business names, which are deliberately **not** transliterated — see
program notes for why), the caller falls back to `business-<8 hex chars from the id>`.
No industry-specific prefix guessing (`salon-`, `clinic-`) — `business-` is the platform's
canonical noun, matching everything else in this codebase after the salon→business rename.
An owner can always replace the fallback slug later via Settings.

**Validation** (`validateSlugFormat`, used both on generation and on manual edits):
- 3–60 characters.
- Characters: `a-z`, `0-9`, `-` only.
- No `--` (consecutive hyphens).
- No leading or trailing `-`.
- Not present (case-insensitively) in `reserved_slugs` where `active = true`.

**Uniqueness resolution** (`resolveUniqueSlug`, generic over table/redirect-table params):
Check the candidate against both `businesses.slug` and `business_slug_redirects.old_slug`
(case-insensitively, via `lower()`). If taken, append `-2`, `-3`, ... until free. A
numbered variant that is later retired (via rename) is **never** reissued — it's just
another row in `business_slug_redirects`, so the existing uniqueness check already
guarantees this for free.

## 4. Redirect Resolution — No Chains

Every `business_slug_redirects` row stores `business_id` directly. Resolving a retired
slug is always a single lookup: `business_slug_redirects.old_slug = X` →
`business_id` → `businesses.slug` (the live value, right now). This is O(1) regardless
of how many times a business has renamed — there is no "follow old_slug → old_slug"
chain possible by construction, since resolution never reads `new_slug` to decide where
to go next; `new_slug` exists purely for human-readable audit history (Section 9), not
for resolution logic.

## 5. Routing

**Canonical route**: `src/routes/business.$businessId.tsx` → renamed to
`src/routes/business.$businessSlug.tsx`. Loader:

1. `businesses.slug = businessSlug` → found: render normally (fetch `id` from this row,
   use it for every child query — services, staff, reviews — exactly as `businessId` is
   used today).
2. Not found: check `business_slug_redirects.old_slug = businessSlug`. Found: resolve
   current slug via `business_id` (Section 4), fire-and-forget increment
   `hit_count`/`last_hit_at` on the redirect row (don't block the redirect on this write),
   `throw redirect({ to: "/business/$businessSlug", params: { businessSlug: current },
   statusCode: 301 })`.
3. Neither found: existing `BusinessProblem` 404 component, unchanged.

No UUID branching in this route — URLs shouldn't leak implementation detail into the
canonical path's resolution logic.

**Legacy UUID route** (new): `src/routes/business-id.$businessId.tsx` at path
`/business-id/$businessId`, existing only for old links that predate this project. Loader:
`businesses.id = businessId` → found: 301 to `/business/$businessSlug` (current slug);
not found: 404.

**`src/routes/salon.$salonId.tsx`** (the existing shim from the earlier salon→business
rename): updated to resolve the current slug directly and redirect in one hop to
`/business/$businessSlug`, instead of bouncing through the UUID route.

**Canonical `<link rel="canonical">`** on the business page always uses the current
`businesses.slug` — never a redirected-from value, by construction, since it's rendered
from the live row.

**Call sites updated** (every `<Link to="/business/$businessId" params={{ businessId }}>`
or `navigate({ to: "/business/$businessId", params: { businessId } })` becomes
`params: { businessSlug: ... }` — TanStack Router's generated types make this a compile
error everywhere it's missed):
`src/routes/_authenticated/bookings.tsx`, `src/routes/_authenticated/favorites.tsx`,
`src/components/dallty/business-card.tsx`, `src/routes/salon.$salonId.tsx` (redirect
target), and `business.$businessId.tsx`'s own 4 internal `navigate()` self-references
(confirmed: lines 127, 1413, 1454, 1485 — all post-booking "return to overview tab" calls
using the route's own `businessId` param, which becomes `businessSlug`). Each of
`bookings.tsx`/`favorites.tsx`/`business-card.tsx`'s business-list queries needs `slug`
added to their `.select(...)` column list.

**301 status note (implementation-time verification required):** TanStack Start's
`redirect()` needs to be confirmed to support an explicit `statusCode: 301` for
SSR-rendered redirects in this app's deployment configuration. If it only supports a
client-side `replace` navigation in practice, document that gap rather than silently
downgrading — a search-engine-invisible redirect defeats the SEO purpose of this project.

## 6. Rate Limiting & Lock

Both enforced inside `updateBusinessSlug` (Section 7), both **exempt for Super Admin**
(`admin_correction` redirects):

- **3 changes per rolling 30 days**: count `business_slug_redirects` rows for this
  `business_id` with `created_at > now() - interval '30 days'`; reject the 4th.
- **24-hour lock after any change**: find the most recent `business_slug_redirects` row
  for this `business_id`; if `created_at > now() - interval '24 hours'`, reject with a
  clear "you can change your URL again in N hours" message. Prevents A→B→A→B thrashing.

## 7. Server Functions

**`registerBusiness`** (existing, `src/lib/business.functions.ts`) — at creation, calls
`slugify(name)` → `resolveUniqueSlug(...)` (falling back to `business-<hex>` when
unusable) → sets `slug_source: "auto"`. No user input for the initial slug.

**`updateBusinessSlug`** (new, `src/lib/business-slug.functions.ts`) — `createServerFn`,
matching this codebase's existing RPC pattern (not a REST endpoint — nothing in this app
exposes REST routes; every mutation, e.g. `setBusinessStatus`, `setMarketplaceStatus`, is
a typed server function, and this follows the same shape):

```
updateBusinessSlug({ businessId, newSlug, redirectType })
```
1. Auth: caller owns the business (existing `assertCanManageBusiness` pattern) or is
   `super_admin` (only `super_admin` may pass `redirectType: "admin_correction"`).
2. Validate format + reserved words (Section 3).
3. Rate limit + lock check (Section 6), skipped for `admin_correction`.
4. Uniqueness check against `businesses.slug` (excluding self) and
   `business_slug_redirects.old_slug`.
5. Transaction: insert into `business_slug_redirects` (`old_slug` = current value,
   `new_slug` = the new value, `redirect_type`, `created_by` = caller's user id), update
   `businesses.slug` and set `slug_source = "custom"`.
6. Invalidate the relevant React Query keys client-side on success (`["business",
   oldSlug]`/`["business", newSlug]`, search results, favorites) — no server-side cache
   layer exists yet to invalidate (sitemap/translation caching are Projects 4-5's concern;
   noted in the program notes for when a slug change needs to trigger sitemap
   regeneration later).

## 8. Migration & Backfill (Atomic, In-Migration)

One migration file, no external script:

1. Add `businesses.slug` (nullable) and `businesses.slug_source`.
2. Create `reserved_slugs` (+ seed data), `business_slug_redirects` (+ indexes +
   triggers).
3. Define a temporary PL/pgSQL helper `_backfill_slugify(name text, id uuid) returns text`
   implementing the same algorithm as Section 3 (lowercase, strip non `[a-z0-9]`,
   collapse to single hyphens, trim; fall back to `business-` || `substr(id::text, 1, 8)`
   when the input has no ASCII letters left or the result is under 3 characters), plus a
   collision-suffix loop querying `businesses.slug`/`business_slug_redirects.old_slug`.
4. `UPDATE businesses SET slug = _backfill_slugify(name, id) WHERE slug IS NULL;` for all
   existing rows.
5. Verification: `DO $$ ... IF (SELECT count(*) FROM businesses WHERE slug IS NULL) > 0
   THEN RAISE EXCEPTION ...` — migration fails loudly rather than silently leaving nulls.
6. `ALTER TABLE businesses ALTER COLUMN slug SET NOT NULL, ADD CONSTRAINT
   businesses_slug_unique UNIQUE (slug);` and `CREATE UNIQUE INDEX
   businesses_slug_lower_idx ON businesses (lower(slug));` (defense-in-depth against
   case-collision even though app-level validation already forces lowercase-only slugs).
7. `DROP FUNCTION _backfill_slugify(text, uuid);` — one-off migration logic doesn't stay
   as permanent DB surface.

## 9. Settings UI

Business Settings → General section, new **URL slug** field: read-only display of the
current slug (`dallty.com/business/<slug>`) with an **Edit** action opening a dialog
(not inline-editable, to force the preview step):

1. Input field with live client-side format validation as the owner types.
2. On submit, show a preview: "Old: `.../business/<old>` → New: `.../business/<new>`.
   This takes effect immediately and the old link will redirect here. Continue?"
3. Confirm calls `updateBusinessSlug({ ..., redirectType: "owner_rename" })`.
4. Surfaces remaining-changes count ("2 of 3 changes left this month") and, if locked,
   the countdown until the 24-hour lock clears.

**Auto→custom nudge**: if `slug_source === "auto"` and the owner edits the Business Name
field elsewhere in Settings, show a dismissible suggestion ("Your URL is still based on
your old name — update it?") linking to the slug editor. Never automatic — editing the
business name **never** changes the slug by itself (SEO-critical: URLs are stable unless
a human explicitly chooses to change them).

## 10. Super Admin

- Existing `admin/platform/businesses.tsx` gets a slug-correction action calling
  `updateBusinessSlug({ ..., redirectType: "admin_correction" })`, exempt from the
  rate-limit and lock.
- New page `src/routes/_authenticated/admin/platform/reserved-slugs.tsx`, following the
  established CRUD shell used by `categories.tsx`/`countries.tsx`/`currencies.tsx`: list,
  add, toggle `active`, edit `reason`. No deploy needed to reserve a new word.

## 11. Out of Scope (this project)

- **Transliteration** of non-Latin names — explicitly rejected; see program notes.
- **"Did you mean…" fuzzy 404 matching** — independent UX polish feature needing
  trigram/similarity search infrastructure unrelated to slug/redirect correctness; noted
  as a future enhancement, not blocking this project.
- Slugs for any entity other than businesses (categories, specialists, cities, blog
  posts) — the underlying `slug-service.ts` module is built generically enough to extend
  to them later, but no other entity's table/UI changes in this project.
- Sitemap/translation-cache invalidation on slug change — those caches don't exist until
  Projects 4-5; carried forward in the program notes.
- AI-assisted anything.

## 12. Verification Plan

- `npx tsc --noEmit` / `npx eslint .` clean.
- DB: migration applies cleanly, zero-NULL verification passes, all 5 seed businesses get
  correct slugs, cross-table uniqueness triggers reject a manually-attempted collision.
- Browser: visit `/business/<slug>` (renders), `/business-id/<uuid>` (301s to slug),
  `/salon/<uuid>` (301s directly to slug, one hop), rename a slug via Settings → old slug
  301s to new one, attempt a reserved word (rejected), attempt a duplicate name (gets `-2`
  suffix), attempt a 4th change within 30 days (rejected), attempt a 2nd change within 24h
  (rejected), Super Admin correction bypasses both limits, Super Admin
  `reserved-slugs.tsx` CRUD works end-to-end.
