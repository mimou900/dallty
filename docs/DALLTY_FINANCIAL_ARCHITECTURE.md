# Dallty — Financial Architecture

**Status:** Living document. Produced by Project 06 (Payments, Deposits, Cash Settlement &
Financial Ledger); extended by Project 12 (Central Financial Ledger + Revenue + Commissions
+ Payouts — staff payout recording, deposit collection, no-show policy, reconciliation,
affiliate and business-referral foundations, country payout config). **Project 12 is
code-complete on branch `project-12-financial-ledger`, not yet merged to `main` or
deployed** — everything in the Project 12 update section below is real, working code,
verified only on that branch.
**Last updated:** 2026-08-21.

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
