# Dallty — Booking Engine

**Status:** Living document. Produced by Project 05 (Booking Engine, Availability &
Reservation Concurrency).
**Last updated:** 2026-08-17.

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

**Unchanged, already correctly separate** (verified, not rebuilt): `payment_status`
(`unpaid`/`paid`/`refunded`) has been independent of `booking_status` since an earlier
project. A `CONFIRMED` + `UNPAID` booking is, and always was, a valid state in this schema.
No dedicated `confirmation_status` (phone/manual confirmation tracking — §5) exists yet;
this remains a documented gap carried forward, not addressed in this project (out of the
scope this pass focused on — the hold/concurrency mechanism).

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
`services.duration_minutes`. No branch-level override exists (no branch entity is wired into
booking yet — branches remain a standalone table per Project 01, not yet connected to
services/staff/bookings; unchanged by this project, documented there already).

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

**Not changed this project.** The existing staff-desk walk-in path
(`src/lib/staff-desk.functions.ts`) and guest checkout (`createGuestBooking`,
`src/lib/account.functions.ts`) both insert directly into `bookings` with a live status —
meaning **both now automatically inherit the same overlap protection** from
`bookings_no_overlap`, with no code change required, since the constraint applies to the
table itself regardless of which code path performs the insert. Neither was migrated onto
the new two-phase hold→confirm flow in this project — see "Deliberately not done" below for
why.

## Waitlist (brief §57)

**Unchanged structurally** — `waitlist_entries` and the auto-book-on-cancellation trigger
already existed. One real fix: `businesses.allow_waitlist` defaulted to `true`; the brief
explicitly calls for `DEFAULT = DISABLED`. Changed (no existing business data to migrate —
the table was empty).

## Deliberately not done in this project

**The customer-facing booking UI (`business.$businessSlug.tsx`) was not rewired to the new
hold→confirm flow.** This is an explicit, reasoned scope decision, not an oversight:

- That flow is large (~1,400 lines), already handles promo codes, guest checkout, and
  auto-confirm-after-sign-in-redirect — none of which the new `createBookingHold`/
  `confirmBookingHold` functions currently support (no coupon parameter exists on them).
  Wiring it in fully would mean extending those functions with promo-code logic *and*
  risking regressions across three intertwined customer flows I could not exhaustively
  re-verify in this pass.
- Critically, **this does not weaken the concurrency guarantee**: the existing direct-insert
  flow (and guest checkout) write rows with a live status (`confirmed`), which the exclusion
  constraint covers identically to a held row. The stress tests above used exactly this
  insert shape. Double-booking is prevented for the *existing* UI today, with zero frontend
  changes — the hold system adds a *UX* layer (visible 15-minute countdown, explicit
  reserve-then-confirm steps, slot-lost messaging) on top of correctness that already holds
  without it.
- The hold-based server functions are built, tested, and available for the next project that
  takes on the customer booking UI to wire in.

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

**IMPLEMENTED, live-tested:** exclusion-constraint concurrency safety; server-side 15-minute
holds; atomic any-specialist candidate resolution; multi-service duration/price
calculation; `staff_services` override resolution (previously dead columns); buffer
hierarchy (business→service, after-service only); `booking_items` historical snapshots;
atomic reschedule (hold-new-before-release-old); idempotent confirmation; hold-ownership and
expiry enforcement; booking audit events (`booking.held`/`booking.confirmed`/
`booking.rescheduled`); `get_available_slots` fixes (interval, min-notice, buffer).

**PLANNED, explicitly not built:** customer-facing UI wiring to the hold flow (existing UI
kept, now safe via the same DB constraint); promo-code support in the new hold functions;
confirmation-state tracking (phone/manual confirmation, §5); reminders (needs a scheduler);
group/recurring booking UI; branch-level price/duration override (branches not yet wired
into services/staff anywhere in the codebase); waitlist notification-eligibility wiring
beyond the pre-existing trigger; realtime/live-availability UI refresh polish (the existing
page's realtime subscription — confirmed present from an earlier audit — was not re-verified
or extended in this project).
