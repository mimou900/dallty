# Dallty — Database Architecture

**Status:** Living document. Produced by Project 01 (Database & Core Domain Foundation).
**Last updated:** 2026-08-17.

This documents the database as it exists after Project 01's migrations
(`20260817100000` through `20260817170000`), building on the pre-existing schema audited
in Project 00 (`DALLTY_MASTER_ARCHITECTURE.md` §E). It does not repeat that audit in full —
only what Project 01 added or changed.

## Entity list (new/changed in Project 01)

| Table | Purpose | Rows today |
|---|---|---|
| `platform_roles` | Business-scoped role catalogue: 8 system roles (super_admin, owner, manager, receptionist, confirmation_member, specialist, customer, affiliate) + per-business custom roles | 8 (system only) |
| `business_memberships` | Who has business-management access, at what role, in what state. Extends (does not replace) `businesses.owner_id` | 0 |
| `permissions` | Flat reference list of 24 granular permission keys (`business.view`, `booking.create`, ...) | 24 |
| `role_permissions` | Default scope (global/country/business/branch/self) per system-role/permission pair | 88 |
| `business_categories` | Business ↔ Category many-to-many, alongside the existing `businesses.categories text[]` | 0 |
| `business_branches` | Standalone branch/location entity, one auto-created "Main" branch per business | 0 |

Plus column additions to existing tables: `categories.parent_id` (hierarchy),
`businesses.deleted_at` / `services.deleted_at` / `staff.deleted_at` / `profiles.deleted_at`
(soft deletion), `admin_audit_log.business_id` (business-scoped audit filtering).

All new tables have RLS enabled with no gaps (verified — every `CREATE TABLE` in this
project's migrations is immediately followed by `ENABLE ROW LEVEL SECURITY` and at least one
policy).

## Relationships

```
countries ──< businesses (country_code -> iso_code, FK added this project)
currencies ──< businesses (currency -> code, FK added this project)
businesses ──< business_memberships >── auth.users
                    │
                    └─ role_id -> platform_roles
platform_roles ──< role_permissions >── permissions
businesses ──< business_categories >── categories (parent_id self-FK for hierarchy)
businesses ──< business_branches
businesses ──< admin_audit_log (business_id, nullable)
```

`staff` (the existing specialist-profile table) is deliberately **not** folded into
`business_memberships` — see "Ownership model" below for why they're separate concepts.

## Ownership model

Before this project: `businesses.owner_id` was the single source of truth for who owns a
business — no multi-owner support, no distinction between owner/manager/receptionist as
business-scoped roles.

After this project: `business_memberships` exists alongside `owner_id`, not instead of it.

- `owns_business(_user_id, _salon_id)` — the RPC underlying 41+ RLS policies — was extended
  with an `OR EXISTS (...)` clause checking for an active `owner`/`manager` membership. The
  original `owner_id` check is preserved verbatim, so this is a strict superset: it can only
  grant *more* access than before, never less, for every business that predates this
  migration.
- Every existing business was backfilled with one `owner` membership row
  (`is_primary_owner = true`) matching its `owner_id`. This ran as a no-op today (Project 00
  cleared all business data immediately before this project started), but is correct
  whenever it runs against a populated table.
- `business_memberships.is_primary_owner` has a partial unique index (`WHERE is_primary_owner
  AND deleted_at IS NULL`) enforcing at most one primary owner per business — schema support
  for the future owner-protection workflow (email confirmation, 15-day removal-protection
  window), which is **not implemented** in this project, only made possible by it.

`owner_id` is not deprecated or scheduled for removal by this project — it remains the
original/legacy owner pointer. A future authorization project decides whether to eventually
retire it in favor of membership rows exclusively.

## Specialist vs. membership — why two tables

`staff` (specialist/service-delivery profile: can exist without a linked user account,
has title/bio/portfolio, is invited by email) and `business_memberships`
(governance/dashboard-access layer: owner/manager/receptionist/confirmation_member) model
different concepts that can overlap but aren't the same row:

- A specialist who only performs services needs a `staff` row and nothing else — exactly
  today's behavior, unchanged.
- An owner who never performs a bookable service needs a `business_memberships` row and no
  `staff` row.
- A specialist who is *also* the business owner (explicitly called out in the Master
  Architecture) gets both: a `staff` row for service delivery, a `business_memberships` row
  (`is_primary_owner = true`) for management access. Nothing in this project's schema
  prevents or requires the overlap.

## Tenant boundaries / RLS strategy

Every new table follows the existing pattern exactly (verified consistent with Project 00's
audit of the pre-existing tables): public `SELECT` where the data is genuinely public
reference data (`platform_roles`, `permissions`, `role_permissions` — all readable by
`anon`), owner/platform-admin-scoped writes via `owns_business()`/`is_platform_admin()`, and
`is_super_admin()`-gated writes for system-level rows (`platform_roles` where
`business_id IS NULL`).

