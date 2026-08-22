# Dallty — Financial Architecture

**Status:** Living document. Produced by Project 06 (Payments, Deposits, Cash Settlement &
Financial Ledger); extended by Project 12 (Central Financial Ledger + Revenue + Commissions
+ Payouts — staff payout recording, deposit collection, no-show policy, reconciliation,
affiliate and business-referral foundations, country payout config); extended by Project 13
(Subscription/Billing Architecture — plan configuration, subscription lifecycle, temporary
manual payment recording reusing this project's own ledger, affiliate/business-referral
activation triggers, staff-limit entitlement enforcement). **Project 12 is code-complete on
branch `project-12-financial-ledger`, not yet merged to `main` or deployed** — everything in
the Project 12 update section below is real, working code, verified only on that branch.
**Project 13 is code-complete on branch `project-13-subscriptions`, not yet merged to `main`
or deployed** — everything in the Project 13 update section below is real, working code,
verified only on that branch.
**Last updated:** 2026-08-22.

**Read this first:** no payment provider credentials (CIB, Edahabia, Stripe, or any other)
exist anywhere in this project's environment — confirmed repeatedly across every project in
this session. Everything "online payment" in this document is a real, working **schema and
abstraction**, not a real integration. Nothing here claims money was processed through a
provider that was never actually confirmed. What *is* real, working, and live-tested: the
three-layer model, the immutable double-entry ledger, and cash payment settlement —
including the overage/underage reconciliation flow, which is the most detailed part of the
brief and the part actually usable by a real business today.

## Project 12 update (2026-08-21) — payout recording, deposits, reconciliation, affiliates

Project 06 (below) built the ledger foundation and explicitly carried forward two gaps in
its own "PLANNED, explicitly not built" section: `staff_payouts` row creation had no server
function, and online/recorded deposit collection wasn't wired up. Project 12 closes both,
adds a no-show financial policy, a real payments-vs-ledger reconciliation tool, and the
affiliate/business-referral foundations (confirmed genuinely zero anywhere in the codebase
before this project — not even a stray table or enum value). **Not yet merged to `main` —
code-complete and phase-tested on `project-12-financial-ledger` only.**

### Staff payout recording (closes Project 06's own documented gap)

New `staff_payout_items` (`src/lib/payout.functions.ts`) links a payout to the exact
`staff_earning` ledger rows it covers, via a `UNIQUE` constraint on
`ledger_transaction_id` — enforced at the database level, not just application logic, so the
same earning can never be double-paid across concurrent or retried payout runs.
`staff_payouts.status`'s CHECK constraint was realigned to the brief's exact 6-state machine
(`pending`/`available`/`processing`/`paid`/`failed`/`cancelled`; no rows existed yet, so this
was a clean swap, not a data migration).

The flow is a deliberate two step **create → settle**:
- `createStaffPayout` computes what a specialist is still owed — every `staff_earning`
  credit to their `staff_payable` account, ever, minus whatever's already locked into a
  non-cancelled/non-failed payout — and inserts a `staff_payouts` row plus the covering
  `staff_payout_items` rows. **This step never touches the ledger.**
- `settleStaffPayout`'s transition to `'paid'` is the *only* step that posts to the ledger: a
  debit against `staff_payable` (what's owed shrinks) balanced by a credit to
  `external_cash` (money actually left the business), type `staff_payout`. Moving to
  `'failed'`/`'cancelled'` instead deletes the payout's `staff_payout_items`, releasing the
  earnings back into the pool for a future run, since no ledger effect ever happened for
  them.

Idempotent via `withIdempotency` (keyed on the payout id for the `'paid'` transition) *and* a
`.eq("status", "pending")` guard on the update — a retried or double-clicked confirmation can
never post the ledger entry twice.

### Deposit collection (brief §13-15 — closes Project 06's other documented gap)

`calculateDeposit` (Project 06) only ever computed what *should* be collected; nothing
recorded one actually being received. `collectDepositPayment`
(`src/lib/financial.functions.ts`) closes that: posts `cash_received`/`service_revenue` for
the deposit amount only, deliberately with **zero commission/staff-earning split** — that
split is computed once, on the booking's full final service revenue, when the remainder (or
the deposit itself, for a 100%-deposit business) is later settled. Sets
`bookings.payment_status = 'deposit_paid'` (an existing enum value that had no prior writer).

`markCashPayment` was made deposit-aware: `expected` is now `total_price − alreadyPaid`
(previously always `total_price`), and commission/staff-earning are computed on
`alreadyPaid + finalServiceRevenue` — the booking's full final service revenue, not just this
payment's portion — so a deposit-then-remainder booking nets identically to one paid in a
single shot. Guarded by `ALREADY_FULLY_PAID` if called again once nothing remains owed.
Backward compatible by construction: with no prior payment, `alreadyPaid = 0` and behavior is
byte-for-byte unchanged from pre-Project-12.

### No-show financial policy (brief §87-88)

