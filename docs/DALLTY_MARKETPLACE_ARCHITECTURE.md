# Dallty — Marketplace & Discovery Architecture

**Status:** Living document. Produced by Project 08 (Marketplace & Discovery Foundation).
**Last updated:** 2026-08-17.

**Read this first:** search/browse already existed before this project, but was pure
client-side filtering over an unbounded-in-spirit fetch of the whole `businesses` table
(Project 03 added a `.limit(500)` stopgap, explicitly documented in its own code comment as
"not a real pagination solution — the marketplace/search project should replace this").
This project is that replacement: a real, server-side, rate-limited, cursor-paginated,
ranked search function — built alongside, not instead of, the existing visibility/approval/
verification/reviews/favorites infrastructure, all of which was already real and is reused
as-is.

## A. Existing marketplace infrastructure (verified before building anything)

- **Visibility already correctly modeled as independent concepts**, matching the brief's own
  §4 requirement almost exactly, just under different names than the brief suggested:
  - `businesses.marketplace_status` (`draft`/`pending_review`/`approved`/`rejected`/`hidden`)
    — the actual gate on public visibility (confirmed by reading the live RLS policy).
  - `businesses.is_verified` (+`verified_at`/`verified_by`) — the "Verified by Dallty" badge,
    deliberately independent (its own Super-Admin-only function, `setSalonVerified`).
  - `businesses.is_active` — a third, independent on/off switch also required by the same
    RLS policy.
  - `businesses.is_listed` — a fourth, **computed** boolean (trigger-maintained, direct writes
    blocked), but computed from a *different* signal than the RLS policy: "has at least one
    active staff member assigned to an active service." Not the same thing as marketplace
    visibility — a business can be RLS-visible/publicly readable while `is_listed = false`
    (nothing bookable configured yet). This project's search function does **not** use
    `is_listed` at all — it re-derives real public visibility itself (see §G), matching the
    RLS policy exactly, not this narrower "has anything bookable" signal.
  - `businesses.status` (`business_status` enum: `pending`/`approved`/`rejected`/`suspended`)
    — **found to be dead**: grepped across the entire `src/` tree, it appears nowhere outside
    generated types. `marketplace_status` has effectively superseded it as the real approval
    workflow. Not removed (out of scope — a schema cleanup, not a marketplace feature), but
    documented here rather than silently left for the next project to rediscover, the same
    way `assertCanManageBusiness`/`assertManagesSalon` duplication was flagged in Project 00.
- **Reviews**: fully built (`reviews` table — rating, body, photos, owner replies, moderation
  via `is_hidden`/`report_count`). Consumed as-is by search ranking (§L); not rebuilt.