`business_memberships` itself: `SELECT` is scoped to the membership's own `user_id`, the
business's owner/manager, or a platform admin — a staff member cannot see another business's
membership list, and a plain member cannot see who else has access to a business they don't
manage.

No table added in this project grants a broad "any authenticated user can read everything"
policy — every write policy is scoped through `owns_business()` or `is_super_admin()`.

## Indexes

Every FK column added in this project has a supporting index (Postgres does not auto-index
FK columns, only PK/unique columns): `business_memberships` (business_id, user_id, role_id),
`business_categories` (category_id — business_id is covered by the composite PK),
`business_branches` (business_id, region_id, country_id), `platform_roles` (business_id),
`role_permissions` (permission_id — role_id covered by the composite PK), `businesses`
(country_code, currency), `admin_audit_log` (business_id, created_at DESC for chronological
scans). Partial indexes (`WHERE deleted_at IS NULL`, `WHERE is_primary_owner`, `WHERE
is_main`) keep the uniqueness constraints from blocking on soft-deleted/inactive rows.

## Constraints

- `businesses.country_code` → `countries.iso_code` and `businesses.currency` →
  `currencies.code`: new FKs closing the gap flagged in Project 00 (previously free text).
- `business_memberships`: unique `(business_id, user_id)` among non-deleted rows; at most one
  `is_primary_owner = true` row per business among non-deleted rows.
- `business_branches`: at most one `is_main = true` row per business among non-deleted rows.
- `platform_roles`: system role keys (`business_id IS NULL`) are globally unique; a
  business's custom role keys are unique within that business only.

## Soft deletion strategy

`deleted_at timestamptz` added to `businesses`, `services`, `staff`, `profiles` (per the
Master Architecture's explicit list: Business, Service, Staff/Specialist profile, Customer
profile), plus `business_memberships`/`business_branches` (created with it from the start).
The three public-read RLS policies that existed before this project (`businesses`,
`services`, `staff`) were extended with `deleted_at IS NULL` — verified against the exact
live policy bodies before editing, not guessed. **Nothing sets `deleted_at` yet** — no UI, no
server function triggers a soft delete. This project only lays the column + constraint +
policy foundation; the delete workflow itself is future work, per the Master Architecture's
own instruction not to implement retention policies yet.

## Audit strategy

The pre-existing `admin_audit_log` (`actor_id`, `action`, `target_type`, `target_id`,
`details jsonb`, `created_at`) already matched the Master Architecture's `audit_logs`
foundation almost exactly — this project extends it with `business_id` rather than creating
a second, duplicate audit table. It remains effectively append-only (no UPDATE/DELETE RLS
policy exists for it — verified in Project 00, unchanged here), which is the correct default
for an audit trail.

## Country architecture / administrative geography

Unchanged structurally from Project 00's audit (`countries`/`currencies`/`regions`/`cities`,
generic and not Algeria-specific) — this project's only change here is closing the
`businesses.country_code`/`currency` → FK gap (see Constraints above) and aligning the
column defaults from a leftover Gulf-market value (`AE`/`AED`/`Asia/Dubai`) to the actual
launch market (`DZ`/`DZD`/`Africa/Algiers`), matching the fallback already hardcoded in
`src/lib/reference-data.tsx`.

## Role/permission foundation

`platform_roles` + `permissions` + `role_permissions` implement the Role + Permission +
Scope shape from the Master Architecture. This is reference data only in this project —
seeded with sensible defaults for every system role (see the migration for the full grant
table), but **not consulted by any RLS policy or server function yet**. Existing
authorization (`hasRole()`, `assertCanManageBusiness`/`assertSuperAdmin`,
`owns_business()`/`is_platform_admin()`/`is_super_admin()`) is completely unchanged and
remains the actual enforcement mechanism. A future authorization project decides how (or
whether) to wire real enforcement through these new tables.

## Slug architecture

Unchanged — already fully implemented before this project (`businesses.slug`,
`business_slug_redirects`, `reserved_slugs`), confirmed in Project 00's audit to match its
design spec exactly. Nothing to add here.

## Migration application note

These migrations were applied via the Supabase CLI (`supabase db push --linked`), which
required first reconciling the CLI's own migration-history tracking table: 9 migrations from
2026-08-14 (the business rename, business-media bucket, and business-slugs work) had
genuinely been applied to the live schema — confirmed by directly querying for
post-migration table/column names before touching anything — but were never recorded in
`supabase_migrations.schema_migrations`, most likely because they were applied through
Lovable's own deploy pipeline rather than the CLI. `supabase migration repair --status
applied` was used to mark those 9 as applied (without re-running their SQL) before pushing
this project's new migrations, to avoid the CLI attempting to replay already-applied DDL
(which would have failed, e.g. `ALTER TABLE public.salons RENAME TO businesses` against a
database where `salons` no longer exists).
