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

---

## Project 12 — Central Financial Ledger + Revenue + Commissions + Payouts (2026-08-21)

Branch `project-12-financial-ledger`. **Not yet merged to `main`** as of this writing — these
migrations are applied on that branch's environment only, not confirmed live in production.

### `20260821010000_project12_staff_payouts.sql`
**Purpose:** Closes Project 06's own documented gap — `staff_payouts` existed schema-only
with zero consumers. Realigns `staff_payouts.status`'s CHECK constraint to the brief's exact
6-state machine (`pending`/`available`/`processing`/`paid`/`failed`/`cancelled` — the prior
CHECK had `pending`/`approved`/`paid`/`cancelled`/`failed`) and adds `staff_payout_items`,
linking a payout to the exact `staff_earning` ledger rows it covers so the same earning can
never be double-paid across concurrent/retried payout runs.
**Affected tables:** Modified: `staff_payouts` (status CHECK constraint replaced, `status`
default changed to `'available'`). New: `staff_payout_items` (`UNIQUE (ledger_transaction_id)`,
`FOREIGN KEY (ledger_transaction_id) ... ON DELETE RESTRICT`, indexed on `payout_id`, RLS
enabled with an owner/staff-self/platform-admin SELECT policy).
**Data migration:** None — no `staff_payouts` rows existed at migration time (confirmed by
audit), so the CHECK-constraint swap is a clean replacement, not a data rewrite.
**Rollback considerations:** Dropping `staff_payout_items` is safe only if no payout has been
created and settled against it yet (would orphan the ledger-row linkage). Reverting the
status CHECK constraint to its pre-migration values would break any row already written with
`'available'`/`'processing'`.

### `20260821020000_project12_no_show_policy.sql`
**Purpose:** No-show financial policy (brief §87-88) — business/country policy must
determine no-show financial treatment, never hardcoded; genuinely new, no such config existed
before this.
**Affected tables:** Modified: `businesses` (+ `no_show_charge_policy text NOT NULL DEFAULT
'no_charge'`, `CHECK (no_show_charge_policy IN ('no_charge', 'retain_deposit',
'full_charge'))`).
**Data migration:** None — column has a default, so every existing row is backfilled to
`'no_charge'` automatically.
**Rollback considerations:** Safe to drop — `markNoShow` reads it with a `?? "no_charge"`
fallback, so no code assumes the column exists unconditionally.

### `20260821030000_project12_affiliate_foundation.sql`
**Purpose:** Adds the `affiliate_payable` value to the `ledger_account_type` enum, parallel
to `staff_payable` — split into its own migration because Postgres requires a new enum value
to commit in its own transaction before it can be used (the same constraint Project 06 hit
adding `external_cash`).
**Affected tables:** Modified: `ledger_account_type` enum (+1 value, `affiliate_payable`).
**Data migration:** None.
**Rollback considerations:** Postgres cannot drop a single enum value without recreating the
type — not meaningful to roll back once any row uses it; safe to leave unused if the
consuming code (`activateAffiliateReferral`) is never reached.

### `20260821040000_project12_affiliate_and_referral_tables.sql`
**Purpose:** Affiliate and business-referral tables — both confirmed genuinely zero before
this project (repo-wide grep found no table, enum, or referral/attribution code of any
kind). Business referrals are deliberately kept a separate model from affiliates: one is a
person referring businesses to Dallty on an ongoing commission basis, the other is a business
referring another business once for a one-off balance credit.
**Affected tables:** New: `affiliates` (`user_id uuid UNIQUE`, `referral_code text UNIQUE`,
`status` `active`/`suspended`/`banned` default `active`, `touch_updated_at` trigger);
`affiliate_commission_rules` (`affiliate_id`/`country_id`/`plan_key`/`campaign_key`-scoped,
`rate_type` `fixed`/`percentage`, `duration_months`, `active`, `effective_from`);
`affiliate_referrals` (`affiliate_id`, `referred_business_id`, `referral_code`,
`attribution_window_days` default 30, `status` `pending`/`converted`/`expired`/`revoked`);
`business_referrals` (`referring_business_id`, `referred_business_id`, `referral_code`,
`status` `pending`/`activated`/`expired`/`revoked`, `reward_amount`, `reward_currency`, a
partial unique index on `referral_code` while `referred_business_id IS NULL`). Modified:
`ledger_transactions`' SELECT RLS policy dropped and recreated with one additional OR'd
clause (every pre-existing condition preserved verbatim) so an affiliate can see their own
`affiliate_payable` accrual rows.
**Data migration:** None — all four tables start empty.
**Rollback considerations:** The four new tables are safe to drop if nothing has written to
them yet. Reverting `ledger_transactions_select` to its pre-migration body (dropping the
`affiliate_payable` OR clause) is safe — it only removes an additive grant, same discipline
Project 01/11 used extending `owns_business()`.

### `20260821050000_project12_country_payout_config.sql`
**Purpose:** Country-specific payout field requirements (brief §45, §65) — confirmed missing
before this project; the only prior country-scoping for money
(`payment_methods.country_id`/`commission_rules.country_id`) scopes which methods/rates
apply, not what fields a payout in a given country needs. One shared table for both staff and
affiliate payouts rather than a near-duplicate per feature.
**Affected tables:** New: `country_payout_requirements` (`country_id`, `field_key`,
`field_label`, `required`, `sort_order`, unique on `(country_id, field_key)`; public SELECT,
Super-Admin-only write).
**Data migration:** Seeds Algeria's real requirements (`ccp_account`, `ccp_key`, `rib`,
`account_holder_name`) via a `CROSS JOIN` against `countries WHERE iso_code = 'DZ'`, `ON
CONFLICT DO NOTHING` (idempotent, re-runnable).
**Rollback considerations:** Safe to drop — deliberately reference-data only in this
project, no UI or server function reads it yet.
