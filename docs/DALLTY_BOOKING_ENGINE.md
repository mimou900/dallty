# Dallty — Booking Engine

**Status:** Living document. Produced by Project 05 (Booking Engine, Availability &
Reservation Concurrency); extended by Project 09 (Booking Engine & Availability Foundation —
branch-awareness, availability rewrite, confirmation state machine); extended by Project 10
(Customer Booking HOLD → CONFIRMATION Flow — closed the direct-insert path this document's own
Project 09 section flagged as still open).
**Last updated:** 2026-08-19.

## Project 10 update (2026-08-19) — customer UI moved onto hold→confirm; direct-insert closed

Project 09 built and live-tested `createBookingHold`/`confirmBookingHold`, but explicitly left
them unwired to any UI (see the Project 09 section below, "Deliberately not done") — the
customer-facing flow kept inserting a live-status row directly, and guest checkout
(`createGuestBooking`) did too. Project 10 closes that gap for both signed-in and guest
customers, and fixes three previously-invisible bugs found only by calling the real deployed
HTTP endpoints instead of testing the database layer in isolation.

1. **Guest hold support.** `createGuestBookingHold`/`confirmGuestBookingHold`/
   `cancelGuestBookingHold` — no Supabase session required, sharing the exact same `holdCore`/
   `confirmCore` internals as the signed-in path (not a second engine). A guest hold is created
   anonymously (`guest_hold_token`, a server-generated random UUID, is the ownership proof —
   never a client-supplied id); contact details are collected only at confirm time, matching
   when the UI actually has them. `createGuestBooking` (the old direct-insert function) is
   deleted outright, not deprecated.

2. **`branch_services` finally consulted.** The gap this document flagged in "Duration and
   price resolution" above — `resolveServiceLines` never read `branch_services` — is closed.
   Price/duration hierarchy, most specific wins: `staff_services` scoped to this branch → this
   staff member's global `staff_services` override → `branch_services` → the service's own
   default. `eligibleStaffIds` also now requires `staff_branches` assignment to the requested
   branch, closing a related gap where a hold could be created against a specialist who
   doesn't work at the selected branch at all.