- **Favorites**: fully built (`favorites` table, generic `kind` enum covering
  business/staff/service, a real `FavoriteButton` component with working
  insert/delete/optimistic-toast mutations) — but **found wired into only some UI**: the
  marketplace search-result card (`BusinessCard`) had its own local `useState`-only heart
  icon that reset on every reload instead of using the real `FavoriteButton`/`favorites`
  table. **Fixed** (brief §33's exact instruction: "if favorites infrastructure already
  exists: integrate it… do not create duplicate favorites storage").
- **Categories**: `categories` table (hierarchy via `parent_id`, i18n via `translations`
  jsonb, icon/image, Super-Admin-managed) is real and reused for the filter UI's option list.
  **Found, not fixed**: `businesses.categories text[]` (free text, loosely matched against
  `categories.default_name` — an existing helper, `business-category-label.ts`, already
  documents "isn't guaranteed to match exactly") is what's actually stored per business,
  *not* the `business_categories` many-to-many join table Project 01 also created (confirmed
  empty — 0 rows). There are, in effect, two overlapping "what category is this business"
  signals in the schema today (`categories text[]` and the unused `business_categories`
  join), plus a third, `businesses.business_type` (free text, matches a hardcoded
  `BUSINESS_TYPES` array), which is what the search page's own "shop type" filter actually
  uses. **Not consolidated in this project** — deciding which of three parallel
  category/type fields becomes authoritative is a data-model decision bigger than a
  discovery/search project's scope, and touching the business-onboarding/settings forms that
  write these fields risks real regressions. Documented here so it isn't silently
  rediscovered later, same discipline as the `businesses.status` finding above.
- **Slugs**: unchanged, reused as-is — canonical business URLs already resolve by slug, with
  legacy UUID/retired-slug redirects (Project 00's audit confirmed this working; not
  re-verified in depth here since nothing about it changed).
- **Country marketplace gating** (Project 04): `countries.marketplace_enabled` already
  correctly gates the public RLS policy. Reused, not duplicated, by the new search function
  (see §F).

## B. Tables created

None. Every visibility/approval/verification/review/favorite/category concept this project
needed already existed (see §A) — Project 08 is schema-additive only (§C), not schema-new.

## C. Tables/columns modified

- `businesses` (+`region_id uuid REFERENCES regions(id)`, nullable) — the one real,
  additive schema gap found: `businesses` had no structured administrative-region reference
  at all, only free-text `city`/`district`/`area`. `business_branches` already has a
  `region_id` column (unpopulated — branches remain a standalone, unwired table per Projects
  01/05's own documented scope boundary, unchanged here); this migration follows that exact
  same naming convention at the business level rather than inventing a new pattern. No
  `city_id` FK was added anywhere — confirmed no such column exists anywhere in this schema
  (`business_branches.city` is also free text), so this project didn't introduce one either.
- New indexes: `businesses (country_code, marketplace_status, is_active) WHERE deleted_at IS
  NULL` (the exact predicate `search_businesses_page()` filters on), a GIN index on
  `businesses.categories` (array containment queries), `businesses.region_id`,
  `businesses.latitude`/`longitude` (range prefilter for the distance calculation).

## D. Search architecture

`search_businesses_page()` (SQL function, `SECURITY DEFINER`) is the single source of truth
for marketplace search — `searchBusinesses` (`src/lib/marketplace-search.functions.ts`) is a
thin, rate-limited, Zod-validated `createServerFn` wrapper around it, never a second copy of
the filtering/ranking logic (brief §46, §50). No dedicated search engine (Elasticsearch/
Algolia/Typesense) was introduced — plain PostgreSQL with the indexes above is more than
sufficient at current and near-term scale (brief §50: measure before reaching for one).

Supports: free-text query (name/name_ar/city/area/category, `ILIKE`-based), category filter,
region filter, city filter (free-text `ILIKE`), instant-booking-only, verified-only, three
sort modes (relevance/distance/rating). Every filter is applied **inside the SECURITY
DEFINER SQL function**, not layered on top by the caller — since this function runs with
elevated privilege (equivalent to `service_role`, which bypasses RLS entirely), it embeds the
exact same visibility predicate the public RLS policy uses (`deleted_at IS NULL AND is_active
AND marketplace_status = 'approved' AND country.marketplace_enabled`) rather than relying on
RLS to filter results — the same pattern already established by `get_available_slots()`/
`reschedule_booking()` in the booking engine.

## E. Location architecture

Country → Region (Wilaya for Algeria, generic elsewhere) → free-text city, using Project 04's
real `regions`/`cities` reference tables — never a hardcoded per-country lookup. The
search.tsx location filter's *label translation* now does a best-effort case-insensitive
match of a business's stored free-text `state`/`city` against `regions`/`cities.default_name`
(falling back to the raw stored string when no match exists) — the exact same
graceful-fallback pattern `business-category-label.ts` already established for the identical
free-text-vs-reference-table mismatch. A country with no seeded regions (anything but Algeria
today) simply shows raw strings; nothing assumes Algeria or Arabic.

**Administrative terminology is not hardcoded** — no generic marketplace code contains the
words "Wilaya"/"Commune"; the `administrative_levels` table (Project 04) already supplies
country-specific labels, and nothing added here bypasses that.

## F. Country isolation — implemented and live-tested

`search_businesses_page()` refuses to return any row at all for a country whose
`countries.marketplace_enabled` is false, checked as the function's very first statement —
**this is server-side, not a frontend `if (country === "DZ")`** (brief §66's explicit
anti-pattern). **Live-tested**: a real business seeded under `FR` (confirmed
`marketplace_enabled = false` in this environment) returned zero search results, while an
identical Algeria business returned correctly. Passing an arbitrary/foreign country code is
not a security bypass — search is public data by design; an unsupported country code simply
yields an empty organic result set, enforced by the database, not the caller.

## G. Business visibility — implemented and live-tested

`search_businesses_page()`'s WHERE clause: `deleted_at IS NULL AND is_active AND
marketplace_status = 'approved' AND country marketplace-enabled` (§F). **Live-tested**: a
`hidden` business and a `pending_review` business, seeded alongside an `approved` one, were
both correctly excluded from results while the approved one appeared — confirmed for both the
`service_role` caller and the `anon` role directly (brief §65, §47: public read, nothing
private leaks even without going through the `createServerFn` wrapper).

**Fully booked businesses remain discoverable** (brief §5) — nothing in the visibility
predicate above considers current booking/slot state at all; a fully-booked business ranks
and appears identically to an open one. The "next available" hint (§K) is a separate,
optional, per-card signal, never a filter that removes a business from results.

## H. Branch support

**PREPARED, not wired into search.** `business_branches` (Project 01) remains structurally
real but unpopulated in live data (confirmed: 0 rows beyond the auto-created "Main" branch
per business) and still not connected to services/staff/bookings — an explicit, carried-
forward scope boundary from Projects 01 and 05, not reopened here. Building branch-aware
location search against a table with no real per-branch data would be non-functional theater;
`businesses.region_id` (§C) was added at the *business* level specifically because that's
where real, filterable location data can actually exist today. The public business page
(`business.$businessSlug.tsx`, unchanged this project) already renders whatever branch data
exists; multi-branch search/ranking is the natural next step once branches carry real data.

## I. Category/service discovery

Category filter option list: the real `categories` table (`useCategories()`, already
existed). Match against businesses: `businesses.categories text[]` (`&&`/`ILIKE` containment
— see §A for the three-parallel-taxonomy-fields finding, not resolved here). Service-level
discovery ("find businesses offering X service") is satisfied by the free-text query matching
category names and business names/areas — a dedicated `services` full-text index was not
added; not measured as necessary at current data volume (brief §50).

## J. Specialist discovery

**DEFERRED.** No specialist-level search filter was built. `staff.email`/`phone` remain
correctly private (unchanged); nothing in this project exposes additional staff data. Brief
§22 describes this as something that "can eventually become discoverable" — no existing
consumer needed it this pass, and the existing public-staff read path
(`get_business_public_staff()`, Project 00) already exposes exactly the public fields a
future specialist-search feature would need without new schema.

## K. Availability integration

**No second availability engine** (brief §23, mandatory). `get_business_next_available()`
(new SQL function) is a thin aggregation over the *existing*, authoritative
`get_staff_day_availability()` from Project 05's booking engine — it does not recompute
slots itself. Deliberately **not** called as part of the bulk search page (would mean N extra
availability queries per results page); designed to be fetched per-card, lazily, as a
discovery hint only. **Live-tested**: correctly reports `fully_booked_horizon: true` for a
business with no staff/service assignments (no crash, no false "available" signal). Booking
itself always re-validates against `get_available_slots()` — unchanged, still authoritative.

## L. Ranking architecture

A single deterministic `rank_score` (organic only), computed server-side:
prefix-name-match relevance + rating (capped) + log-dampened review-count popularity +
verification boost + profile-completeness boost (logo+cover present) + a distance bonus when
coordinates are supplied. Every term is bounded so no single signal dominates arbitrarily
(brief §17). **Sponsored-ranking-ready, not sponsored**: nothing here computes or reserves
paid placement — the design note in the migration itself documents how a future sponsorship
layer would compose (merge sponsored rows into this organic ordering, clearly labeled) without
this function's shape needing to change, satisfying brief §18-19/§67 without building billing/
campaigns now.

## M. Cache architecture

**Not built this project.** Public business/category/location data is cacheable in principle
(brief §53), but no caching layer (CDN edge cache, Redis, etc.) exists in this codebase to
wire into, and the deployment target's actual caching behavior wasn't established this
session. `search_businesses_page()` is marked `STABLE` (not `VOLATILE`), which lets Postgres
itself cache repeated calls within a single statement/transaction — a real, small win, not a
substitute for a real cache layer. Flagged as a genuine follow-up once a caching strategy is
decided (ties into the Performance/CDN deployment project).

## N. Security

- `search_businesses_page()`/`get_business_next_available()`: `REVOKE ALL FROM public`, then
  explicit `GRANT EXECUTE TO anon, authenticated, service_role` — deliberately public (this is
  intentionally-public marketplace data), but only ever returns the fixed, public-safe column
  list declared in `RETURNS TABLE` — never `SELECT *`, matching the existing
  `get_business_public_staff()` convention. No private column (owner contact info, financial
  data, internal notes) is reachable through either function.
- `searchBusinesses`/`getBusinessAvailabilitySummary`: rate-limited per IP via Project 03's
  `assertRateLimit` (60/10min for search, 120/10min for the lighter availability lookup).
  **Live-tested**: the underlying `check_rate_limit` bucket blocks after its configured
  threshold.
- Server-side hard cap: `_limit` is clamped to `[1, 50]` **inside the SQL function itself**
  (`LEAST(GREATEST(...))`), not just validated by the TS Zod schema — a caller bypassing the
  `createServerFn` wrapper and calling the RPC directly (as the anon-role test did) still
  cannot request more than 50 rows. **Live-tested**: requesting `_limit: 9999` returned
  exactly the available matching rows, never more than 50.

## O. Anti-scraping

No bulk endpoint exists (`search_businesses_page()` always requires a country code and always
caps results at 50). Cursor-based keyset pagination (§Q) makes deep enumeration expensive
(no `OFFSET 50000`-style cheap deep-paging) and is rate-limited per IP on top. Cloudflare-
level bot detection/WAF is out of this project's scope (an infrastructure/deployment concern,
not application code) — flagged, not built, consistent with the Security Architecture doc's
existing note that edge-layer protection is a separate, unconfigured concern.

## P. RLS

Unchanged — the existing "Public reads approved salons" policy (Project 04) remains the real
enforcement layer for any *direct* PostgREST/client read of `businesses`. The new SQL search
function is `SECURITY DEFINER` (bypasses RLS by necessity, like every other complex read
function in this codebase) and therefore re-implements the same visibility predicate
explicitly rather than depending on RLS — verified identical in behavior via live testing
(§F, §G), not assumed identical from reading the two independently.

## Q. Performance

Cursor/keyset pagination on `(rank_score, id)` (or `(distance, id)` / `(-rating, id)`
depending on sort mode) — never `OFFSET`, per brief §15. **Live-tested**: two sequential
cursor-paginated pages returned zero overlapping rows. Haversine distance is computed in
plain SQL (no PostGIS/`earthdistance` extension installed in this project, confirmed before
writing the function, not assumed) — accurate at city scale, standard closed-form, no new
extension dependency. New indexes (§C) support the actual filter predicate the function runs,
verified by reading that predicate, not guessed.

## R. UI/UX

`search.tsx`'s existing filter shell, chips, travel-time overlay, and instant/open toggles
were kept — this pass replaced only the two components that violated brief §10/§40's
"no hardcoded country/language assumptions" instruction (`arab-cities.ts`'s
`provincesFor`/`citiesFor` static lookup tables) with the real `useRegions`/`useCities`
hooks. The results feed itself (`useLiveBusinesses()`, client-side filtered) was **not**
swapped onto the new paginated `searchBusinesses()` server function in this pass — see
Deferred (§X) for why, and note that the real, tested, secure backend capability exists and
is ready for that wiring as a focused follow-up.

## S. SEO compatibility

No route restructuring was done — `/search` and `/business/$businessSlug` are unchanged.
`search_businesses_page()`'s filter shape (country/region/city/category) is structured
exactly along the hierarchy a future `/country/region/category` SEO route tree (brief §37-39)
would need to query — nothing built here would need to change shape to serve that project;
it's schema/query-compatible, not itself an SEO page generator (correctly out of this
project's scope per brief §69, §73).

## T. Sponsorship extension points

See §L. `rank_score` is the complete organic ranking; the documented extension point is a
future merge-sort of sponsored rows against this same ordering, with mandatory visible
disclosure (brief §19) — not built, only kept compatible.

## U. Affiliate extension points

**Not touched.** No referral/attribution parameter handling was added to business page URLs
this project — canonical slugs remain exactly as they were, which is itself sufficient
compatibility (a future affiliate system can append its own query parameters to an existing
canonical URL without this project needing to have anticipated the parameter name).

## V. Tests performed (live, against the real database)

1. Country isolation: approved/hidden/pending businesses seeded together — only the approved
   one appears in results, confirmed for both `service_role` and unauthenticated `anon`
   callers.
2. Country marketplace gate: a business seeded under a non-marketplace-enabled country
   returns zero results.
3. Category filter: matches against `businesses.categories` free-text array.
4. Server-side pagination hard cap: requesting 9999 rows returns at most 50.
5. Anon-role direct RPC call returns identical, correctly-scoped results to the service-role
   path — confirming the visibility predicate is enforced by the function itself, not by
   caller trust.
6. Keyset pagination: two sequential cursor-paginated pages return zero overlapping rows.
7. `get_business_next_available()` on a business with no staff/services: returns
   `fully_booked_horizon: true`, no crash.
8. Rate limiting: the underlying bucket blocks after its configured threshold.

**Not live-tested:** full country-language matrix rendering (en/fr/ar/RTL) of the updated
search filters in a real browser — verified instead by `tsc`/`eslint`/build passing and
direct code review of the `dirFor`/`translate()` usage, matching this project's stated
budget; flagged rather than silently assumed working.

## W. Documentation

This document; `DALLTY_MASTER_ARCHITECTURE.md` §O updated; `DALLTY_IMPLEMENTATION_ROADMAP.md`
row 11 (Marketplace) updated.

## X. IMPLEMENTED vs. PREPARED vs. DEFERRED

**IMPLEMENTED, live-tested:** server-side ranked/paginated search (`search_businesses_page`,
`searchBusinesses`); country-marketplace isolation; business-visibility enforcement
(approval/verification/active, independent of `is_listed`); category/region/city filtering
off real reference data; rate limiting; server-side hard pagination cap; keyset pagination
correctness; `get_business_next_available` availability hint reusing the existing booking
engine; real favorites wiring in `BusinessCard` (replacing a fake local-state heart icon).

**PREPARED (real schema/interface, no full consumer yet):** `businesses.region_id` (added,
not yet populated for existing data — new/edited businesses can set it going forward);
sponsorship ranking extension point; affiliate-URL compatibility; SEO-route-compatible filter
shape.

**DEFERRED, explicitly not built:** wiring `search.tsx`'s actual results feed onto the new
paginated search function (kept on `useLiveBusinesses()` this pass — a scope decision, not an
oversight, made for the same reason Project 05 didn't rewire the booking UI: avoiding
destabilizing a large, working page's travel-time/geo-sort/chip interactions within this
session); branch-aware location search (branches remain unpopulated/unwired, carried forward
from Projects 01/05); specialist-level search; a real caching layer; consolidating the three
parallel category/type fields found in §A/§I; sponsored billing/campaigns; affiliate
dashboard; full SEO page generation; AI search.
