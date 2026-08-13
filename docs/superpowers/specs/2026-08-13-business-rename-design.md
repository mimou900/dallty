# Business/Salon Terminology Rename — Design

## Context

Dallty's data model and code were built salon-first: the core entity table is
`salons`, the owning role is `salon_owner`, the public detail page is
`/salon/$salonId`, and dozens of functions/policies/components carry "salon"
in their names. As the platform grows to cover barbershops, nail studios,
spas and other beauty/wellness categories (already modeled in the
`categories` table — see the Reference Data Foundation work), "salon" stops
being an accurate name for the underlying concept. This rename makes the
schema and code speak generically ("business") while keeping the
user-facing product feeling like what it is: a beauty/wellness booking
platform, not a fully generic business directory.

An audit (full detail in the implementation plan) found the rename touches:
- 1 core table (`salons`) + 2 satellite tables (`salon_gallery`,
  `salon_hours`) + a `salon_id` FK column on 10 tables total
- ~25 RLS policies, ~13 Postgres RPC functions, 2 enum values
  (`app_role.salon_owner`, `favorite_kind.salon`)
- 1 Storage bucket (`salon-media`, not migration-tracked)
- 66 non-generated TypeScript/React files (~1,377 case-insensitive
  occurrences), including the public detail route, the entire business-owner
  admin dashboard, and the shared `Salon`/`LiveSalon` types

This is comparable in blast radius to the earlier `customer`→`client` /
`staff`→`specialist` role rename (Phase 0 of the architecture refactor), and
follows the same additive-migration philosophy: never edit a historical
migration file, only add new forward-only ones.

## Decisions

Four points needed a product call rather than a mechanical default;
resolved with the user before this doc was written:

1. **`app_role.salon_owner` → `business_owner`.** Renamed for full
   consistency, via the same `ALTER TYPE ... RENAME VALUE` pattern already
   proven safe (preserves `user_roles` data, no backfill needed). The one
   snag from precedent: `handle_new_user()` compares the incoming signup
   role as **plain text** before casting to `app_role`, so the trigger body
   needs a matching hand-edit in the same migration, and the client-side
   signup forms that send `role: "salon_owner"` in `user_metadata` need to
   send `"business_owner"` instead.
2. **Public URL: `/salon/$salonId` → `/business/$businessId`.** Renamed for
   full consistency. Since this breaks any already-shared or bookmarked
   `/salon/...` link, the plan adds a thin redirect route at the old path
   (permanent redirect to the new one) as a safety net — not a
   back-compat *code* shim, just avoiding dead links on a URL a search
   engine or a customer's phone may already have.
3. **Storage bucket `salon-media` → `business-media`.** Renamed for full
   consistency. Supabase Storage buckets can't be renamed in place, so this
   is a real data migration: create the new bucket, copy every object
   across preserving paths, rewrite every stored URL
   (`image_url`/`logo_url`/`cover_url`/gallery paths) in the DB to point at
   the new bucket, re-point the 6 upload call-sites, recreate the Storage
   RLS policies on the new bucket, then remove the old bucket only after
   the copy is verified.
4. **Generic/aggregate copy stays beauty-flavored; per-business copy
   becomes category-driven.** Hero text, "Nearby salons", meta
   descriptions, and similar aggregate copy keep language appropriate to a
   beauty/wellness marketplace (e.g. "Nearby salons & spas") rather than
   going fully generic ("Nearby businesses") — Dallty is a beauty-booking
   platform, and generic wording would read as a regression. Where a
   *specific* business is shown (card, detail page, page title), the
   descriptive noun comes from that business's own category (already
   seeded in `categories.name`/`translations` — "Barbershop", "Nail
   Studio", etc.) via a small shared `businessCategoryLabel()` helper,
   instead of always saying "salon".

## Scope

### Database
- `salons` → `businesses`; `salon_gallery` → `business_gallery`;
  `salon_hours` → `business_hours`.
- `salon_id` FK column → `business_id` on all 10 referencing tables
  (`services`, `staff`, `bookings`, `reviews`, `business_gallery`,
  `business_hours`, `recently_viewed`, `waitlist_entries`, `promotions`,
  `staff_join_requests`), including constraint and index renames
  (`ALTER TABLE ... RENAME CONSTRAINT` / `RENAME COLUMN`, not drop+recreate,
  to avoid touching existing data or requiring a backfill).
- Enum renames: `app_role.'salon_owner'` → `'business_owner'`,
  `favorite_kind.'salon'` → `'business'`, both via `RENAME VALUE`.
- Every RLS policy referencing `salon_id`/`salons` gets a body rewrite
  (column names changed, so `DROP POLICY` + `CREATE POLICY` under the new
  name, not a bare rename) — roughly 25 policies across the 10+1 tables.