3. **Coupons move to confirm time.** The pre-existing UI applies a promo code at the
   confirmation step, which now comes *after* hold creation — so the discount is resolved
   fresh from `check_promo_code` at confirm, not carried over from hold creation (a code valid
   when the hold was created could have expired or exhausted its uses minutes later; confirm
   is where it's re-verified, same principle as re-verifying the slot itself).

4. **Client state machine.** `business.$businessSlug.tsx`: IDLE → HOLDING → HELD → CONFIRMING →
   SUCCESS, with HOLD_EXPIRED/SLOT_UNAVAILABLE/ERROR side exits — every transition reflects a
   server response, never an optimistic guess. Picking a time now creates the hold immediately
   (same instant the UI visually "locks" it); a countdown shows the server-issued
   `hold_expires_at`, purely cosmetic since confirm always re-checks server-side regardless of
   what the countdown shows. Confirm sends a client-generated idempotency key, reused across
   retries for that hold, so a flaky connection or double-tap can't create two bookings.

5. **Direct customer-insert path closed at the database, not just the UI.** Dropped the
   `authenticated`-role "Customers create own bookings" RLS INSERT policy on `bookings` — the
   only remaining INSERT policy for that table is the staff/owner one
   (`admin/appointments.tsx`'s manual booking-duplicate feature, out of this project's scope,
   still works via it). `bookings_identity_present` extended so an anonymous guest hold (no
   `customer_id`, no `customer_name`/`customer_phone` yet) still satisfies the constraint via
   `guest_hold_token IS NOT NULL`.

6. **Three critical, previously-invisible bugs — found by calling the real deployed HTTP
   server-function endpoints for the first time, not by testing the database layer alone.**
   `confirmBookingHold` has existed since Project 09 Phase 3; nothing had ever actually called
   it end-to-end until this project wired a UI (and, for verification, a script) to it.
   - `guard_bookings_customer_update()` (Project 03's anti-mass-assignment trigger) fires for
     `service_role` UPDATEs too — `BYPASSRLS` skips RLS *policy* checks, not table *triggers*.
     Its non-privileged branch only ever allowed `status → 'cancelled'`; every hold→confirm
     transition (`held→pending/confirmed`, and `held→expired` via cancel/sweep) was silently
     rejected with "You may only cancel or reschedule your own booking". **Confirming a hold
     has never actually worked in production before this fix.** Fixed by treating
     `auth.uid() IS NULL` (a service-role call carries no JWT) as privileged — safe because
     RLS's own UPDATE policy already requires a non-null `auth.uid()` for any authenticated
     actor to reach a row at all, so no attacker-controlled request can ever present as
     `auth.uid() IS NULL` here.
   - `idempotency_keys`' `UNIQUE (actor_id, operation, idempotency_key)` never deduplicated for
     `actor_id = NULL` (guests) — standard SQL treats `NULL` as distinct from `NULL`. Two guest
     confirm attempts with the identical idempotency key just inserted two separate rows and
     ran the confirm logic twice; no duplicate booking resulted only because the confirm
     logic's own status re-check happened to catch the second run (and returned the wrong
     response, not a duplicate). Fixed with a unique index on
     `COALESCE(actor_id, '00000000-...')`.
   - `withIdempotency()`'s cached-response lookup used `.eq("actor_id", actorId)`
     unconditionally — for `actorId = null` this compiles to `actor_id = null`, which (like
     plain SQL) never matches anything, so a guest could never retrieve their own completed
     response on retry, only ever `DuplicateRequestError`. Fixed to use `.is("actor_id", null)`
     when `actorId` is null.
   - All three verified live against the Preview deployment after each fix: 12 genuinely
     concurrent `createGuestBookingHold` HTTP requests for the identical slot → 1 success, 11
     `SLOT_UNAVAILABLE`; a same-key confirm retry after the original completed now returns the
     identical cached booking instead of an error; forged `guestToken` → `UNAUTHORIZED_BOOKING`;
     nonexistent hold id → `BOOKING_NOT_FOUND`; a hold whose `hold_expires_at` was forced into
     the past → `HOLD_EXPIRED`, and the row correctly flips to `status = 'expired'`.

**Still not built, carried forward honestly**: a dedicated confirmation-call UI and a dedicated
walk-in-booking UI for the staff/business dashboard — the server functions
(`recordBookingConfirmation`, `createWalkInBooking`) have existed since Project 09 and remain
callable, but no dashboard screen drives them yet.

## Project 09 update (2026-08-19) — branches, availability rewrite, confirmation state machine

Project 05 (above) built the concurrency-safe hold system and fixed the availability engine's
dead-column bugs, but explicitly left branches, walk-ins-as-a-real-flow, and confirmation-call
tracking undone (see "Deliberately not done" and the summary at the bottom — both sections
below are updated to reflect what changed). Nine phases, each independently committed, built,
and Preview-verified before the next started:

1. **Branch-aware schema foundation.** Branches were a standalone table since Project 01 —
   never connected to hours, staff assignment, or bookings. Added: `staff_branches`
   (many-to-many, `is_primary`), `branch_hours`/`staff_branch_schedules`/
   `staff_branch_day_hours` (multi-interval per day — no unique constraint on
   `(scope, weekday)`, deliberately, so split shifts are representable), `branch_services`
   (branch-specific price/duration/availability override), `staff_services.branch_id`
   (nullable — NULL means "applies at every branch", a value overrides for one), `holidays`
   (country/business/branch scope, with exceptional-opening support), `temporary_blocks`
   (short-notice, branch-wide or staff-targeted). `bookings.branch_id`, `booking_items.branch_id`,
   `waitlist_entries.branch_id` — every booking now resolves to a specific branch at creation
   and never infers it from the business afterward. Two triggers
   (`businesses_create_main_branch`, `staff_create_primary_branch`) guarantee every business
   always has a Main branch and every staff member always has a primary branch, so downstream
   code can treat both as invariants instead of needing fallback queries.

2. **Availability engine rewrite.** `get_available_slots` (and the three functions built on
   it — `get_staff_day_availability`, `get_business_availability_summary`,
   `get_business_next_available`) now compute available time as **branch hours ∩ staff hours
   at that branch, minus breaks, time-off, holiday closures, and temporary blocks**, using
   Postgres `tstzrange`/`tstzmultirange` for correct interval intersection/subtraction instead
   of the old single-daily-window assumption. Booking-conflict checks stayed staff-wide, not
   branch-scoped, deliberately — one person cannot be double-booked across two branches at the
   same time. Verified live with a rolled-back transactional test against real branch hours,
   staff hours, and a lunch break, including correct `Africa/Algiers` (UTC+1) timezone
   conversion — the multirange result matched the hand-computed expected windows exactly.
   `resolve_buffer_minutes` gained a branch tier: service → branch → business → country default
   → 0.

3. **Booking reference codes + configurable hold duration.** Every booking gets an 8-character
   non-enumerable reference code (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` alphabet, no 0/O/1/I/L),
   generated via a Postgres column `DEFAULT` (not a trigger — see the code comment in
   `20260818041000_booking_reference_column_default.sql` for why a trigger was tried first and
   reverted) so it applies to every insert path uniformly. Hold duration moved from a hardcoded
   15-minute constant to `countries.default_hold_minutes` → `businesses.hold_minutes`
   (nullable override), defaulting to 15 everywhere until a Super Admin changes it.

4. **Confirmation state machine.** The third state machine the original brief called for,
   alongside `booking_status` and `payment_status`: `bookings.confirmation_status`
   (`not_required`/`pending`/`confirmed`/`unreachable`/`declined`), opt-in per business
   (`businesses.require_confirmation_call`), initialized by a trigger the moment a booking
   first becomes real — never re-touched by a later reschedule or status change once set, so an
   in-progress or completed call record can't be silently reset. `recordBookingConfirmation`
   lets any staff member or the business owner record the outcome.

5. **Walk-ins / guest-creation flow.** `createWalkInBooking` — any staff member or the business
   owner can book any specialist at the business (not just their own calendar, unlike
   `createMyAppointment`) for either an existing customer or a brand-new guest (name + phone,
   matching the `bookings_identity_present` check constraint). Skips the hold phase entirely
   (goes straight to `confirmed`) since the customer is already present; still protected by the
   same exclusion constraint against a concurrent online booking.

6. **Customer branch-selection UI.** `business.$businessSlug.tsx` gained a branch-choice screen
   (Business → Branch → Services → ... ) shown only when a business has more than one active
   branch; a single-branch business — every real business today — auto-skips it with zero
   visible change. Implemented as a pre-step gate rendered before the existing six-step
   `STEPS` state machine rather than inserting "Branch" as a new numbered step into it: that
   array and every `setStep(n)` call across the file are index-coupled, and renumbering all of
   them carried materially higher regression risk than gating render on
   `branchesQuery.data.length`. **Not done**: migrating this flow onto the hold-then-confirm
   system (see "Deliberately not done" below, carried forward and re-confirmed still correct).

7. **Dashboard branch-awareness — and a critical fix.** While wiring this up, found that the
   business settings hours editor and the staff working-hours editor both still wrote to
   `business_hours`/`staff_schedules`/`staff_day_hours` — the tables step 2's rewrite stopped
   reading from. Saving hours through either admin page produced a success toast with **zero
   effect on real availability** from the moment step 2 shipped until this fix. Both now target
   `branch_hours`/`staff_branch_schedules`/`staff_branch_day_hours`; the day-hours editor's
   `upsert` became an explicit delete-then-insert since neither new table carries a unique
   constraint (deliberate, for future split-shift support — `ON CONFLICT` needs one).

8. **Real concurrency test + security test pass.** `scripts/concurrency-test.mjs`: 12
   genuinely concurrent `INSERT` attempts — separate HTTP requests to separate Postgres
   connections, not statements inside one transaction — at the identical staff+time slot
   against the live database. Result: 1 succeeded, 11 failed with exclusion-violation code
   `23P01`. Security pass: simulated an attacker with no relationship to the target business
   (`SET LOCAL ROLE authenticated` + a foreign JWT claim) and attempted cross-business writes
   against `branch_hours`, `staff_branch_schedules`, `holidays`, `temporary_blocks` — RLS
   correctly rejected all four. **That same pass found a real, live vulnerability**: the five
   functions rewritten in step 2 were callable directly by any `anon`/`authenticated` caller via
   `supabase.rpc(...)`, bypassing the rate-limited server-function wrappers entirely — step 2's
   migration had revoked access `FROM PUBLIC`, but this project grants `EXECUTE` to `anon`/
   `authenticated` directly at `CREATE FUNCTION` time (`ALTER DEFAULT PRIVILEGES`), and
   `REVOKE ... FROM PUBLIC` does not touch a grant a role already holds by name — the same root
   cause, and same fix (`REVOKE ... FROM anon, authenticated` by name), as the original Security
   Anti-Fraud project's RPC lockdown. Confirmed live both before the fix (an anon-role call
   succeeded) and after (the identical call fails with "permission denied").

See `docs/DALLTY_MASTER_ARCHITECTURE.md` and `docs/DALLTY_IMPLEMENTATION_ROADMAP.md` for how
this fits the platform-wide picture; the section-by-section detail below (Project 05's original
text) is superseded where it conflicts with this update and left as-is where it still holds.

The single most important fact in this document: **the concurrency-safety mechanism was
live-tested against the real database with real concurrent requests, not assumed correct
from reading SQL.** Results are reported verbatim below, not summarized optimistically.

## The concurrency mechanism — read this first

Before this project, the only overlap protection was a `UNIQUE INDEX` on
`(staff_id, starts_at)` — it caught two bookings sharing the *exact same* start timestamp
only. Two bookings for the same staff member with different-but-overlapping times (the
common case — variable-duration services, or any hold/booking race) could both succeed. This
was a documented, known gap carried forward from Project 00's audit.

**Fixed with a PostgreSQL exclusion constraint** (`bookings_no_overlap`, requires the
`btree_gist` extension):

```sql
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status IN ('held', 'pending', 'confirmed'));
```

This means: **no two rows for the same `staff_id` may have overlapping `[starts_at, ends_at)`
ranges while in a "live" status, ever, enforced by Postgres itself at write time.** This is
not an application-level check-then-insert (vulnerable to TOCTOU races — "we check
availability before insert" is explicitly *not* sufficient, per the brief's own §75) — it's
the database's own atomicity guarantee, the same class of mechanism used for e.g. preventing
two people from taking the same airline seat.

### Live test results (not simulated, not assumed)

**Test 1 — single specialist, overlapping-but-offset times:** 20 concurrent `INSERT`
requests fired via `Promise.allSettled` against the real database, for the same staff
member, at 20 different start times each 1 minute apart (all overlapping the same 30-minute
service window — deliberately *not* identical timestamps, to prove this catches real
overlap, not just exact-match duplicates).

```
Succeeded: 1 / Failed: 19
Sample failure reason: conflicting key value violates exclusion constraint "bookings_no_overlap"
Actual booking rows created: 1
Overlap found among created rows: false
CONCURRENCY TEST PASSED: exactly 1 booking succeeded, zero overlaps.
```

**Test 2 — multi-specialist capacity:** 30 concurrent requests for the exact same time slot,
10 each against 3 different staff members, to confirm capacity scales correctly (not
globally serialized to 1, not allowed to exceed 3).

```
Total attempts: 30 / Succeeded: 3 (expected exactly 3)
Bookings per staff: {"...":1,"...":1,"...":1}
MULTI-SPECIALIST CAPACITY TEST PASSED: exactly 1 booking per specialist, total capacity respected.
```

Both tests created real rows in the real Supabase project via the service-role client,
verified the actual row counts and time ranges afterward (not just trusting the insert
response), and cleaned up afterward. Full test scripts are reproducible — nothing here is
inferred from reading the constraint definition.

### Why folded into `bookings`, not a separate `booking_holds` table

A "hold" is a `bookings` row with `status = 'held'` and `hold_expires_at` set — not a second
table. This means the *same* exclusion constraint that protects confirmed bookings from each
other also protects them from holds, and holds from each other, with zero additional code
and zero risk of the two systems disagreeing about whether a slot is taken. The brief itself
warns against duplicate booking/availability systems (§83); this is that principle applied to
the hold mechanism specifically.

## Booking state machine (brief §3)

`booking_status` enum, extended this project: `pending`, `confirmed`, `completed`,
`cancelled` (pre-existing) + `held`, `expired`, `no_show` (added).

**Not added, and why:** `in_progress` (no live-appointment-tracking UI exists to consume
it), `refunded` (ties to a payment system that doesn't exist yet), `rescheduled` (represented
instead as an in-place update to `starts_at`/`ends_at` plus an `admin_audit_log` entry
recording the old values — see Rescheduling below — rather than a terminal status that every
status-reading call site would need to special-case). `pending_confirmation` was not added
as a distinct value from the existing `pending` — verified by reading every call site in
earlier audits that `pending` already means exactly "awaiting confirmation" in this
codebase's actual usage; adding a second, differently-spelled value for the same concept
would itself be the duplication this project is warned against.

## Payment state / confirmation state (brief §4-5)

`payment_status` (`unpaid`/`paid`/`refunded`) has been independent of `booking_status` since
an earlier project — unchanged. A `CONFIRMED` + `UNPAID` booking is, and always was, a valid
state in this schema.

**As of Project 09**, `confirmation_status` (phone/manual pre-appointment confirmation
tracking — §5) exists as the third, independent state machine: `not_required`/`pending`/
`confirmed`/`unreachable`/`declined`, opt-in per business via
`businesses.require_confirmation_call`. See the Project 09 update at the top of this document
for the trigger design and its re-trigger-avoidance guarantee.

## Hold system (brief §6-9, §36-39)

- **Creation** (`createBookingHold`, `src/lib/booking-engine.functions.ts`): validates
  business/service/specialist eligibility server-side, resolves duration and price from
  `services`/`staff_services` (never from the client — the input schema has no price or
  duration field at all, so client-side price injection is structurally impossible, not just
  checked), computes buffer, and inserts a `held` row with `hold_expires_at = now() + 15
  minutes`. Rate-limited per-user and per-IP (reuses Project 03's generic limiter) against
  repeated-hold abuse.
- **Expiration**: lazy, not a scheduled job (no `pg_cron` or equivalent exists in this
  project). Every hold-creation call first runs `sweep_expired_holds()`, which flips
  overdue `held` rows to `expired`. More importantly, `get_available_slots` and the
  overlap-blocking logic treat any `held` row past its `hold_expires_at` as **already
  non-blocking**, regardless of whether the sweep has run yet — so an abandoned hold can
  never make a slot appear falsely unavailable, even in the gap before cleanup.
- **Confirmation** (`confirmBookingHold`): re-validates ownership (`customer_id` must match
  the caller — tested live: a second user attempting to confirm another user's hold affects
  zero rows), re-validates the hold hasn't expired (tested live: an expired hold cannot be
  confirmed, zero rows affected), wrapped in Project 03's `withIdempotency` helper keyed by
  (actor, operation, a client-supplied or hold-id-derived key) so a double-click or network
  retry returns the original result instead of creating a second booking.
- **Cancellation** (`cancelBookingHold`): lets a customer release a hold early.

## Availability algorithm (brief §17-20, §28-32)

`get_available_slots(staff_id, service_id, day)` — rewritten this project to close three
real, previously-**dead-column** gaps found while auditing it (columns existed on
`businesses` since an earlier project but were never read by this function):

- **`slot_interval_minutes`** — was hardcoded to a 30-minute step regardless of what a
  business configured; now reads the business's own value.
- **`min_notice_hours`** — was never enforced; a slot 2 minutes in the future could be
  offered as bookable even if the business required, say, 1 hour's notice. Now enforced both
  here and again independently inside `createBookingHold` (defense in depth — never trust
  that a slot offered earlier is still valid without re-checking, per §12/§36).
- **Buffer** (`buffer_minutes`, resolved via the new business→service hierarchy) — was not
  reserved at all; back-to-back bookings could be offered with zero cleanup time between
  them. Now the blocking window is `duration + buffer`, not just `duration`.

A `held` row with an unexpired `hold_expires_at` now blocks a slot exactly like a real
booking (the entire point of the hold system); an expired one does not (see above).

**Not changed:** the underlying business/branch/specialist-hours intersection logic, break
handling, and holiday/time-off checks — all pre-existing and confirmed still correct, not
touched.

## Duration and price resolution (brief §26-27)

`staff_services.custom_price`/`custom_duration_minutes` — columns that existed in the schema
since an earlier project but were confirmed **dead** (never consulted by any booking path) in
Project 00's audit — are now the first tier actually read: effective duration/price =
`staff_services` override, falling back to `services.discount_price ?? services.price` /
`services.duration_minutes`.

**As of Project 09**, branches are fully wired into booking (see the Project 09 update at the
top): `branch_services` overrides price/duration/availability per branch, `staff_services`
gained a nullable `branch_id` for branch-specific specialist pricing, and buffer resolution
gained a branch tier (service → branch → business → country default).

**As of Project 10**, `resolveServiceLines` (the actual resolution path `createBookingHold`/
`createGuestBookingHold`/`createWalkInBooking` all use) finally reads both: hierarchy, most
specific wins — `staff_services` scoped to the branch → `staff_services` global →
`branch_services` → `services.discount_price ?? services.price`/`duration_minutes`.

## Multi-service booking (brief §13-14)

`createBookingHold` accepts `serviceIds: string[]` (1–10 services). Total duration is the
sum of each resolved service's duration; buffer is resolved once (using the first selected
service) and applied once, after the combined block — not per-service-cumulative buffer, a
deliberate simplification given the brief's own instruction to keep V1 simple. Each selected
service becomes its own `booking_items` row (see Historical Immutability below).

## "Any specialist" (brief §15-16)

When `staffId` is `null`, eligible candidates are every staff member assigned to **all**
selected services (validated via `staff_services`, not client-trusted), sorted by a stable,
deterministic key (staff id) — never random. `createBookingHold` then attempts the atomic
insert for each candidate **in order** until one succeeds; because each attempt is
independently and atomically checked by the exclusion constraint, trying multiple candidates
in sequence introduces no race condition of its own — the DB is still the sole arbiter of
which one actually gets the slot.

## Rescheduling (brief §42-43)

`reschedule_booking()` — a single Postgres function (`SECURITY DEFINER`), not multiple
round-trips from application code. A Postgres function body is one transaction: it inserts
the new slot first (protected by the same exclusion constraint — if the new time isn't
actually free, the `INSERT` raises and the **entire function aborts**, so the old booking is
never touched), and only on success does it cancel the old row and copy the itemized
`booking_items` snapshot across. This satisfies "never release the old slot before securing
the new one" through ordinary transaction semantics rather than app-level sequencing that
could be interrupted. Old start/end times, actor, and reason are recorded in
`admin_audit_log` (`booking.rescheduled`), preserving history.

## Historical immutability (brief §40-41)

New `booking_items` table: one row per selected service per booking, storing `service_name`,
`duration_minutes`, `price`, and `currency` **as they were at booking time** — not a live
join to `services`. A service's price changing tomorrow never rewrites yesterday's booking
total. `bookings.service_id`/`total_price` continue to represent the primary service and
overall total (unchanged shape, so every existing consumer — staff desk, dashboards, reports
— keeps working against the same columns it always has).

## Timezone handling (brief §33-35)

**Unchanged, already correct** (verified, not rebuilt): `starts_at`/`ends_at` are
`timestamptz` (UTC-normalized storage, Postgres's standard and correct representation),
resolved against the business's IANA timezone (`businesses.timezone`, e.g. `Africa/Algiers`)
via `AT TIME ZONE`, which correctly handles DST transitions natively — this was never
manual UTC-offset arithmetic, in this codebase or after this project.

## Walk-ins, guest customers (brief §46-48)

`createMyAppointment` (`src/lib/staff-desk.functions.ts`) still inserts directly into
`bookings` with a live status, protected identically by `bookings_no_overlap` — staff-facing,
out of Project 10's scope (see the Project 10 update at the top: only the *customer*-facing
direct-insert path was in scope, staff/walk-in paths are explicitly exempted). Guest checkout
no longer does: `createGuestBooking` (`src/lib/account.functions.ts`) is deleted as of Project
10, replaced by `createGuestBookingHold`/`confirmGuestBookingHold` — see the Project 10 update
at the top.

**As of Project 09**, a real gap this left is closed: `createMyAppointment` only ever books
the *signed-in specialist's own* calendar for an *existing* customer — there was no path for
reception to book a walk-in against any specialist at the business, or for a customer with no
account at all. `createWalkInBooking` (`src/lib/booking-engine.functions.ts`) covers both:
any staff member or the business owner, any specialist at the business, existing customer or
guest name+phone. Goes straight to `confirmed` (no hold phase — the customer is already
present).

## Waitlist (brief §57)

**Unchanged structurally** — `waitlist_entries` and the auto-book-on-cancellation trigger
already existed. One real fix: `businesses.allow_waitlist` defaulted to `true`; the brief
explicitly calls for `DEFAULT = DISABLED`. Changed (no existing business data to migrate —
the table was empty).

## Deliberately not done in this project

**As of Project 10**, the item that lived here through Project 05 and Project 09 — "the
customer-facing booking UI was not rewired to the hold→confirm flow" — is done; see the
Project 10 update at the top. What's still genuinely open:

**No dedicated dashboard UI for the confirmation-call queue or for launching a walk-in
booking.** `recordBookingConfirmation` and `createWalkInBooking` (Project 09) are real,
callable, tested server functions with no screen driving them yet.

**Reminders** (§56): need a server-side scheduled job (24h/1h/15min before); no `pg_cron` or
equivalent exists in this project. Not built — would be theater without a real scheduler.

**Group/recurring bookings** (§58-59): confirmed the schema doesn't block them (a booking is
still one row per appointment instance; nothing added this project makes grouping or
recurrence structurally harder). Not built, per the brief's own instruction.

**Full payment/deposit/tax price components** (§71): out of scope, no payment system exists.

## What was tested (live, against the real database — not simulated)

1. **Concurrency, single specialist**: 20 concurrent overlapping-but-offset requests → 1
   success, 19 correctly rejected, zero overlaps in the resulting data.
2. **Concurrency, multi-specialist capacity**: 30 concurrent requests across 3 staff → 3
   successes (1 per staff), capacity neither over- nor under-counted.
3. **Hold hijacking**: a second, RLS-authenticated user attempting to confirm another
   customer's hold → 0 rows affected, hold left untouched and still owned by the original
   customer.
4. **Expired hold confirmation**: an already-expired hold cannot be confirmed → 0 rows
   affected.
5. **Fake price injection**: confirmed structurally impossible — `createBookingHold`'s input
   schema has no price or duration field for a client to supply in the first place.

## IMPLEMENTED vs. PLANNED summary

**IMPLEMENTED, live-tested (Project 05):** exclusion-constraint concurrency safety;
server-side 15-minute holds; atomic any-specialist candidate resolution; multi-service
duration/price calculation; `staff_services` override resolution (previously dead columns);
buffer hierarchy (business→service, after-service only); `booking_items` historical
snapshots; atomic reschedule (hold-new-before-release-old); idempotent confirmation;
hold-ownership and expiry enforcement; booking audit events (`booking.held`/
`booking.confirmed`/`booking.rescheduled`); `get_available_slots` fixes (interval, min-notice,
buffer).

**IMPLEMENTED, live-tested (Project 09):** full branch-aware schema (branches wired into
hours, staff assignment, services, holidays, blocks, bookings); availability engine rewritten
onto branch-scoped tables with correct multi-interval/timezone math; buffer hierarchy extended
with a branch tier; booking reference codes; configurable hold duration (country/business);
confirmation-call state machine; `createWalkInBooking` (any staff, any specialist, guest or
existing customer); customer branch-selection UI; a critical fix to two admin hours editors
that had gone silently disconnected from the rewritten engine; a real 12-way concurrency test;
a security test pass that found and fixed a live RPC-authorization exposure.

**IMPLEMENTED, live-tested (Project 10):** customer-facing UI (signed-in and guest) wired onto
`createBookingHold`/`confirmBookingHold`/`createGuestBookingHold`/`confirmGuestBookingHold`;
guest hold ownership via server-issued `guest_hold_token`; `resolveServiceLines` now reads
`branch_services` and branch-scoped `staff_services`; coupon resolution moved to confirm time;
client-side booking state machine with a visible (non-authoritative) hold countdown;
idempotency-key reuse across confirm retries; the old `createGuestBooking` direct-insert
function deleted; the customer INSERT RLS policy on `bookings` dropped (staff/owner INSERT
policy, used by an unrelated admin feature, left intact); three critical bugs found and fixed
by testing the real deployed HTTP endpoints for the first time
(`guard_bookings_customer_update` blocking every hold→confirm transition since Project 09;
`idempotency_keys`' NULL-actor_id dedup gap; `withIdempotency`'s NULL-actor_id cached-response
lookup gap) — all three verified live against the Preview afterward.

**PLANNED, explicitly not built:** reminders (needs a scheduler); group/recurring booking UI;
waitlist notification-eligibility wiring beyond the pre-existing trigger; realtime/
live-availability UI refresh polish (unchanged since Project 05); a dedicated dashboard UI for
staff to work the confirmation-call queue or launch a walk-in booking (the server functions
exist; the buttons/screens to drive them from the staff/business dashboard don't yet).