`businesses.no_show_charge_policy` (`no_charge`/`retain_deposit`/`full_charge`, business/
country-level, never hardcoded) is new — no such configuration existed anywhere before this
project. `markNoShow` (`src/lib/booking-ops.functions.ts`, toggle in
`src/routes/_authenticated/admin/settings.tsx`) reads the policy and records which one
applied as an audit trail entry (`booking_status_history` + `admin_audit_log`) — **it does
not execute a charge.** `retain_deposit` needs no ledger action (a deposit already collected
simply isn't refunded, already this codebase's default). `full_charge` is recorded as intent
only: **no payment gateway exists anywhere in this environment**, so there is no mechanism to
actually collect money from a no-show customer — this stays an honest flag for staff to
follow up manually, not a fabricated auto-charge.

### Reconciliation (brief §61-62, §98)

`runReconciliation` (`src/lib/reconciliation.functions.ts`, Super Admin only, UI at
`src/routes/_authenticated/admin/platform/reconciliation.tsx`) is genuinely new tooling — no
reconciliation of any kind existed before this project. Since `account_balances` is always
computed live from `ledger_transactions` (never a cached column that can drift), this isn't
cache-vs-source reconciliation; it's a real integrity check between two
**independently-written** record sets that should always agree: `payments.received_amount`
sums vs. `ledger_transactions`' `external_cash`-debit sums, grouped by business. Since
`markCashPayment`/`collectDepositPayment` always write both in the same transaction, a
mismatch here means a genuine bug, not expected drift. First real run against production data
found one benign discrepancy (a leftover immutable ledger row from Project 06's own original
test data, whose matching `payments` row had since been cleaned up) — left visible rather
than silently corrected, which is the tool's entire purpose.

### Affiliate foundation (brief §42-45)

Confirmed genuinely zero before this project (`src/lib/affiliate.functions.ts`). New tables:
`affiliates` (auto-approved on apply per brief §42, `user_id` `UNIQUE`, `referral_code`
`UNIQUE`, `status` `active`/`suspended`/`banned`, Super Admin controls suspend/ban);
`affiliate_commission_rules` (affiliate/country/plan/campaign-scoped — precedence
affiliate-specific → country-specific → global default, deliberately mirroring the existing
`commission_rules` hierarchy rather than inventing a new shape); `affiliate_referrals`
(`pending` → `converted` attribution tracking, 30-day default attribution window). New
`ledger_account_type` enum value `affiliate_payable`. `activateAffiliateReferral` posts a
balanced group: debit `dallty_revenue` / credit `affiliate_payable`.

**Important boundary, stated plainly:** the actual "becomes a paying subscriber" trigger does
**not** exist — there is no subscription system (Project 13 territory). Today,
`activateAffiliateReferral` is Super-Admin-callable manually as a documented stand-in; a
future Project 13 subscription-payment-success handler should call this same function
instead of duplicating the commission logic.

### Business referrals (brief §46-47)

`business_referrals` (`src/lib/business-referral.functions.ts`) is distinct from the
affiliate model above: one business refers another business a single time, for a one-off
reward — not an ongoing per-person commission relationship. The reward is credited to the
*referring* business's `promotional_credit` ledger account — **explicitly not the same
account as `business_balance`'s real cash revenue.** Same Project-13-dependent boundary as
affiliates: `activateBusinessReferral` is Super-Admin-callable manually today, documented as
the hook a real subscription-payment-success handler should call once one exists.

### Country-specific payout config (brief §45, §65)

`country_payout_requirements` (country_id, field_key, field_label, required, sort_order) is a
new reference table, shared by both staff and affiliate payouts rather than a near-duplicate
per feature. Seeded for Algeria (`ccp_account`, `ccp_key`, `rib`, `account_holder_name`) as
the brief's own worked example, proving out the general shape. Deliberately schema/
reference-data only in this project — no UI or server function collects an actual filled-in
payout profile yet, since neither staff nor affiliate payouts currently record structured
per-country account details; matches the codebase's recurring "don't build ahead of a
consumer" discipline.

### Security note

A live RLS test matrix (9/9 checks) verified cross-tenant SELECT denial and non-super-admin
write denial on every new Project 12 table: `affiliates`, `affiliate_commission_rules`,
`business_referrals`, `staff_payout_items`, `country_payout_requirements`.

One real bug was found and fixed in the process: `has_permission()`'s SQL implementation
does not distinguish `scope='self'` from `'business'`/`'global'` — all three pass identically.
This was dead code until Project 12's `getStaffOwedAmount`/`listStaffOwedAmounts` became its
first consumer of a `'self'`-scoped permission, which would have let a specialist view every
other specialist's owed payout amount business-wide (violating brief §37 — "own earnings/
payout only, never total business revenue"). Fixed in application code
(`src/lib/payout.functions.ts`, using the pre-existing but previously-unused
`myBusinessRole()` helper from `src/lib/permissions.server.ts`) rather than the shared SQL
function, since these are the only two `'self'`-scope consumers today.