- Every RPC function referencing `salons`/`salon_id` gets renamed (where the
  name itself says "salon") and/or has its body rewritten (where only
  internal references need updating): `owns_salon` → `owns_business`,
  `is_salon_staff` → `is_business_staff`,
  `get_salon_availability_summary` → `get_business_availability_summary`,
  `get_salon_public_staff` → `get_business_public_staff`,
  `submit_salon_for_review` → `submit_business_for_review`,
  `recompute_salon_listing` → `recompute_business_listing`,
  `tg_recompute_listing_from_salon_row` →
  `tg_recompute_listing_from_business_row`,
  `guard_salon_marketplace` → `guard_business_marketplace` (also update its
  user-facing `RAISE EXCEPTION` message text),
  `refresh_salon_rating` → `refresh_business_rating`; plus body-only edits
  to `check_promo_code`, `get_marketplace_readiness`, `get_available_slots`,
  `tg_recompute_listing_from_link`, `handle_new_user`. Old function names
  are dropped, not kept as wrapper shims — this is a pre-launch app with no
  external API consumers to preserve compatibility for.
- New forward-only migration files only; historical migrations are never
  edited. Given the statement volume, this is split into a handful of
  files (table/column/constraint renames; RLS policy rewrites; function
  renames/rewrites; enum renames) rather than one, so each is reviewable
  and independently re-runnable if one step needs a retry.

### Storage
- New `business-media` bucket, RLS policies mirroring the current
  `salon-media` ones (read-public / owner-write, matching what's there
  today) with `bucket_id = 'business-media'`.
- A one-off script (service-role key, Storage API) copies every object
  from `salon-media` to `business-media` preserving paths, then a SQL
  `UPDATE` rewrites every stored URL column that embeds the old bucket
  path to the new one.
- The 6 code call-sites that currently pass `"salon-media"` to the upload
  helper switch to `"business-media"`.
- Old bucket and its policies are removed only after the copy is verified
  (row counts / spot-checked URLs), as a separate, explicit step — not
  bundled into the same script that does the copy.

### TypeScript / routes
- `src/integrations/supabase/types.ts`: hand-rewrite the `salons` /
  `salon_gallery` / `salon_hours` blocks, the 10 FK `referencedRelation`
  entries, and every renamed/edited Functions entry (Docker isn't
  available in this environment for `gen types`, matching every prior
  schema change this project).
- Route file rename: `src/routes/salon.$salonId.tsx` →
  `src/routes/business.$businessId.tsx`, `salonId` param → `businessId`
  throughout (this file alone has ~69 occurrences). A new thin
  `src/routes/salon.$salonId.tsx` replaces it, doing nothing but a
  permanent redirect to `/business/$businessId`.
- Shared types: `Salon` → `Business`, `LiveSalon` → `LiveBusiness` (in
  `dallty-content.ts` / `use-live-salons.ts`, the latter file renamed to
  `use-live-businesses.ts`).
- `AppRole` type and every `hasRole("salon_owner")` call site (20+) updated
  to `"business_owner"`.
- Every `.from("salons")` / `.from("salon_gallery")` / `.from("salon_hours")`
  call site updated to the new table names; every `salonId`/`salon_id`
  variable, prop, and parameter renamed to `businessId`/`business_id` for
  consistency across the codebase (admin dashboard hooks/routes, the
  business-owner signup/settings flow, marketplace/platform-admin tooling,
  staff access control, CRM, booking/waitlist/review flows).
- File renames matching the new vocabulary where a file is salon-prefixed:
  `salon-settings.functions.ts` → `business-settings.functions.ts`,
  `salon-crm.functions.ts`/`salon-crm.server.ts` → `business-crm.*`,
  `salon-card.tsx` → `business-card.tsx`, `salon-about.tsx` →
  `business-about.tsx`, `salon-overview.tsx` → `business-overview.tsx`,
  `salon-reviews.tsx` → `business-reviews.tsx`.
- Admin shell nav label "Salon settings" → "Business settings"; marketplace
  status banners reworded to match.

### Category-driven display
- A small shared helper reads a business's `categories` and returns the
  right descriptive noun (via the existing `translate()` helper from
  `reference-data.tsx`, matching how country/category names already
  localize) — used on business cards, the business detail page's title/meta,
  and anywhere else a specific business's "kind" is named in copy.
- Aggregate copy (homepage hero, "Nearby salons", global meta description,
  plan taglines) keeps beauty/wellness-flavored wording per decision #4
  above — exact copy is an implementation-time wording choice, not
  specified line-by-line here.

## Explicitly out of scope

- The `staff` table and its satellite tables (`staff_schedules`,
  `staff_services`, `staff_breaks`, `staff_day_hours`, `staff_time_off`,
  `staff_join_requests` keeps its name — only its `salon_id` FK column
  renames) are not part of this rename; "staff" already reads as generic.
- No change to the `categories` table itself or its seeded data — this
  rename consumes that data, it doesn't touch it.
- No visual/design changes beyond the copy updates described above.

## Verification approach

Same phased, verify-after-each-step approach used throughout this
project: apply each new migration and confirm via direct DB query before
moving to the next; typecheck/lint after each batch of TS changes; full
browser walkthrough at the end covering the public search/detail flow, the
business-owner signup + admin dashboard, and the platform-admin
cross-business views — using the established technique for signing in as
test accounts without a real password (Admin API `generate_link` →
extract `email_otp` → verify → write session into localStorage).
