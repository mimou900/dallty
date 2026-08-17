# Dallty — Database Changelog

Forward-only migration history. Never edit a historical migration file — this log records
what each one did; corrections land as new migrations, same as the codebase's existing
convention.

## Project 01 — Database & Core Domain Foundation (2026-08-17)

### `20260817100000_fix_stale_business_rename_references.sql`
**Purpose:** Bug fix, not new scope. Four functions were missed by the 2026-08-14
salon→business rename's function-rewrite migration and still referenced the dropped
`public.salons`/`*.salon_id`. Three are bound to live `AFTER UPDATE` triggers on
`public.bookings` that fire unconditionally on status/time changes — cancelling or
rescheduling any booking was very likely erroring in production before this fix.
**Affected:** `notify_booking_audience`, `notify_on_booking_change`,
`notify_waitlist_on_free_slot`, `get_staff_day_availability` (bodies replaced in place; no
signature, grant, or trigger-binding changes).
**Data migration:** None.
**Rollback:** Not meaningful to roll back — this restores intended (working) behavior; a
rollback would restore the broken references.

### `20260817110000_business_memberships.sql`
**Purpose:** Multi-owner/management foundation. Adds `platform_roles` (8 seeded system
roles) and `business_memberships` (business ↔ user ↔ role, with `is_primary_owner` and
`status`). Extends `owns_business()` with an additive `OR` clause checking active
owner/manager memberships — the original `owner_id` check is untouched.
**Affected tables:** New: `platform_roles`, `business_memberships`. Modified: none (function
body change to `owns_business` only).
**Data migration:** Backfills one `owner` membership per existing business from
`owner_id`. No-op today (0 businesses at migration time); correct for a populated table.
**Rollback considerations:** Reverting `owns_business()` to its pre-migration body is safe
(drops the additive OR branch). Dropping `business_memberships`/`platform_roles` is safe
only if no application code has started writing to them.

### `20260817120000_permissions_foundation.sql`
**Purpose:** Role + Permission + Scope schema foundation. Adds `permissions` (24 seeded
keys) and `role_permissions` (88 seeded default grants across the 8 system roles).
**Affected tables:** New: `permissions`, `role_permissions`.
**Data migration:** Seed data only, idempotent (`ON CONFLICT DO NOTHING`).
**Rollback considerations:** Safe to drop — nothing reads these tables yet.

### `20260817130000_business_categories.sql`
**Purpose:** Many-to-many Business ↔ Category, replacing the target model for
`businesses.categories text[]` (which is left in place, still read by existing code).
Adds `categories.parent_id` for hierarchy.
**Affected tables:** New: `business_categories`. Modified: `categories` (+ `parent_id`).
**Data migration:** Backfills `business_categories` from `businesses.categories text[]`,
case-insensitive match against `categories.default_name`; unmatched values logged via
`RAISE NOTICE`, left unlinked. No-op today (0 businesses).
**Rollback considerations:** Safe to drop `business_categories` — the text[] column remains
the actual data source for existing application code until a follow-up project rewires it.

### `20260817140000_business_branches.sql`
**Purpose:** Branch/multi-location entity foundation. Standalone table, not yet wired into
services/staff/bookings/availability (that requires touching the booking engine —
explicitly out of scope for this project).
**Affected tables:** New: `business_branches`.
**Data migration:** Auto-creates one "Main" branch per existing business, carrying over
current address/phone/lat/long/timezone. No-op today (0 businesses).
**Rollback considerations:** Safe to drop — nothing reads it yet.

### `20260817150000_business_country_currency_fk.sql`
**Purpose:** Closes a gap flagged in Project 00: `businesses.country_code`/`currency` were
free text, not FKs into the reference-data tables built to be their source of truth.
**Affected tables:** Modified: `businesses` (+2 FK constraints, default values changed from
`AE`/`AED`/`Asia/Dubai` to `DZ`/`DZD`/`Africa/Algiers`).
**Data migration:** None needed — table was empty at migration time; both old and new
default values resolve to real reference rows either way.
**Rollback considerations:** Dropping the FKs is safe. Reverting the defaults would
reintroduce the Gulf-market leftover values — not recommended.

### `20260817160000_soft_deletion_foundation.sql`
**Purpose:** Soft-deletion columns for Business/Service/Staff/Customer profile per the
Master Architecture. Extends the three pre-existing public-read RLS policies
(`businesses`, `services`, `staff`) to exclude `deleted_at IS NOT NULL` rows.
**Affected tables:** Modified: `businesses`, `services`, `staff`, `profiles` (+
`deleted_at`).
**Data migration:** None — column is nullable, nothing sets it yet.
**Rollback considerations:** Safe — no code sets `deleted_at`, so dropping the column loses
no data.

### `20260817170000_audit_log_business_scope.sql`
**Purpose:** Adds business-scoping to the existing `admin_audit_log` rather than creating a
second audit table.
**Affected tables:** Modified: `admin_audit_log` (+ `business_id`, +2 indexes).
**Data migration:** None — existing rows get `business_id = NULL`.
**Rollback considerations:** Safe to drop the column; no code reads it yet.

---

**Migration-tracking note:** Before pushing the above, `supabase migration repair --status
applied` was run for 9 pre-existing migrations (`20260814010000` through `20260814090000`)
that were genuinely live on the database but unrecorded in the CLI's own tracking table
(applied via a different pipeline historically). This is a bookkeeping correction, not a
schema change — see `DALLTY_DATABASE_ARCHITECTURE.md`'s "Migration application note" for
detail.

**Type regeneration:** `src/integrations/supabase/types.ts` was regenerated from the live
linked project (`supabase gen types typescript --linked`) after all migrations above
applied. As a side effect, this also corrected pre-existing staleness unrelated to this
project's migrations: the hand-maintained file was missing the guest-checkout columns
(`customer_name`/`customer_phone`/`customer_email`) added to `bookings` on 2026-08-12, and
incorrectly typed `bookings.customer_id` as non-nullable when it has been nullable since the
same date. Fixing the resulting compile errors required minor null-safety edits to 6
application files (`business-crm.functions.ts`, `staff-desk.functions.ts`,
`admin/appointments.tsx`, `admin/calendar.tsx`, `admin/my-appointments.tsx`,
`admin/reports.tsx`) — filtering guest (null-`customer_id`) bookings out of customer-lookup
queries and widening two local types (`AppointmentRow.customer_id`,
`StaffAppointment.customerId`) to `string | null`. No behavior change for logged-in
customers; guest bookings are now correctly excluded from customer-identity lookups instead
of being passed through as invalid data.