**ARCHITECTURAL NOTE for future maintainers:** any future consumer of a `'self'`-scoped
permission must replicate this same application-layer scope check (or `has_permission()`
itself should eventually be hardened to accept a target-user parameter) — it is **not**
automatically safe to trust `hasPermission()`'s boolean return alone when a role might hold a
`'self'`-scoped grant.

## Project 13 update (2026-08-22) — subscription plans, billing lifecycle, entitlements

Project 12 (above) explicitly named its own boundary: `activateAffiliateReferral`/
`activateBusinessReferral` are Super-Admin-callable manual stand-ins because "becomes a paying
subscriber" had no real trigger — no subscription system existed. Project 13 builds that
system and wires the trigger. **Not yet merged to `main` — code-complete and live-tested on
`project-13-subscriptions` only.**

### subscription_plans — editable reference-table configuration

`subscription_plans` (`src/lib/subscription.functions.ts`) holds every commercial attribute
Super Admin needs to tune as data, not code: `monthly_price`/`yearly_price`/`currency`,
`trial_duration_days`, `grace_period_days`, `staff_limit`/`branch_limit`/
`monthly_booking_limit`/`customer_limit` (`NULL` = unlimited, an explicit queryable "no cap"
rather than a magic number), `feature_entitlements jsonb`, `advertising_eligible`. `plan_key`
is text, not the pre-existing `businesses.plan` enum, so a 4th/5th plan needs only a plain
`INSERT`, no enum-extension migration. 3 plan keys seeded (starter/professional/enterprise),
every row explicitly marked `is_provisional = true` — **provisional placeholder values, not
final commercial pricing.** Public SELECT (the plan picker needs to read it unauthenticated),
Super-Admin-only write, editable from `/admin/platform/subscription-plans`.

### business_subscriptions + subscription_events — the real lifecycle chain

`business_subscriptions` holds one current-state row per business (`UNIQUE (business_id)`) —
`status` (`trialing`/`active`/`past_due`/`canceled`/`expired`), `billing_interval`,
`current_period_start`/`current_period_end`, `grace_period_ends_at`, `cancel_at_period_end`.
`subscription_events` is the append-only transition history (`created`/`trial_started`/
`upgraded`/`downgraded`/`renewed`/`canceled`/`reactivated`/`expired`/`payment_recorded`/
`grace_period_entered`/`entitlement_denied`) — mirrors Project 12's own `staff_payouts`/ledger
split ("one current-state row, immutable trail for the history"), not a new pattern. Together
they implement the real chain: plan → pricing → subscription → billing period → upgrade/
downgrade (`changeSubscriptionPlan`) → cancellation (`cancelSubscription`/
`reactivateSubscription`) → renewal (`recordSubscriptionPayment`) → expiration (the lifecycle
sweep below). `subscription_events` is `INSERT`-only for `authenticated`/`service_role` —
`UPDATE`/`DELETE` revoked from both, same append-only-audit-trail convention as
`admin_audit_log`/`booking_status_history` (not `ledger_transactions`' stronger
trigger-enforced immutability — this table holds no money itself, the ledger already does).

### The lifecycle sweep — a real pg_cron job, not a manual trigger

`run_subscription_lifecycle_sweep()` runs daily (`dallty-subscription-lifecycle-sweep`,
`0 3 * * *`), scheduled the same real way as the existing
`generate_due_booking_reminders()` job (pg_cron/pg_net are already live on this project driving
that job — this is pure data logic, no email/HTTP dispatch, so it's scheduled identically
rather than left manual-trigger-only). Four transitions, each posting a matching
`subscription_events` row: trial ended with no payment ever recorded → `expired`; active
subscription past `current_period_end` and not scheduled to cancel → `past_due` (grace period
starts, `grace_period_ends_at = now() + plan's grace_period_days`); active subscription past
`current_period_end` and scheduled to cancel (`cancel_at_period_end = true`) → `canceled`;
`past_due` subscription past `grace_period_ends_at` with still no payment → `expired`.

### subscription_payments + recordSubscriptionPayment — TEMPORARY, Super-Admin-only

**Read this before touching `recordSubscriptionPayment`:** no payment gateway is configured
for Dallty subscriptions anywhere in this environment — confirmed via a repo-wide grep plus a
direct `.env` audit before building this, not assumed. `subscription_payments`
(`payment_method` defaults to `'manual_admin_recorded'`, `provider_reference` stays `NULL`
until a real gateway exists) is an explicit, honestly-labeled **TEMPORARY** manual-recording
mechanism — mirrors `payments`' relationship to `ledger_transactions` for bookings: the
domain-specific "this payment happened" record, with the ledger (reused, not duplicated)
recording the actual accounting effect. `recordSubscriptionPayment` is **Super-Admin-only**
(`assertSuperAdmin`) — a business self-attesting its own payment would be trivially forgeable,
so there is deliberately no owner-facing "I paid" button. Posts the exact same balanced ledger
shape Project 12 established for cash bookings, just in the reverse commercial direction:

```
DEBIT  external_cash    <amount>   (cash left the business's own account)
CREDIT dallty_revenue   <amount>   (Dallty's platform revenue increases)
```

type `'subscription_payment'`, `accountRef` = the business's own id on both sides — **no new
ledger/payment/balance/payout system**, reuses `postLedgerGroup()` exactly as every other
project's financial event does. Wrapped in `withIdempotency` (keyed on business + current
month by default). On success: advances `business_subscriptions` to `active` with a fresh
`current_period_start`/`current_period_end` (computed from the plan's billing interval),
clears `grace_period_ends_at`, syncs the `businesses.plan` display mirror, and posts both a
`'renewed'` and a `'payment_recorded'` event.

### Affiliate/business-referral activation now fires for real

On a business's **first** successful `subscription_payments` row, the real affiliate-commission
and business-referral-reward triggers Project 12 explicitly built as a hook for this
("a future subscription-payment-success handler should call this same function") now fire
automatically. `activateAffiliateReferralCore`/`activateBusinessReferralCore` were extracted
from Project 12's existing, already-tested `activateAffiliateReferral`/`activateBusinessReferral`
(`src/lib/affiliate.functions.ts`/`src/lib/business-referral.functions.ts`) so both the
pre-existing Super-Admin manual path and this new automatic trigger share one implementation,
rather than duplicating the commission/reward posting logic. The business-referral reward is
computed as a percentage of the payment amount, read from the new single-row
`subscription_settings.business_referral_reward_percent` (Super-Admin-editable, matching
`auth_settings`' own single-row-config pattern) — **not a hardcoded number** the way an ad-hoc
implementation might have been tempted to write it.

### Real entitlement enforcement — staff_limit only

A `BEFORE INSERT`/`UPDATE` trigger on `staff` (`enforce_staff_limit()`) blocks exceeding a
plan's `staff_limit`, raising `STAFF_LIMIT_REACHED` — the actual add-staff-member path is a
plain RLS-gated client-side insert (`"Owners manage staff"`, ALL commands), not a server
function, so a database trigger was the only enforcement point that couldn't be bypassed by a
future code path that forgets to call a check function. `NULL` `staff_limit` (enterprise) and
a missing subscription row both skip enforcement (fail open rather than lock a business out
over a row this trigger didn't create). **Branch-limit is tracked in the plan config but
deliberately not enforced anywhere** — no branch-creation function exists in the app yet to
enforce it against, correctly not built ahead of a consumer. `monthly_booking_limit`/
`customer_limit` are likewise configured and surfaced in the `/admin/billing` usage display
(`getBusinessEntitlements`) but have no enforcement point today.

### Fixed: the hardcoded 14-day trial

`business.functions.ts`'s `registerBusiness` previously hardcoded a 14-day trial length
regardless of which plan a business picked. Now calls `resolvePlanTrialEndsAt`
(`src/lib/subscription.functions.ts`), which reads the chosen plan's own
`trial_duration_days` — a starter/professional/enterprise business today all happen to get 14
days (the seeded provisional value), but the length is genuinely plan-driven now, not a
literal in application code.

### Backfill — 9 pre-existing businesses

All 9 businesses that existed before this project (0 of which had any `business_subscriptions`
row, confirmed live before writing the migration) were backfilled with a grandfathered
`'active'` subscription on their existing `businesses.plan` value — `'active'`, not
`'trialing'`, since these are already-established businesses, not new trial signups.
`current_period_end` is left `NULL` so the lifecycle sweep (which only acts when
`current_period_end IS NOT NULL`) never force-transitions a business that never had a real
billing cycle into `past_due`. Without this backfill, the `staff_limit` trigger above would
have immediately locked every existing business out of adding staff the moment it shipped.

### Security note

This is the most significant part of Project 13 — four separate live-testing-driven fixes,
not just new feature code.

**1. `has_permission()`'s `scope='self'` was a complete no-op, and this one was live and
exploitable** (unlike Project 12's narrower finding above, which was dormant). A live audit
found the SQL treated `scope='self'` identically to `'business'`/`'global'` — any grant passed
regardless of who the action's actual target was. `assertBookingAction`
(`booking-ops.functions.ts`) and `rescheduleBooking` (`booking-engine.functions.ts`) both fell
back to "does the caller have ANY staff row at this business" rather than "is the caller the
specific assigned staff for THIS booking" — meaning any specialist could confirm, reschedule,
or view the call history of any OTHER specialist's booking, contradicting both functions' own
documented intent. Fixed `has_permission()` itself: extended its signature with an optional
`_target_user_id uuid DEFAULT NULL` (every existing caller that doesn't pass it keeps its
exact current `'business'`/`'branch'`-scope behavior — but now correctly fails closed for
`'self'` scope instead of silently passing); self-scope now requires `_target_user_id` to
match the caller; global-scope now checks across every one of the caller's active memberships
instead of requiring a match on one specific `business_id`. Rewired `assertBookingAction` and
`rescheduleBooking` to resolve the booking's actual assigned staff and pass it as the target,
narrowing their fallback from "any staff exists" to "is precisely the assigned staff for this
booking" — and only for the actions the specialist role is meant to hold (confirm/view/
reschedule), not no_show/cancel, which specialist never held even with a working self-scope
grant. **Live-verified** against the real, persistent Specialist A / Specialist B test
accounts: Specialist B correctly denied on Specialist A's booking, Specialist A correctly
allowed on their own, no-target calls correctly fail closed. Two other callers
(`recordBookingConfirmation`, `createWalkInBooking`) were confirmed deliberately "any staff
member" by design per their own doc comments and correctly left untouched.

**2. `owns_business()`'s manager over-grant silently defeated the subscription/billing
restriction.** Live RBAC testing against the real Manager test account found `owns_business()`
deliberately treats `'manager'` as owner-equivalent (its own definition ORs in
`role.key IN ('owner','manager')`) — correct for the "almost all daily operations" surfaces it
gates elsewhere, but wrong for subscription actions specifically: the project requirement is
explicit that manager must be denied billing/subscription access unless separately granted,
and `subscription.manage`/`subscription.view` are in fact only ever seeded to `'owner'` and
`'super_admin'`, never `'manager'`. Every subscription function's
`owns_business() OR hasPermission(...)` check let the OR-clause silently override that
restriction regardless. Fixed by using a literal `businesses.owner_id = userId` check
(`isLiteralOwner`, `subscription.functions.ts`) instead of `owns_business()` in all 4
subscription management functions (`getMySubscription`, `changeSubscriptionPlan`,
`cancelSubscription`, `reactivateSubscription`) **and** the 3 subscription tables' RLS SELECT
policies, for defense in depth (those tables have no direct authenticated write path, but a
future direct client read would otherwise have hit the identical gap). **Live-verified**
against every real test account: owner PASS; manager/receptionist/specialist/affiliate/
customer/second-owner all correctly DENY on both manage and view.

**3. Two real bugs caught by an actual functional test, not just `tsc`.** Running an actual
end-to-end SQL simulation of the payment-recording sequence (insert + ledger + backfill, not
just trusting the type-checker) found: **(a)** `postLedgerGroup`'s `paymentId` parameter has a
foreign key to the `payments` table specifically (booking payments) — passing
`subscription_payments.id` there would have failed on every single real payment recorded in
production, confirmed via a live insert that failed with an FK violation. Fixed by not passing
`paymentId` at all — traceability goes through the `reason` field instead (`reason:
subscription_payment:<id>`), matching how other ledger consumers without a `payments` row
already do it. **(b)** `subscription_payments`/`subscription_events` had `UPDATE`/`DELETE`
REVOKEd from `service_role` too, copying `ledger_transactions`' stricter immutability pattern —
but no other append-only table in this codebase (`admin_audit_log`, `booking_status_history`)
actually revokes from `service_role`; they rely on RLS having no authenticated write policy
while trusted server-function code (which always runs as `service_role`, bypassing RLS) keeps
normal privileges. This broke `recordSubscriptionPayment`'s own legitimate `ledger_group_id`
backfill `UPDATE` — confirmed failing live before the fix (`SET ROLE service_role; UPDATE
subscription_payments ...` → "permission denied for table subscription_payments"). Fixed by
restoring `UPDATE` for `service_role` on both tables; `DELETE` stays revoked even for
`service_role` — no legitimate deletion path exists for financial/audit records. Re-verified
live after both fixes: a real payment+ledger insert balances correctly and the
`ledger_group_id` backfill `UPDATE` now succeeds as `service_role`.

**4. A forward-compatibility bug caught by directly testing the scenario the reference-table
design exists to support.** `businesses.plan` was still typed as the fixed 3-value
`subscription_plan` enum despite this project's own explicit "treat these as the initial plan
keys only" promise (`subscription_plans.plan_key` is deliberately `text`, meant to support a
4th/5th plan via a plain `INSERT`, no schema change). Confirmed live: creating a disposable 4th
plan and assigning a business to it threw `invalid input value for enum subscription_plan` on
the `businesses.plan` sync every subscription function performs — silently defeating the whole
point of the reference-table architecture the moment Super Admin actually used it as intended.
`businesses.plan` is confirmed display-only (Super Admin directory badge, settings page's
read-only field — neither gates any logic), so it was widened to `text` with a foreign key to
`subscription_plans.plan_key` instead. **Live-verified:** created the disposable 4th plan,
assigned a real business to it successfully, reverted, deleted the test plan — all clean.

**5. Unrelated small fix found while working in this area, not a Project 13 deliverable:** 4
orphaned test businesses from an earlier Project 12 security-test run — correctly prevented
from being deleted by the immutable ledger trigger (working as designed, the same guarantee
documented for Project 06/12 above) but predating the `is_test` isolation flag — were silently
inflating real platform KPI totals in `platformOverview`. Re-tagged `is_test = true` rather
than left contaminating counts. No Project 13 migration touches `businesses.is_test`/
`profiles.is_test` — this was leftover Project 12 hygiene debt, mentioned here only briefly
since it isn't Project 13 scope in its own right.

**Live testing performed:** 8/8 RLS tests pass — cross-business isolation on
`business_subscriptions`/`subscription_payments`, manager denial at the RLS layer,
Super-Admin-only plan-config writes — using the real, persistent Project 12 test accounts, no
new or duplicate test accounts created for this project.

## The three-layer model (brief §2-3)

```
BOOKING           "what appointment happened" — src/lib/booking-engine.functions.ts (Project 05)
   │
PAYMENT           "how did the customer pay" — new `payments` table
   │
LEDGER            "what financial transactions actually occurred" — new `ledger_transactions`
```

Before this project, `bookings.payment_status`/`paid_at` were set directly by
`useSetPaymentStatus` (`src/lib/admin.ts`) — a raw status flip with no amount tracking, no
overage handling, no ledger. That is exactly the anti-pattern the brief opens with
(`booking.paid = true` as financial truth). `bookings.payment_status` still exists and is
still kept in sync (fast-read summary for the booking list UI), but it is now a **derived**
field, written only by the new server functions after a real `payments` row and real ledger
transactions are posted — never the source of truth itself.

## The immutable ledger — read this section before touching `ledger_transactions`

`ledger_transactions`: `transaction_group_id`, `account_type`, `account_ref`, `direction`
(`debit`/`credit`), `amount` (always positive — sign comes from `direction`), `currency`,
`type`, plus `business_id`/`booking_id`/`payment_id`/`actor_id` for traceability. **No
`updated_at`, no `deleted_at` — this table is never touched again after a row is written.**

**Immutability is enforced at two independent layers, and both were live-tested — not
assumed:**

1. No `UPDATE`/`DELETE` grant to any role, including `service_role`.
2. A `BEFORE UPDATE`/`BEFORE DELETE` trigger (`forbid_ledger_mutation`) that raises
   unconditionally — this is the actual backstop, since RLS alone cannot restrict
   `service_role` (which bypasses RLS by design), so a trigger was necessary, not optional.

```
UPDATE posted transaction (service role) -> BLOCKED: ledger_transactions rows are immutable
  once posted -- use a reversal/adjustment transaction instead
DELETE posted transaction (service role) -> BLOCKED: [same message]
row amount after attacks: 1000 (unchanged)
```

Corrections are always new rows (a reversal + a corrected transaction, both in a fresh
`transaction_group_id`) — never an edit to history.

### Accounts are implicit, not a pre-provisioned chart

`ledger_account_type` enum: `customer_balance`, `business_balance`, `dallty_revenue`,
`staff_payable`, `dallty_payable`, `refund_liability`, `promotional_credit`,
`external_cash`. An "account" is a `(account_type, account_ref)` pair — e.g. `business_id`
X's business-balance account is just every row with `account_type='business_balance'` and
`account_ref=X`. No row needs to be pre-created for a new business/customer/staff member;
their account simply comes into existence the moment their first transaction posts. Balances
are read from `account_balances`, a plain view (`SUM(credit) - SUM(debit)` grouped by
account) — not a cached/stored column, so it can never drift from the ledger by
construction. Documented as a candidate to swap for a materialized view later purely for
performance, with zero change to any consumer's query shape, if volume ever justifies it
(brief §108's own framing — "any aggregate must be rebuildable from the ledger", which a
plain view trivially satisfies since it *is* the rebuild).

### Real double-entry, not a one-sided balance log

Every financial event posts a **balanced** group (`postLedgerGroup()`,
`src/lib/ledger.server.ts`) — debits equal credits within the group, checked in code before
any row is written, not just hoped for. `external_cash` (added specifically for this) is the
standard "Cash" account from conventional bookkeeping — the counterpart for money that
physically changed hands with the customer, outside Dallty's own tracked balances. A cash
payment with a tip, 10% commission, and a 50% staff payout rule posts as:

```
DEBIT  external_cash     2500   (cash received: service + tip)
CREDIT business_balance  2000   (service revenue)
CREDIT business_balance   500   (tip)
DEBIT  business_balance   200   (commission owed to Dallty)
CREDIT dallty_revenue     200
DEBIT  business_balance  1000   (staff earning)
CREDIT staff_payable     1000
```

**Live-tested, not assumed**: this exact scenario was posted against the real database and
every resulting balance verified: `business_balance = 1300` (2000+500−200−1000),
`dallty_revenue = 200`, `staff_payable = 1000` — all matched. A deliberately unbalanced
posting attempt was also tested and correctly rejected before any row was written.

### Negative-balance protection (brief §62)

A `BEFORE INSERT` trigger blocks any debit against `customer_balance`/`business_balance`/
`promotional_credit` that would drive the computed balance below zero — **live-tested**: a
5000 debit against a 1000 balance was rejected (`INSUFFICIENT_BALANCE`); a 400 debit against
the same 1000 balance succeeded, leaving 600. `staff_payable`/`dallty_revenue`/
`dallty_payable`/`refund_liability` are internal accrual accounts, deliberately exempt — they
represent what the business legitimately owes, not a spendable balance a party "holds."

## Payment state (brief §4)

`payment_status` (pre-existing `unpaid`/`paid`/`refunded`) extended with `payment_pending`,
`deposit_required`, `deposit_pending`, `deposit_paid`, `partially_paid`, `payment_failed`,
`payment_cancelled`, `refund_pending`, `partially_refunded` — the full state machine from the
brief, added to the existing enum rather than a second one (its own migration/transaction,
same constraint hit twice already in Project 05).

## Cash payment — the centerpiece, built and live-tested (brief §8-11, §85)

`markCashPayment` (`src/lib/financial.functions.ts`) never trusts a client-supplied
"expected" amount — it's always read fresh from `bookings.total_price`. The caller supplies
only the amount actually received; everything else is computed server-side:

- **Exact match**: straightforward, posts service revenue only.
- **Overpayment** (received > expected): a `differenceReason` is *required*
  (`tip`/`extra_service`/`other`; `discount_adjustment` is rejected here — a discount cannot
  explain receiving *more*). For `tip`, the service-revenue line stays at `expected` and the
  overage becomes its own `tip` ledger line — **never inflated into service revenue**,
  exactly as the brief's worked example demands. For `extra_service`/`other`, the full
  received amount is counted as (unitemized) service revenue.
- **Underpayment** (received < expected): `discount_adjustment` settles the booking in full
  at the lower amount (status → `paid`, nothing remains owed — a discount is a deliberate
  full settlement, not a partial one). Any other reason leaves the booking `partially_paid`
  with a real remaining balance — **never silently marked fully paid** (brief §11).
- `differenceReason: "other"` always requires a non-empty `differenceNote`.

Wrapped in Project 03's `withIdempotency` (keyed by actor + booking, or a caller-supplied
key) — a double-click or retry returns the original result, never a second payment.
Commission and staff-earning are computed via `resolveCommissionRate`/
`resolveStaffPayoutRule` (business → country → global default hierarchy for commission;
staff+service → staff-wide → business-default for payout) and posted in the same balanced
group as the revenue/tip lines — **live-tested** (see above).

## Deposits (brief §13-15)

`calculateDeposit` reads the business's own `require_deposit`/`deposit_percent` columns
(pre-existing, added in an earlier project) and computes the required amount server-side —
never trusts a client-submitted figure. **Scoped honestly**: the brief's global→country→
business configuration hierarchy is schema-ready in principle but only the business level is
actually wired up in this project, because no country- or plan-level override table exists
yet and nothing consumes one — adding one later doesn't change this function's contract.
Deposits collected *online* are blocked on a real payment provider (infrastructure this
project doesn't have); deposits collected as cash-in-advance can be recorded through
`markCashPayment` against a `kind: 'deposit'` payment today.

## Extra services (brief §33-34)

`addExtraService` inserts a new `booking_items` row (`kind = 'extra_service'`,
`added_by` = the staff member who added it) and updates `bookings.total_price` —
**the original items are never modified**, preserving the full history of what was
originally booked versus what was added later.

## Refunds (brief §39-43)

`createRefund`: **owner or platform-admin only** — deliberately narrower than the general
`assertCanManageBookingFinance` check used elsewhere (which also allows staff); an ordinary
specialist cannot self-authorize a refund. **Live-tested**: a specialist's authorization
check correctly evaluates to forbidden, an owner's to allowed. References the original
`payment_id`, never a bare flag flip. Cannot exceed the payment's received amount, checked
against the sum of any prior successful refunds on the same payment — **live-tested**
(attempting to refund 2500 against a 2000 payment is correctly rejected). Posts a reversing
balanced ledger group (`business_balance` debited, `external_cash` credited). Wrapped in
`withIdempotency`. Status is `succeeded` immediately for cash (a manual, already-completed
real-world action) — an online-provider refund would stay `pending` until a webhook
confirms it, which cannot exist without a real provider.

## Commission (brief §49-51)

`commission_rules`: `business_id` override → `country_id` default → global default,
snapshotted at transaction time (the *rate applied* is stored in the ledger transaction's
metadata, so a later rule change never rewrites a historical booking's commission). Seeded
with one global row at **0%** — an explicit configuration value, not an invented number;
Super Admin can change it per country/business without a code deploy.

## Staff payouts (brief §52-56)

`staff_payout_rules`: staff+service specific → staff-wide → business default, `fixed_amount`
or `percentage` (never both required, at least one must be set). Earnings accrue as
`staff_payable` credits at the moment of a cash payment (cash-basis, not accrual-basis — a
deliberate V1 simplification, documented rather than silently chosen). A `staff_payouts`
table exists for recording when a business actually pays out an accrued balance (status
`pending`/`approved`/`paid`/`cancelled`/`failed`) — **the server function to create one was
not built in this project** (see Deferred); the schema and the underlying `staff_payable`
ledger accrual are real and tested, the payout-recording action itself is not yet wired to a
server function.

## Owner-as-specialist (brief §51 of Project 05, §58 here)

`resolveStaffPayoutRule` only fires when `bookings.staff_id` maps to a real `staff` row —
an owner performing a service without a `staff` row generates no `staff_payable` accrual
automatically, matching the brief's explicit instruction not to assume owner compensation
flows through this mechanism.

## Balances (brief §59-62)

`customer_balance`/`business_balance`/`promotional_credit` are all computed from the ledger
(never a stored/trusted column), with negative-balance protection (above). **Real consumer
today**: `adjustBalance` (Super Admin only, mandatory reason, posts a balanced
`dallty_payable` counter-entry). **No other consumer exists yet** — no subscription,
sponsorship, or affiliate system to spend a balance on, matching the brief's own "only
implement currently required consumers" instruction (§61).

## Currency (brief §64-67)

Every ledger row and payment row carries its own `currency`, referencing the existing
`currencies` table — never inferred. `amount` is `numeric(12,2)` (exact decimal, Postgres's
native fixed-point type — confirmed already the case for every monetary column in this
schema back in Project 04's audit, unchanged here) — never JavaScript floating point for
authoritative storage. Rounding in application code uses `Math.round(x * 100) / 100` to
2dp consistently before posting. Multi-currency/FX conversion: not built, per the brief's
explicit instruction — a business operates in its own country's currency only.

## Financial permissions (brief §74)

13 new permission keys (`payments.*`, `finance.*`, `balance.*`) added to Project 01's
`permissions` reference table — reference data only, **not yet consulted by any RLS policy
or server function's actual enforcement**, exactly like the rest of that permission system's
documented status. Real enforcement in this project uses the same pattern as every other
project: `owns_business()`/`is_business_staff()`/`is_super_admin()`, with `createRefund`
deliberately narrower (owner/admin only, not staff) to match §41's specific instruction.

## Webhooks and provider abstraction (brief §17-20, §69-71, §94-95)

`PaymentProvider` interface (`src/lib/payment-provider.ts`): `createPayment`/
`getPaymentStatus`/`cancelPayment`/`refundPayment`/`verifyWebhook`/`parseWebhookEvent` — the
contract every future adapter (CIB, Edahabia, Stripe...) implements, so core booking/ledger
code never depends on a specific provider's SDK. `reconcileWebhookEvent()` is a real,
usable-today function checking a webhook's reference/amount/currency against what Dallty
expected — returns `unknown_reference`/`amount_mismatch`/`currency_mismatch`/`ok`, never
silently accepting a mismatch (brief §70's exact scenario). **No adapter implementing this
interface was written** — there is no provider to adapt to. `payment_methods` for `cib`/
`edahabia` exist as real seeded rows with `active = false`, so the config-driven method list
is genuinely populated (not empty), while nothing pretends those methods actually work yet.

## IMPLEMENTED vs. PLANNED

**IMPLEMENTED, live-tested:** immutable ledger (UPDATE/DELETE blocked, verified with real
attack attempts); balanced double-entry posting (verified with a real multi-account
scenario); negative-balance protection (verified with a real overdraft attempt); cash
payment settlement with full overage/underage classification; commission calculation
(business→country→global hierarchy); staff-earning accrual; refund creation with
owner/admin-only authorization (verified) and exceeds-payment protection (verified); extra
services; deposit calculation (business-level); manual balance adjustment;
payment-method config table; webhook reconciliation guard function; idempotent cash payment
and refund (reusing Project 03's infrastructure).

**PLANNED, explicitly not built:** any real payment provider adapter (no credentials exist);
online deposit collection; `staff_payouts` row creation server function (the ledger accrual
side is real, the "record a payout was made" action is not wired up); country/plan-level
deposit-policy override table; tips allocation beyond "all to business balance" (specialist/
shared allocation needs a business-configuration UI that doesn't exist); tax calculation;
subscription/sponsorship/affiliate ledger consumers (the account types and `dallty_payable`
foundation exist; nothing generates those transactions yet, correctly, since those systems
don't exist); customer-facing payment UI (the existing booking page still uses its
pre-Project-06 payment display; wiring `markCashPayment`/deposit UI into
`business.$businessSlug.tsx`/the admin payments page was not attempted this pass, matching
Project 05's same scope discipline around that large, working file).
