# Dallty — Master Architecture

**Status:** Living document. The single authoritative architecture index for Dallty. Every
other `docs/DALLTY_*.md` file is a detail doc for one subsystem — this file is what a new
session should read first, and it links out rather than duplicating their content.

**Produced by:** Project 00 (Master Architecture, Codebase Audit & Foundation).
**Updated by:** Project 01 (Database & Core Domain Foundation), Project 02 (Identity &
Authentication), Project 03 (Security, Anti-Bot, Anti-Fraud Foundation), Project 04
(International/Country/Currency), Project 05 (Booking Engine & Concurrency), Project 06
(Payments & Financial Ledger), Project 07 (Notifications & Reminders), Project 08
(Marketplace & Discovery), the Lovable-removal project, and Project 09 (branch-aware
booking engine).
**Restructured 2026-08-19** into the 22-topic + Project-Status index shape below, from the
prior lettered-section (§A–§W) structure. No factual claim was invented in the restructure —
every statement here traces back to an existing `docs/DALLTY_*.md` file, a migration file, or
a direct repository/git check performed while writing this version. Anything that could not
be verified this way is marked **UNKNOWN** rather than guessed.

**Read `DALLTY_AI_IMPLEMENTATION_RULES.md` before making any change** — it is the binding
contract for how future work on this codebase must proceed (extend, never duplicate; verify
before claiming done; document in the same change, not as a follow-up).

---

## 1. Product vision

"Dallty is the digital storefront and booking infrastructure for appointment-based
businesses." Dallty gives appointment-based businesses (salons, barbershops, spas, nail
studios, gyms, clinics, and future categories) a public digital presence, booking system,
customer management, staff management, payments, marketing and marketplace exposure without
requiring them to build their own website.

Algeria is the launch market. The architecture is not Algeria-specific by design — every place
the code once hardcoded a Gulf-region or Algeria-only assumption has been treated as technical
debt to remove, not permanent design (see §12–14, §20).

Brand: **Dallty** (Latin), **دالّتي** (Arabic, never translated, used as a brand term only).
The uploaded logo is the visual source of truth (`dallty-mark.png` compact mark,
`dallty-wordmark.png` full lockup — real bundled files under `src/assets/`) — not to be
redesigned by future work.

**Core technical principles** (binding on all future work, detailed in
`DALLTY_AI_IMPLEMENTATION_RULES.md`):
1. The backend technical entity is always `Business`, never a category-specific noun.
2. Frontend terminology may adapt per category; backend never does.
3. Server-side authorization is mandatory for every mutation — a client-side check is UX
   convenience, never the security boundary.
4. Configuration over hardcoding for anything that varies by country/language/plan/role/
   business — but only build a configuration table when it has a real consumer.
5. Additive, forward-only migrations. Never edit a historical migration file.
6. One Business application, role-based views — not fragmented codebases per role.
7. RTL and i18n are data-driven, never `lang === "ar"` conditionals.
8. Don't build ahead of a consumer.

---

## 2. Current production architecture

**Live today at `https://www.dallty.com`** (verified 2026-08-19, post Project 09 deployment).

```
Browser
  │
  ▼
Cloudflare (DNS layer — dallty.com 308-redirects to www.dallty.com; proxy OFF on both
            records, per Vercel's own requirement for custom-domain verification)
  │
  ▼
Vercel (Production environment — auto-deploys on push to `main`, Nitro's `vercel` preset,
        Build Output API v3)
  │
  ▼
TanStack Start server functions (createServerFn) — the one place app code runs trusted
  │  service-role client (bypasses RLS) OR request-scoped client (RLS-bound)
  ▼
Supabase (Postgres + Auth + Storage + Realtime) — RLS is the actual, final enforcement layer
  │
  ├─► Resend (transactional email, `EmailProvider` abstraction — active if `RESEND_API_KEY`
  │    is set, else `NullEmailProvider` logs and fails soft)
  └─► Google Maps / Routes API (browser Maps JS + server-side travel-time calls)
```

Current production commit: `3739477` (merge of `booking-engine-branches-foundation` into
`main`, Project 09). Verified live at deploy time: homepage, `/auth`, `/search`, a business
detail page, and real Supabase REST calls (200 responses) all confirmed working against this
exact commit. See §19 for the full deployment architecture and §20 for Lovable-independence
verification.

**No CI pipeline exists** (`.github/workflows` — confirmed absent). `npm run lint` and
`npx tsc --noEmit` and `npm run build` are run manually before every push; there is no
automated gate. `package.json` has no `test` script — no automated test suite exists anywhere
in this repository (confirmed by reading `package.json`'s `scripts` block directly).

---

## 3. Repository architecture

Single repository, TypeScript throughout: **TanStack Start** (file-based routing, SSR),
**React 19**, **Supabase** (Postgres + Auth + Storage + Realtime) as the sole backend,
**Tailwind v4** + **shadcn/ui** for styling, **Vite** as the build tool with Nitro's `vercel`
preset for the production build target.

**Route structure (verified against `src/routes/`):**
- Public marketplace: `/`, `/search`, `/business/$businessSlug` (canonical), plus legacy
  redirect shims at `/business-id/$businessId` and `/salon/$salonId` (both 301 to the
  canonical slug URL).
- Auth: `/auth`, `/reset-password`, `/verify-otp`, `/business/signup`, `/staff/signup`.
- Customer (`/_authenticated/*`, `beforeLoad` auth check, `ssr: false`): `/bookings`,
  `/favorites`, `/profile`, `/reschedule/$bookingId`.
- Business/staff dashboard (`/_authenticated/admin/*`, one shared `AdminShell` component):
  dashboard home, calendar, appointments, my-appointments (staff self-service),
  availability, customers (CRM), services, staff, reviews, payments, reports, marketplace,
  notifications, settings.
- Platform/Super Admin (`/_authenticated/admin/platform/*`): overview, businesses,
  marketplace, users, directory, categories, countries, reserved-slugs, auth-policies,
  email-domains.
- `/auth/email-hook`: Dallty's own Supabase Auth "Send Email" hook (Standard Webhooks
  verification + `EmailProvider`) — not a user-facing surface.

**Known, documented architectural debt in the route tree** (unresolved, carried forward from
Project 00's original audit — not re-verified in this restructure):
- `/_authenticated/dashboard.tsx` — a fully-built, orphaned business-analytics page,
  unreferenced anywhere in the app's nav, functionally duplicating `/admin` +
  `/admin/reports`. Candidate for removal.
- No route under `/admin/*`/`/admin/platform/*` has a `beforeLoad`/`loader`-level role guard
  — every file gates access inside the component body after data has already begun
  fetching. This is a real, documented gap, though its practical severity is reduced by
  `ssr: false` on the whole `/_authenticated` subtree (see §5/§6) meaning the real
  enforcement boundary is the server functions and RLS policies each page's data-fetching
  calls into, not the route shell itself.

**Server code organization:** `src/lib/*.functions.ts` (TanStack `createServerFn` handlers,
one file per domain — `booking-engine.functions.ts`, `financial.functions.ts`,
`business-detail.functions.ts`, etc.), `src/lib/*.server.ts` (server-only helpers not
exposed as RPCs — `branch.server.ts`, `rate-limit.server.ts`, `db-error.server.ts`,
`security-event.server.ts`, `idempotency.server.ts`, `step-up.server.ts`, etc.).

**A meaningful minority of mutations bypass server functions entirely** and go straight from
the browser to Postgres via the Supabase client + PostgREST (`src/lib/admin.ts` and some
dashboard pages) — RLS is the *only* enforcement layer for those, not defense-in-depth on
top of a server check. This is a deliberate, verified-working pattern (see §6), not an
oversight, but it means every future table must ship real RLS from day one.

---

## 4. Database architecture

Full entity/relationship detail: `DALLTY_DATABASE_ARCHITECTURE.md` (Project 01),
`DALLTY_DATABASE_CHANGELOG.md` (migration-by-migration record for Project 01 only — later
projects' migrations are documented in their own `DALLTY_*_ARCHITECTURE.md` files, not
retroactively added to that changelog).

**93 migration files** exist in `supabase/migrations/` as of this writing (verified by direct
count). All tables have RLS enabled (verified for every project through Project 09 — no gap
found between `CREATE TABLE` and `ENABLE ROW LEVEL SECURITY` in any migration reviewed).

**Core spine (pre-existing, Project 00):** `profiles`, `user_roles`, `businesses`,
`services`, `staff`, `staff_schedules`, `staff_day_hours`, `staff_breaks`, `staff_time_off`,
`staff_services`, `staff_join_requests`, `bookings`, `promotions`, `waitlist_entries`,
`notifications`, `favorites`, `recently_viewed`, `reviews`, `review_reports`,
`business_gallery`, `business_hours`, `admin_audit_log`, `currencies`, `countries`,
`categories`, `regions`, `cities`, `reserved_slugs`, `business_slug_redirects`,
`auth_otp_codes`, `auth_settings`, `auth_role_policies`, `auth_login_attempts`.

**Project 01 additions:** `platform_roles`, `business_memberships`, `permissions`,
`role_permissions`, `business_categories`, `business_branches`; `deleted_at` soft-delete
columns on `businesses`/`services`/`staff`/`profiles`; `businesses.country_code`/`currency`
converted from free text to real FKs.

**Project 03 additions:** `idempotency_keys`, `rate_limit_hits`; `admin_audit_log` extended
with `ip`/`risk_level`/`outcome`; `email_domain_rules`, `business_domain_verifications`
(Project 02 addendum, listed here for completeness).

**Project 04 additions:** `countries.marketplace_enabled`, `administrative_levels`,
`profiles.detected_country_code`.

**Project 05 additions:** `bookings_no_overlap` (real `EXCLUDE USING gist` constraint,
replacing an exact-timestamp-only unique index), `held`/`expired`/`no_show` added to
`booking_status`, `booking_items` (historical price/duration snapshot per booked service).

**Project 06 additions:** `payments`, `ledger_transactions` (immutable double-entry ledger,
`account_balances` view), `commission_rules`, `staff_payout_rules`, `staff_payouts`,
`payment_methods`; `payment_status` extended with the full deposit/partial/refund state
machine.

**Project 07 additions:** `notification_outbox`, `notification_deliveries`,
`notification_preferences`, `device_tokens`; `notifications` extended with `deep_link`/
`business_id`/`category`; `businesses.reminder_offsets_minutes`.

**Project 08 additions:** `businesses.region_id` (structured administrative-region
reference, previously only free-text `city`/`district`/`area`); supporting indexes for
`search_businesses_page()`.

**Project 09 additions (branch-aware booking engine — the newest schema layer, 2026-08-19):**
`staff_branches` (many-to-many staff↔branch, `is_primary`), `branch_hours`,
`staff_branch_schedules`, `staff_branch_day_hours` (multi-interval-per-day, deliberately no
unique constraint — split shifts are representable), `branch_services` (branch-specific
service price/duration/availability override, **schema exists, not yet consumed by the
booking-price-resolution code path** — see §9 gap list), `holidays` (country/business/branch
scope), `temporary_blocks`; `bookings.branch_id`/`booking_items.branch_id`/
`waitlist_entries.branch_id` (every booking now resolves to a specific branch at creation,
never inferred from the business afterward); `bookings.reference` (8-char non-enumerable
customer-facing code, Postgres column `DEFAULT`-generated); `bookings.confirmation_status`
(the third state machine — see §9); `countries.default_hold_minutes`/
`businesses.hold_minutes` (configurable hold duration). Two triggers
(`businesses_create_main_branch`, `staff_create_primary_branch`) guarantee every business
always has a Main branch and every staff member always has a primary branch.

**Standing architectural rules for all future schema work:**
- Ownership is `businesses.owner_id` (single column) **and** `business_memberships`
  (Project 01, additive) — the membership table exists but real multi-owner
  enforcement/UI is not built (see §7).
- `businesses.categories text[]`, the `business_categories` join table (0 rows), and
  `businesses.business_type` (free text) are **three parallel, unconsolidated
  "what category is this business" signals** — found and documented in Project 08, not
  resolved. Do not add a fourth.
- `businesses.status` (`business_status` enum) is dead — `marketplace_status` is the real
  gate. Confirmed via grep, not removed (schema cleanup, not in any project's scope so far).
- No dedicated country-config tables exist for payment methods, plans, commission, WhatsApp,
  taxes beyond what a real consumer already needs (deliberate — see §13).

---

## 5. Identity/account architecture

Full detail: `DALLTY_IDENTITY_ARCHITECTURE.md` (Project 02).

Authentication is **Supabase Auth**, full stop — no second identity provider, no custom JWT
handling. Email+password is the only live sign-in path; magic-link, phone-OTP, and Google
OAuth exist in code but are hidden behind feature flags (`SHOW_ALT_METHODS`,
`SHOW_OAUTH_BUTTONS`) — enabling either is a product decision, not a missing-code problem.

A custom **email-OTP step-up engine** (`auth_otp_codes`, `auth_settings`,
`auth_role_policies`) sits on top of Supabase Auth for `business_owner`/`admin`/
`super_admin` roles by default. Codes are HMAC-hashed, never stored plaintext,
constant-time-compared. Server-side enforcement (`auth_step_up_sessions`, session-correlated)
was closed in Project 02 at the two central authorization chokepoints
(`assertSuperAdmin`/`assertCanManageBusiness`) — a documented residual gap remains at the RLS
layer for direct-from-browser mutations in `src/lib/admin.ts` (not silently closed, see the
identity doc for the full reasoning on why it wasn't also closed there).

**Account types:** `client`/`business_owner`/`specialist`/`admin`/`super_admin` (`app_role`
enum) — no `affiliate` role exists yet (see §17). No separate `owner_users`/
`manager_users`/`specialist_users` tables — a single `auth.users` row is the identity;
role/membership rows determine capability. Specialist-without-account is fully supported
(`staff.user_id` nullable) — a business can create a bookable specialist profile with no
login at all.

Session storage: Supabase's own `localStorage` session object, never a cookie. CSRF
middleware explicitly re-installed. Password policy is two-tier (`client` vs `privileged`) —
`super_admin` shares the `privileged` tier with lower roles rather than having its own
stronger tier (a documented, unclosed gap).

**Known open gap, flagged repeatedly across Projects 02/03 and still open as of Project 09:**
login brute-force throttle is orchestrated by application code around
`signInWithPassword`, not enforced inside Supabase Auth itself — a caller that skips this
app's `/auth` page bypasses it. CAPTCHA (hCaptcha, supported by this Supabase project) would
close this properly but remains disabled — no site/secret key exists in this environment.
**This is the single most-repeated unresolved open item across the entire documentation
set** (see §22 and the NEXT PROJECT recommendation).

---

## 6. Multi-tenant security architecture

Full detail: `DALLTY_SECURITY_ARCHITECTURE.md`, `DALLTY_SECURITY_THREAT_MODEL.md`
(Project 03).

```
Browser (hostile by default)
   │  Bearer JWT (localStorage, never a cookie)
   ▼
TanStack Start server functions — the ONE place app code runs trusted
   │  service-role client (bypasses RLS) OR request-scoped client (RLS-bound)
   ▼
Postgres (Supabase) — RLS is the actual, final enforcement layer
```

A business's data is isolated by `business_id`/`owner_id` FKs plus RLS policies built on
`owns_business(auth.uid(), business_id)` / `is_business_staff(auth.uid(), staff_id)` /
`is_platform_admin(auth.uid())` — `SECURITY DEFINER` Postgres functions, checked inside RLS
independent of what client-side query logic decided to request. **RLS is not optional
defense-in-depth here — it is the actual enforcement layer**, given how much client code
talks to Postgres directly through PostgREST (§3).

**Verified by direct attack simulation (Project 03):** two unrelated businesses, cross-owner
read/update attempts against each other's private data — both rejected outright.

**The most serious issue found across every project to date, found and fixed in Project
03:** the `bookings` table's UPDATE RLS policy checked only row ownership, not which columns
changed — a signed-in customer could PATCH their own booking's `payment_status`/
`total_price`/`staff_id`/`business_id` directly via PostgREST, bypassing the app's payment UI
entirely. Fixed with a `BEFORE UPDATE` guard trigger (`guard_bookings_customer_update`),
live-tested.

**Found and fixed again in Project 09**, a related instance of the same failure mode: five
availability RPCs rewritten for branch-awareness were callable directly by any `anon`/
`authenticated` caller via `supabase.rpc(...)`, bypassing rate limiting entirely — a
`REVOKE ... FROM PUBLIC` in the rewriting migration didn't account for this Supabase
project's `ALTER DEFAULT PRIVILEGES` granting `anon`/`authenticated` execute directly at
function-creation time. Confirmed live before the fix (an anon-role call succeeded) and after
(fails with "permission denied"). See `DALLTY_BOOKING_ENGINE.md`'s Project 09 update for the
full incident detail — this is the kind of security-relevant finding future schema-rewrite
work should specifically test for.

**Other verified-real protections:** server-side JWT validation via `getClaims()` (never a
client-supplied user id); consistent server-side ownership/role re-derivation in every
sampled mutating server function; security headers (CSP/HSTS/X-Frame-Options, iterated
against real browser console errors); no CORS misconfiguration (server functions are
same-origin RPCs); CSRF middleware re-installed; exactly one `dangerouslySetInnerHTML` in the
whole codebase (developer-supplied CSS, never user content) — no XSS surface found.

**Open gaps, unresolved as of Project 09** (see §18 for the fuller anti-fraud picture):
login-throttle/CAPTCHA (§5); RLS-layer OTP step-up enforcement (§5); ~10 Super-Admin-only
server functions still leak raw Postgres error text to the client (lower severity — trusted
audience, not the public); no magic-byte/content-signature upload validation; a Security
Anti-Fraud Hardening initiative (branch `security-anti-fraud-foundation`) that shipped only
its first of six planned batches (see §18 and the PROJECT STATUS section).

---

## 7. RBAC / permissions architecture

**Current state: role-only, not permission-based.** `app_role` enum (`client`/
`business_owner`/`specialist`/`admin`/`super_admin`) plus `business_memberships`
(Project 01, business-scoped: owner/manager/receptionist/confirmation_member/specialist/
custom) is the real, enforced authorization model — every server function's
role→capability mapping is implicit in its own logic, not a queryable table.

**Target architecture, schema-ready but not enforced:** `platform_roles` (8 seeded system
roles), `permissions` (24 seeded granular keys — `business.view`, `booking.create`, etc.,
plus 13 more added in Project 06 for `payments.*`/`finance.*`/`balance.*`), `role_permissions`
(88 seeded default scope grants). **None of this is consulted by any RLS policy or server
function today** — confirmed unchanged through every project since Project 01 created it.
Existing authorization (`hasRole()` client-side for UI/routing only,
`assertCanManageBusiness`/`assertSuperAdmin` server-side, `owns_business()`/
`is_platform_admin()` in RLS) remains the actual, sole enforcement mechanism.

**What this blocks:** the multi-owner protection workflow (owner-removal email confirmation,
15-day protection window — schema-ready via `business_memberships.is_primary_owner`'s
partial unique index, not built), and Owners creating custom staff roles from
Super-Admin-approved permissions (needs the permission/scope model actually wired in first,
not layered on top of the current role-only system).

Ownership is not a bare column alone — `business_memberships` extends (never replaces)
`businesses.owner_id`; `owns_business()` checks both. `staff` (service-delivery profile) and
`business_memberships` (governance/dashboard-access role) are deliberately separate tables —
a specialist who is also an owner gets one row in each.

---

## 8. Business/branch architecture

**The most significant architectural change in the codebase's history to date is Project
09's branch-awareness work (2026-08-19).** Before it, `business_branches` (Project 01) was a
standalone table — one auto-created "Main" branch per business, structurally real but wired
into nothing (services/staff/hours/bookings all remained single-location, business-scoped
only, confirmed unpopulated/unwired through Projects 01, 05, and 08).

**As of Project 09, branches are fully wired into every layer that touches them:**
- **Staff assignment**: `staff_branches` (many-to-many, `is_primary`) — a specialist can
  work at multiple branches of the same business.
- **Hours**: `branch_hours` (branch-level operating hours), `staff_branch_schedules`/
  `staff_branch_day_hours` (per-branch specialist schedules and date overrides) — all
  multi-interval per day (split shifts representable), superseding the old single-location
  `business_hours`/`staff_schedules`/`staff_day_hours` tables (which remain in the schema,
  now unread by the availability engine — see the critical fix below).
- **Services**: `branch_services` (branch-specific price/duration/availability override —
  schema exists, **not yet consumed by the actual booking-price-resolution code path**,
  a documented, open Project 09 gap).
- **Availability engine**: `get_available_slots` and the three functions built on it were
  rewritten to compute branch hours ∩ staff hours at that branch, minus breaks/time-off/
  holiday closures/temporary blocks, using Postgres `tstzrange`/`tstzmultirange` for correct
  multi-interval math. Booking-conflict checks stayed staff-wide (not branch-scoped) — one
  person cannot be double-booked across two branches at the same time.
- **Bookings**: `bookings.branch_id`/`booking_items.branch_id`/`waitlist_entries.branch_id`
  — every booking resolves to a specific branch at creation and never infers it from the
  business afterward.
- **Customer UI**: a branch-selection screen (Business → Branch → Services → ...) that
  auto-skips for single-branch businesses — every real business in production today.
- **Walk-ins**: `createWalkInBooking` lets any staff member or the business owner book any
  specialist at the business (not just their own calendar) for an existing or guest
  customer.

**A critical fix found and closed in the same project, not a separate incident**: the
business-settings hours editor and the staff working-hours editor both still wrote to the
now-superseded `business_hours`/`staff_schedules`/`staff_day_hours` tables — meaning saving
hours through either admin page produced a success toast with **zero effect on real
availability** from the moment the availability-engine rewrite shipped until this fix landed
in the same project. Both editors now target the branch-scoped tables.

**Real, documented gaps carried into the next work (see the PROJECT STATUS section and
§9):** no dashboard UI exists yet for staff to work the confirmation-call queue or launch a
walk-in booking (the server functions exist, the buttons don't); the primary customer
purchase flow (`business.$businessSlug.tsx`) was not migrated onto the hold-then-confirm
system — it still uses a direct insert into `bookings`, which is correctly branch-aware,
reference-coded, and protected by the same overlap constraint, but does not offer the
hold-countdown UX or the "any specialist" auto-assignment the hold system supports;
`branch_services` price overrides are not read by `createBookingHold`/`createWalkInBooking`'s
resolution path yet.

---

## 9. Booking architecture

Full detail: `DALLTY_BOOKING_ENGINE.md` (Project 05, extended by Project 09 — read the
"Project 09 update" section at the top first, then the original Project 05 sections below it,
several of which are marked superseded inline).

**Three independent state machines** (the brief's original target, now fully realized as of
Project 09):
1. `booking_status` — `pending`/`confirmed`/`completed`/`cancelled`/`held`/`expired`/
   `no_show`.
2. `payment_status` — the full deposit/partial/refund state machine (Project 06).
3. `confirmation_status` — **new in Project 09**: `not_required`/`pending`/`confirmed`/
   `unreachable`/`declined`, opt-in per business (`businesses.require_confirmation_call`),
   tracking pre-appointment confirmation calls independent of both other machines.

**Concurrency safety — the single most load-bearing correctness guarantee in this codebase,
live-tested repeatedly, not assumed:** `bookings_no_overlap`, a real Postgres
`EXCLUDE USING gist` constraint (`staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH
&&`), enforced by the database itself at write time, regardless of which code path performs
the insert. Tested with 20 concurrent overlapping requests for one specialist (Project 05: 1
succeeded, 19 correctly rejected) and, independently, a fresh 12-way concurrent test against
the live database in Project 09 (1 succeeded, 11 correctly rejected with exclusion-violation
code `23P01`) — reproduced across two separate projects with identical results.

**Hold system**: `createBookingHold`/`confirmBookingHold`/`cancelBookingHold`
(`src/lib/booking-engine.functions.ts`) — server-side, configurable-duration (default 15
minutes, country/business-overridable as of Project 09) holds, atomic any-specialist
candidate resolution, idempotent confirmation. **Not used by the primary customer purchase
flow** (`business.$businessSlug.tsx`, which does a direct insert instead) — a deliberate,
twice-reconfirmed scope decision (Project 05 and Project 09 both explicitly chose not to
migrate it), not an oversight. The direct-insert path is equally protected by the same
exclusion constraint.

**Availability**: see §8 for the Project 09 branch-aware rewrite. `slot_interval_minutes`/
`min_notice_hours`/buffer (now with a full country→business→branch→service hierarchy) are
all real, consulted values — previously dead columns fixed in Project 05.

**Booking reference codes** (Project 09): every booking gets an 8-character non-enumerable
customer-facing code, generated via a Postgres column `DEFAULT` so every insert path
(hold-based, direct, guest, walk-in) gets one automatically.

**Walk-ins/guests**: `createWalkInBooking` (Project 09, see §8) and `createGuestBooking`
(pre-existing) both insert directly with a live status, inheriting the overlap constraint
automatically.

**Not built**: real-time reminders' automatic *dispatch* (generation is automatic via
`pg_cron`; sending the email still needs a manual trigger or a future Edge Function — see
§11); group/recurring bookings; a dashboard UI for the confirmation-call queue or launching a
walk-in (§8); `branch_services` price overrides not yet wired into price resolution (§8).

---

## 10. Payment architecture

Full detail: `DALLTY_FINANCIAL_ARCHITECTURE.md` (Project 06).

**No real payment gateway integration exists — no provider credentials (CIB, Edahabia,
Stripe, or any other) exist anywhere in this project's environment**, confirmed repeatedly
across every project including Project 09. Everything "online payment" in the schema is a
real, working abstraction, never a faked integration.

**What is real and live-tested:** the three-layer model (Booking → Payment → Ledger); an
**immutable double-entry ledger** (`ledger_transactions` — no `UPDATE`/`DELETE` grant to any
role including `service_role`, plus a `BEFORE UPDATE`/`DELETE` trigger as the actual
backstop since RLS alone cannot restrict `service_role`); cash payment settlement
(`markCashPayment`) with full overage/underage reconciliation (tip vs. extra-service vs.
discount-adjustment, each handled per the brief's exact worked examples); commission
calculation (business→country→global hierarchy, snapshotted at transaction time); staff-
earning accrual; refunds (owner/admin-only, cannot exceed the payment's received amount,
both live-tested); a provider-agnostic `PaymentProvider` interface ready for a real adapter.

**Not built**: any real provider adapter; online deposit collection; `staff_payouts` row
creation (the accrual side is real, recording an actual payout isn't wired to a server
function); tax calculation; customer-facing payment UI wiring (the booking page still uses
its pre-Project-06 payment display).

---

## 11. Notification architecture

Full detail: `DALLTY_NOTIFICATION_ARCHITECTURE.md` (Project 07).

In-app notifications (realtime-subscribed, pre-existing) remain unchanged. A real
domain-event/outbox layer (`notification_outbox`, `notification_deliveries`) drives async
channels off booking/payment events — claimed via `FOR UPDATE SKIP LOCKED`, retried with
exponential backoff, live-tested for dedupe and concurrent-claim correctness. The `emails`
i18n namespace is active (en/fr/ar) for 14 event types via one generic template. Reminders
(24h/1h/15m, business-configurable) are generated by a real, live `pg_cron` job running every
minute.

**Push/WhatsApp/SMS are architecture-ready only** — provider interfaces and schema
(`device_tokens`) exist, zero real providers are configured anywhere. **Reminder
*generation* is automatic; reminder *dispatch* (actually sending the email) still requires a
manual trigger** — automating it needs either a confirmed stable deployment URL for a
`pg_net` callback or a Supabase Edge Function, deliberately not built this session to avoid
either duplicating the email-rendering pipeline in raw SQL or depending on an unconfirmed
URL.

---

## 12. i18n / localization architecture

Namespaced i18n runtime (`src/lib/i18n/`) is fully built and active: 16 active namespaces + 2
reserved, Vite `import.meta.glob`-backed (zero network fetch), compile-time key safety,
`locales/{en,fr,ar}/*.json` for every active namespace.

**Verified, unresolved gap, carried across every project since Project 00's original
audit:** the legacy `src/lib/dallty-content.ts` bilingual demo dataset is not fully retired
— stale Gulf-region content, no French branch, and 5 hardcoded `lang === "ar"` ternaries
across the codebase exist specifically to consume its shape. `formatMoney`/
`formatInTimezone` were fixed in Project 04 for the one highest-traffic call site (the public
booking page); ~8 lower-traffic call sites (mostly the unlocalized business dashboard)
remain on the English-locale default. Closing this — migrating the last consumers off
`dallty-content.ts`, deleting it, adding real French content — is a finishing task on
already-built infrastructure, flagged as higher priority than new localization scope every
time it's been documented.

Locale is a `?lang=` query parameter today, not a path prefix — correctly sequenced as a
later stage of the internal localization program (Locale-Prefixed Routing), not yet started.

---

## 13. Country / locality architecture

Full detail: `DALLTY_INTERNATIONAL_ARCHITECTURE.md` (Project 04).

`countries`/`currencies` (generic, `translations jsonb`, not fixed columns) and `regions`→
`cities` (generic 2-level hierarchy, seeded with Algeria's real 69 wilayas / 1,541 communes)
were already country-agnostic before Project 04. `countries.marketplace_enabled` (new in
Project 04) is the real gate distinguishing "exists in the reference system" from
"marketplace is browsable" — Algeria is the only `true` row today, enforced server-side in
both the public RLS policy and `search_businesses_page()` (Project 08), live-tested in both
places. Business country is immutable post-creation for non-admins (guard trigger,
live-tested).

`administrative_levels` gives each country's region/city level a localized label
(Wilaya/Commune for Algeria) — the underlying hierarchy remains fixed at 2 levels
(`level_number` constrained to 1/2), a deliberate, documented limitation, not silently
implied to be more flexible.

**Not built, and deliberately not pre-built ahead of a consumer:** IP geolocation
(`profiles.detected_country_code` exists as a nullable column, nothing populates it — no
lookup service wired up, though Cloudflare's own `cf-ipcountry` header is the natural, free
future source given this deployment target); `country_languages` (no second marketplace
country needs a different language set than Algeria's yet); country-scoped payment
methods/plans/commission/tax/WhatsApp/deposit-policy config tables (none of those subsystems
themselves have a second-country variant yet).

---

## 14. International SEO architecture

Real, working meta tags via TanStack Start's route `head()` option across 37 route files;
real canonical + hreflang (`en`/`fr`/`ar` + `x-default`); `robots.txt` (allows all major
crawlers, no `Sitemap:` directive yet).

**Not built at all**: sitemap/sitemap-index, JSON-LD structured data, locale-prefixed URLs.
Correctly sequenced downstream of Locale-Prefixed Routing and a Translation Manager in the
internal localization program — building sitemap generation before the URL shape it needs to
enumerate exists would be premature. `search_businesses_page()`'s filter shape
(country/region/city/category) is already structured compatibly with the eventual
`/country/region/category` SEO route tree, without itself being a page generator.

---

## 15. CMS architecture

**Not built.** Super Admin today manages reference data (categories, countries,
currencies-read-only, reserved slugs, email-domain trust rules) and business
approval/verification/user management — real content management (homepage banners, legal
pages, help center, blog) does not exist. Correctly deferred, not contradicted by anything
built so far.

---

## 16. Sponsored / advertising architecture

**Not built.** `search_businesses_page()`'s ranking (Project 08) computes a single
deterministic organic `rank_score` — no sponsored-placement, campaign, or billing logic
exists. A documented extension point exists (a future merge-sort of sponsored rows against
the organic ordering, with mandatory visible disclosure) but nothing here builds toward it
beyond keeping the ranking function's shape compatible.

---

## 17. Affiliate architecture

**Not built at all.** No `affiliate` role exists in the `app_role` enum, no referral/
attribution table exists, no URL-parameter handling for affiliate tracking was added
anywhere (confirmed: canonical business-page URLs are unchanged by every project through
Project 09). The one documented compatibility note: a future affiliate system could append
its own query parameter to an existing canonical slug URL without needing anything built so
far to have anticipated the parameter name.

---

## 18. Anti-fraud / anti-bot architecture

Full detail: `DALLTY_SECURITY_THREAT_MODEL.md`, `DALLTY_SECURITY_ARCHITECTURE.md`
(Project 03).

**Real, live-tested defenses:** disposable/blocked-email-domain hard block at signup
(`email_domain_rules` + a `handle_new_user()` trigger guard, live-tested — a `mailinator.com`
signup creates zero rows); a generic, reusable rate limiter
(`check_rate_limit`/`rate_limit_hits`) applied per-endpoint with different policies per
bucket; a provider-agnostic bot-challenge abstraction (`resolveBotChallengeLevel()`) using a
real signal (rate-limit-bucket consumption) — **no CAPTCHA/Turnstile provider is configured
anywhere in this environment**, so nothing currently blocks on its result; idempotency
(`idempotency_keys`/`withIdempotency`) protecting every booking/payment/refund mutation
against double-execution; risk-scored security-event logging
(`admin_audit_log.risk_level`/`ip`/`outcome`) on every authorization denial.

**An additional hardening initiative, started but left incomplete — record this honestly,
it is a real open gap, not a completed project:** branch `security-anti-fraud-foundation`
(merged into `main` via Project 09's branch consolidation) shipped only its first of six
planned batches. **Batch 1 (shipped, live in production)**: closed the RPC rate-limit-bypass
pattern for the business-detail-page RPCs (the same root-cause class of bug independently
rediscovered and fixed again in Project 09 for a different set of functions — see §6),
extended `sanitizeDbError()` across 18 more files (55 call sites), fixed notification-event
idempotency (`_dedupe_key` was always `null`, now uses real per-event keys). **Batches 2–6
were never started**: a central risk-scoring engine, server-side login-throttle enforcement
(the same gap flagged since Project 03 — see §5), a multi-owner protection workflow, review-
abuse protection, a booking-hold expiry cron sweep, magic-byte upload validation, a security-
event taxonomy + Super Admin security dashboard, and a refreshed threat-model document
incorporating all of the above. **This is the most direct, actionable next-project candidate
in the whole codebase** — see the NEXT PROJECT recommendation at the end of this document.

**Residual gaps, unresolved across every relevant project to date:** login brute-force
throttle (§5, §6); RLS-layer OTP step-up enforcement (§5); no magic-byte/content-signature
upload validation (bucket-level MIME/size limits exist and are real, but a spoofed
`Content-Type` with a small crafted payload could still pass); no WAF/edge-layer bot
protection configured at the application layer (Cloudflare sits in front of this deployment
— what it provides was not independently confirmed by any project to date).

---

## 19. Deployment architecture

Full detail: `DALLTY_DEPLOYMENT.md`, `DALLTY_VENDOR_INDEPENDENCE.md`.

```
main → GitHub (private repository, git@github.com:mimou900/dallty.git) → Vercel
  (auto-deploy on push, Nitro's `vercel` preset, Build Output API v3) → Cloudflare
  (DNS layer, proxy OFF) → https://www.dallty.com
```

**Production:** `https://www.dallty.com` — live and verified (§2). `dallty.com` 308-redirects
to `www.dallty.com`. `dallty.vercel.app` also resolves to the same Production deployment.

**Current deployment:** Vercel Production, commit `3739477`.

**DNS:** Cloudflare → Vercel. Cloudflare remains the authoritative DNS layer; nameservers
were never moved to Vercel, and DNS was not touched during Project 09's deployment beyond
what was already established in an earlier session's Vercel cutover (A-records → CNAME
records pointing at Vercel, proxy disabled per Vercel's own custom-domain requirement).

**Repository:** private GitHub repository (`git@github.com:mimou900/dallty.git`), `main`
branch is production. No `develop`/staging branch exists (target-state per
`DALLTY_DEPLOYMENT.md`, not built). Feature branches used so far:
`booking-engine-branches-foundation`, `security-anti-fraud-foundation`, `lovable-removal`
— all now merged into `main` (the first two via a single merge commit in Project 09; the
third was merged directly earlier).

**Environment variables:** confirmed present on the Vercel project (all `SUPABASE_*`/
`VITE_SUPABASE_*`/`VITE_GOOGLE_MAPS_*`/`OTP_HMAC_SECRET`, added prior to Project 09's
deployment) — this was an open blocker earlier in this session's history and is now
resolved, verified live via working Supabase REST calls on the production deployment.
`RESEND_API_KEY` status: **UNKNOWN** — not independently re-verified during this
restructure; `DALLTY_VENDOR_INDEPENDENCE.md` records it as unset as of the Lovable-removal
project, meaning `NullEmailProvider` may still be the active email path in production unless
it was set since.

**No CI exists** (`.github/workflows` confirmed absent). Verification before every push is
manual: `npx tsc --noEmit`, `npm run lint` (`eslint .`), `npm run build`. No automated test
suite exists (`package.json` has no `test` script).

---

## 20. Lovable independence status

Full detail: `DALLTY_VENDOR_INDEPENDENCE.md`.

**Fully removed from runtime, dependencies, configuration, and assets, as verified by the
Lovable-removal project and re-confirmed during Project 09's production deployment.**
`package.json` contains zero `lovable`-referencing entries (confirmed by direct grep during
Project 09's deployment). All four `@lovable.dev/*` packages (`email-js`, `cloud-auth-js`,
`webhooks-js`, `vite-tanstack-config`) were removed and replaced with Dallty-owned
abstractions:

| Concern | Was | Now |
|---|---|---|
| Transactional email | `@lovable.dev/email-js` | `EmailProvider` interface — `ResendEmailProvider` or `NullEmailProvider` |
| Auth email hook | Lovable webhook handler | Standard Webhooks HMAC verification (`src/lib/webhooks/standard-webhook.ts`), no vendor SDK |
| OAuth | `@lovable.dev/cloud-auth-js` proxy | Supabase Auth's own `signInWithOAuth`, called directly |
| Maps travel-time | Lovable connector-gateway proxy | Direct call to Google's real Routes API |
| Logo/brand assets | Lovable-managed R2 CDN path (`/__l5e/assets-v1/...`) | Real bundled files in `src/assets/` |
| Build config | `@lovable.dev/vite-tanstack-config` wrapper | Plain `defineConfig` + Nitro's own `vercel` preset directly |
| Lockfile | `bun.lock` resolving unrelated packages through Lovable's private npm registry mirror | Deleted; `package-lock.json` (npm) is the only lockfile, already clean |
| Editor scaffold | `.lovable/` directory (`project.json`, `plan.md`) | Removed; one historical planning doc preserved at `docs/archive/` with a HISTORICAL marker |

**Confirmed live on the production deployment (Project 09):** no Lovable network requests
during a fresh page load; no Lovable environment variables on the Vercel project (the current
list is `OTP_HMAC_SECRET`/`SUPABASE_*`/`VITE_GOOGLE_MAPS_*`/`VITE_SUPABASE_*` — all
Dallty/Supabase/Google-named); the build succeeds with zero `LOVABLE_*` variables present.

`AGENTS.md`'s Lovable git-sync warning was deliberately left in place — it governs this
assistant's own git behavior in a repository that may still have Lovable's git-sync
connected, not the application itself.

---

## 21. Mobile-app architecture

**Not built, not started.** No React Native/Capacitor scaffold exists anywhere in the
repository. Deferred per the original brief's own sequencing (mobile apps come after the web
platform is stable) — nothing built so far blocks starting it, but nothing has begun.

---

## 22. Future architecture / deferred features

The domain model this codebase targets is intentionally broader than what's built today. The
binding rule for every future project (`DALLTY_AI_IMPLEMENTATION_RULES.md`): extend by adding
new tables/columns/enums that reference the existing identity/business/booking spine, never
by duplicating a concept that already exists.

**Deferred/PLANNED items carried across multiple projects, consolidated here rather than
re-listed per-section:**
- Login-throttle/CAPTCHA enforcement (§5, §6, §18) — the single most-repeated open item in
  the whole documentation set, flagged in Projects 02, 03, and still open as of Project 09.
- RLS-layer OTP step-up enforcement (§5, §6).
- Wiring the RBAC/permission schema into real enforcement (§7) — blocks multi-owner
  protection workflow and custom staff roles.
- Security Anti-Fraud Hardening Batches 2–6 (§18).
- Customer-facing hold-then-confirm purchase flow migration (§9).
- `branch_services` price-override consumption in booking-price resolution (§8, §9).
- Dashboard UI for the confirmation-call queue and staff-initiated walk-ins (§8, §9).
- Automatic outbox *dispatch* scheduling (§11) — generation is already automatic.
- Any real payment gateway integration (§10) — blocked entirely on provider credentials that
  do not exist in this environment; not a code-readiness gap.
- `dallty-content.ts` retirement + full French-locale coverage (§12).
- Locale-Prefixed Routing, Translation Manager, and everything sequenced after them
  (sitemaps, JSON-LD, locale-prefixed SEO URLs — §12, §14).
- CMS (§15), Sponsored/Advertising (§16), Affiliate (§17), Mobile app (§21) — none started.
- CI pipeline (§2, §19) — no automated lint/typecheck/build gate exists anywhere.
- Automated test suite — `package.json` has no `test` script; no test infrastructure exists.
- Observability — no error monitoring, APM, or uptime monitoring exists; `admin_audit_log`
  is a real but minimal foundation.
- Legal/compliance flows (privacy policy, terms, cookie consent, data export, account
  deletion) — none found anywhere in the codebase.

---

## PROJECT STATUS

Git history note, verified before writing this table: **Projects 00 through 08 (all of their
code and documentation) were delivered as a single, squashed commit — `dee14c6`
("feat: Projects 01-08 — database, identity, security, international, booking, payments,
notifications, marketplace foundations"), dated 2026-08-17.** There is no per-project commit
granularity available in git history for these — the commit is recorded once per project
below rather than invented as separate hashes. Project 00 itself (the audit/docs-only
project) has no distinguishable commit of its own; its output (the original master
architecture doc and roadmap) is part of the same `dee14c6` snapshot.

### Project 00 — Master Architecture, Codebase Audit & Foundation
- **Objective:** Full audit of the pre-existing codebase; produce the authoritative
  architecture, AI-rules, and roadmap documents as the foundation for every later project.
- **Implementation status:** DONE.
- **Important architectural decisions:** Established the "Business, never Salon" backend
  terminology rule; established the extend-never-duplicate discipline; established the
  IMPLEMENTED-vs-PLANNED honesty convention every later project follows.
- **Important database changes:** None (audit only).
- **Known gaps:** Found, not fixed in this project: three trigger functions with stale
  `salons`/`salon_id` references (fixed in Project 01); `businesses.owner_id` single-column
  ownership; no branch/multi-location entity wired anywhere; login-throttle bypass.
- **Deferred work:** Everything in every subsequent project's scope.
- **Documentation location:** `DALLTY_MASTER_ARCHITECTURE.md` (this file, restructured),
  `DALLTY_AI_IMPLEMENTATION_RULES.md`, `DALLTY_IMPLEMENTATION_ROADMAP.md`.
- **Git commit:** Bundled into `dee14c6` (no standalone commit exists).
- **Production status:** N/A — audit/documentation project, no application code shipped.

### Project 01 — Database & Core Domain Foundation
- **Objective:** Close the schema-level gaps Project 00 found: multi-owner foundation,
  permission/scope schema, business↔category many-to-many, branch entity, country/currency
  FK closure, soft deletion.
- **Implementation status:** DONE (schema only) — none of Project 01's new tables are wired
  into enforcement by this project itself (later projects, especially Project 09 for
  branches, wire specific pieces in).
- **Important architectural decisions:** `business_memberships` extends, never replaces,
  `owner_id` — additive `OR` clause in `owns_business()`, a strict superset of prior access.
  `staff` and `business_memberships` deliberately kept as separate tables (service-delivery
  profile vs. governance role).
- **Important database changes:** New tables `platform_roles`, `business_memberships`,
  `permissions`, `role_permissions`, `business_categories`, `business_branches`; FK closure
  on `businesses.country_code`/`currency`; `deleted_at` soft-delete columns; bundled bug fix
  for the three stale-`salons`-reference trigger functions (`20260817100000`).
- **Known gaps:** New tables are reference data / structurally real but not consulted by any
  RLS policy or server function outside `owns_business()`'s additive clause.
- **Deferred work:** Real permission-based RLS enforcement; branch wiring into
  services/staff/bookings (done later, Project 09).
- **Documentation location:** `DALLTY_DATABASE_ARCHITECTURE.md`, `DALLTY_DATABASE_CHANGELOG.md`.
- **Git commit:** Bundled into `dee14c6`.
- **Production status:** Live in production (part of the `dee14c6` baseline that predates
  Project 09's deployment verification, and unchanged/still active since).

### Project 02 — Identity, Authentication & Account Foundation
- **Objective:** Close the OTP step-up enforcement gap; verify/complete email/phone/password
  change flows; add rate limiting to open endpoints; add disposable-email protection.
- **Implementation status:** DONE (foundation).
- **Important architectural decisions:** Step-up enforcement added at the two central
  authorization chokepoints (`assertSuperAdmin`/`assertCanManageBusiness`) rather than at
  the RLS layer (evaluated, deliberately deferred — too large a blast radius to verify
  safely in that pass). No account-merging feature built, per the brief's explicit
  instruction.
- **Important database changes:** `auth_step_up_sessions`; `email_domain_rules`,
  `business_domain_verifications` (Email Trust addendum); `admin_audit_log.actor_id` made
  nullable (pre-authentication events).
- **Known gaps:** RLS-layer step-up enforcement not built; login-throttle bypass
  investigated, not closed (needs CAPTCHA); Super Admin shares the same password tier as
  other privileged roles instead of a stronger one; no passkeys/WebAuthn.
- **Deferred work:** A generic (non-staff) invitation system; LOGOUT/SESSION_REVOKED audit
  events.
- **Documentation location:** `DALLTY_IDENTITY_ARCHITECTURE.md`.
- **Git commit:** Bundled into `dee14c6`.
- **Production status:** Live in production.

### Project 03 — Security, Anti-Bot, Anti-Fraud, Anti-Scraping & Abuse Prevention Foundation
- **Objective:** Find and fix real security gaps across RLS, public data exposure, mass
  assignment, uploads, error handling, headers; build idempotency/rate-limit/bot-challenge
  foundations.
- **Implementation status:** DONE (foundation).
- **Important architectural decisions:** RLS confirmed as the actual, load-bearing
  multi-tenant enforcement layer (not defense-in-depth) given how much client code talks
  directly to Postgres. Idempotency and risk-scored security events built as reusable
  foundation with no consumer yet (booking/payment didn't exist at this point in sequence).
- **Important database changes:** `idempotency_keys`, `rate_limit_hits`; `admin_audit_log`
  extended with `ip`/`risk_level`/`outcome`; Storage bucket-level MIME/size limits (not a
  migration, a Storage config change).
- **Known gaps:** The single most serious issue found in this project — a `bookings` RLS gap
  letting a customer rewrite `payment_status`/`total_price`/`staff_id` on their own booking —
  was fixed here, live-tested. Login-throttle/CAPTCHA remained open (flagged as the
  top-priority item across all projects at this point in the sequence). No magic-byte upload
  validation.
- **Deferred work:** A monitoring/alerting dashboard for the risk-scored event data (data
  exists, no UI). A later, separate hardening initiative
  (`security-anti-fraud-foundation` branch) picked some of this back up but shipped only
  1 of 6 planned batches — see §18 and this table's own entry note below.
- **Documentation location:** `DALLTY_SECURITY_ARCHITECTURE.md`,
  `DALLTY_SECURITY_THREAT_MODEL.md`.
- **Git commit:** Bundled into `dee14c6` for the original project. The later, separate,
  **incomplete** hardening initiative's Batch 1 is a distinct commit: `16f00da`
  ("feat(security): close RPC rate-limit bypass, sanitize DB errors, fix notification
  idempotency"), merged into `main` via Project 09's branch consolidation. Batches 2-6 of
  that initiative were never started — no commit exists for them.
- **Production status:** The original Project 03 foundation is live in production. Batch 1
  of the later hardening initiative is also live in production (merged via Project 09).
  Batches 2-6 do not exist anywhere, live or otherwise.

### Project 04 — International Country, Geography, Currency & Localization Foundation
- **Objective:** Distinguish "reference data" from "marketplace-browsable" per country; add
  administrative-level labels; close a real French-locale formatting bug.
- **Implementation status:** DONE (foundation).
- **Important architectural decisions:** `countries.marketplace_enabled` kept genuinely
  separate from `active` (phone-country-code usability vs. marketplace visibility).
  Administrative hierarchy deliberately kept at 2 fixed levels rather than generalized to N
  levels — no country needing a 3rd level exists yet, and restructuring 1,610 already-seeded
  rows for zero current demand was judged out of proportion.
- **Important database changes:** `countries.marketplace_enabled`, `administrative_levels`,
  `profiles.detected_country_code`.
- **Known gaps:** No IP geolocation service wired up (column exists, nothing populates it).
  ~8 lower-traffic `formatMoney` call sites still default to English formatting.
- **Deferred work:** `country_languages` table (no second marketplace country needs a
  different language set yet); country/region/city SEO slugs.
- **Documentation location:** `DALLTY_INTERNATIONAL_ARCHITECTURE.md`.
- **Git commit:** Bundled into `dee14c6`.
- **Production status:** Live in production.

### Project 05 — Booking Engine, Availability & Reservation Concurrency
- **Objective:** Fix the exact-timestamp-only double-booking gap with a real concurrency-safe
  constraint; build a server-side hold system; fix dead availability-engine columns.
- **Implementation status:** DONE (backend), PARTIAL (frontend — customer UI not migrated
  onto the hold flow, a deliberate scope decision).
- **Important architectural decisions:** A "hold" is a `bookings` row with `status='held'`,
  not a second table — the same exclusion constraint protects holds and confirmed bookings
  uniformly with zero extra code. One specialist per booking preserved (V1 rule, matching the
  original brief).
- **Important database changes:** `bookings_no_overlap` (`EXCLUDE USING gist` constraint,
  replacing the old exact-timestamp unique index); `held`/`expired`/`no_show` added to
  `booking_status`; `booking_items` (historical price/duration snapshot table).
- **Known gaps:** Customer-facing UI kept on its pre-existing direct-confirm flow rather than
  migrated onto the new hold system (re-confirmed as still correct in Project 09).
- **Deferred work:** Reminders (no scheduler existed yet at this point — built in Project
  07); branch-level price/duration override (branches not wired in yet — done in Project 09).
- **Documentation location:** `DALLTY_BOOKING_ENGINE.md` (original sections; extended by
  Project 09, read the top of that file first).
- **Git commit:** Bundled into `dee14c6`.
- **Production status:** Live in production, extended by Project 09 (also live).

### Project 06 — Payments, Deposits, Cash Settlement & Financial Ledger
- **Objective:** Replace raw `payment_status` flips with a real payment/ledger model; build
  cash settlement with overage/underage reconciliation; build the provider-abstraction layer
  for a future gateway.
- **Implementation status:** DONE (foundation), NOT STARTED (real gateway — blocked entirely
  on provider credentials that do not exist).
- **Important architectural decisions:** Immutable ledger enforced at two independent layers
  (no grant + a hard trigger) since RLS alone cannot restrict `service_role`. Accounts are
  implicit `(account_type, account_ref)` pairs, never a pre-provisioned chart — balances
  are a plain view over the ledger, never a stored/cacheable column.
- **Important database changes:** `payments`, `ledger_transactions`, `account_balances`
  (view), `commission_rules`, `staff_payout_rules`, `staff_payouts`, `payment_methods`;
  `payment_status` extended with the full deposit/partial/refund state machine.
- **Known gaps:** No real provider adapter (no credentials); online deposit collection
  blocked on the same; `staff_payouts` row creation not wired to a server function (accrual
  side is real).
- **Deferred work:** Tax calculation; subscription/sponsorship/affiliate ledger consumers
  (the account types exist, nothing generates those transactions since those systems don't
  exist); customer-facing payment UI wiring.
- **Documentation location:** `DALLTY_FINANCIAL_ARCHITECTURE.md`.
- **Git commit:** Bundled into `dee14c6`.
- **Production status:** Live in production (schema and functions); no real money has ever
  been processed through a provider, by design — none exists.

### Project 07 — Notifications, Communications & Reminder Engine
- **Objective:** Build the missing domain-event/outbox layer driving async notification
  channels off booking/payment events; build a real, scheduled reminder engine.
- **Implementation status:** DONE (foundation).
- **Important architectural decisions:** In-app notifications' existing realtime path was
  kept unchanged, not replaced. A transaction-local flag
  (`dallty.reschedule_in_progress`) fixes a real bug where every reschedule fired a spurious
  cancellation notification, discovered while wiring this project.
- **Important database changes:** `notification_outbox`, `notification_deliveries`,
  `notification_preferences`, `device_tokens`; `notifications` extended with `deep_link`/
  `business_id`/`category`; `businesses.reminder_offsets_minutes`.
- **Known gaps:** Outbox *dispatch* still needs a manual trigger (generation is automatic via
  a live `pg_cron` job); no real push/WhatsApp/SMS provider configured.
- **Deferred work:** A customer-facing notification-preferences settings page (no marketing
  event exists yet to usefully control); retrofitting 8 pre-existing auth emails onto the
  i18n namespace.
- **Documentation location:** `DALLTY_NOTIFICATION_ARCHITECTURE.md`.
- **Git commit:** Bundled into `dee14c6`.
- **Production status:** Live in production, including the live `pg_cron` reminder-generation
  schedule.

### Project 08 — Marketplace & Discovery Foundation
- **Objective:** Replace unbounded client-side search filtering with a real, server-side,
  rate-limited, ranked, cursor-paginated search function.
- **Implementation status:** DONE (foundation).
- **Important architectural decisions:** No dedicated search engine introduced — plain
  PostgreSQL with targeted indexes judged sufficient at current scale. The new search
  function re-implements the exact same visibility predicate the public RLS policy uses
  (rather than depending on RLS, since it runs `SECURITY DEFINER`) — verified identical via
  live testing, not assumed.
- **Important database changes:** `businesses.region_id`; supporting indexes for
  `search_businesses_page()`.
- **Known gaps:** `search.tsx`'s actual results feed was not swapped onto the new function
  (kept on the pre-existing client-filtered path, a scope decision to avoid destabilizing a
  large working page); three parallel, unconsolidated category/type fields found and
  documented, not resolved; branch-aware location search deferred (branches were still
  unwired at this point — done in Project 09, though search itself was not revisited).
- **Deferred work:** Specialist-level search; a real caching layer; sponsored
  billing/campaigns; affiliate dashboard.
- **Documentation location:** `DALLTY_MARKETPLACE_ARCHITECTURE.md`.
- **Git commit:** Bundled into `dee14c6`.
- **Production status:** Live in production.

### [Unlabeled] Lovable Removal (Vendor Independence)
- **Objective:** Remove every real runtime/build dependency on Lovable's platform, found to
  be the root cause of a production crash (`LOVABLE_API_KEY` unset → eager module-load
  throw → whole app down).
- **Implementation status:** DONE.
- **Important architectural decisions:** Every Lovable coupling replaced with a Dallty-owned
  interface (`EmailProvider`, Standard Webhooks, direct Google API calls) rather than a
  second vendor SDK — see §20.
- **Important database changes:** None.
- **Known gaps:** `RESEND_API_KEY` status **UNKNOWN** as of this restructure — if still
  unset, `NullEmailProvider` is the active (non-sending) email path in production.
- **Deferred work:** None specific to this project — it was a removal/replacement project,
  not new scope.
- **Documentation location:** `DALLTY_VENDOR_INDEPENDENCE.md`.
- **Git commit:** `88e77e5` ("feat: remove Lovable runtime dependency, retarget build to
  Vercel"), `acc77be` ("chore: remove remaining lovable traces").
- **Production status:** Live in production — confirmed zero Lovable requests/assets/env
  vars during Project 09's deployment verification.

### Project 09 — Booking Engine & Availability Foundation (branch-aware)
- **Objective:** Make the booking/availability engine fully branch-aware from the
  foundation (branches are a core Dallty architectural requirement, not deferred), per an
  explicit, binding instruction that this must not be split into a future project.
- **Implementation status:** DONE — 8 implementation phases plus documentation, all
  individually tested and Preview-verified, then merged to `main` and deployed to
  production. Four specific customer/staff-facing capabilities remain PENDING (listed below,
  per explicit instruction not to mark them fixed).
- **Important architectural decisions:** Branches wired into every layer (staff assignment,
  hours, services, holidays, bookings — see §8) using a consistent nullable-override
  pattern (NULL = inherit default, a specific value = branch-specific override) so
  single-branch businesses (100% of real data) need zero special-casing. The customer
  branch-picker was implemented as a pre-step UI gate rather than inserting a new step into
  the existing six-step booking state machine, to avoid renumbering every `setStep()` call
  site in a large, working file. The primary customer purchase flow was deliberately **not**
  migrated onto the hold-then-confirm system (re-confirmed, not reopened, from Project 05's
  original scope decision).
- **Important database changes:** See §4/§8 for the full list — `staff_branches`,
  `branch_hours`, `staff_branch_schedules`, `staff_branch_day_hours`, `branch_services`,
  `holidays`, `temporary_blocks`, `bookings.branch_id`/`booking_items.branch_id`/
  `waitlist_entries.branch_id`, `bookings.reference`, `bookings.confirmation_status`,
  `countries.default_hold_minutes`/`businesses.hold_minutes`. Also: a security-grant fix
  (`REVOKE ... FROM anon, authenticated` by name) for five availability RPCs found
  unexpectedly publicly callable — see §6.
- **Known gaps at the time this project shipped (updated below — see Project 10):**
  - Customer HOLD → CONFIRM: **COMPLETED** (Project 10)
  - Branch price override: **COMPLETED** (Project 10)
  - Confirmation UI: **PENDING** — still true, not required by Project 10, not attempted
  - Walk-in UI: **PENDING** — still true, not required by Project 10, not attempted
- **Deferred work:** Dashboard UI for confirmation-call queue and walk-in booking (backend
  functions exist — `recordBookingConfirmation`, `createWalkInBooking`) remains deferred. The
  other two items in this list (`branch_services` consumption, hold-flow migration for the
  primary purchase flow) were completed by Project 10 — see below.
- **Documentation location:** `DALLTY_BOOKING_ENGINE.md` ("Project 09 update" section,
  read first), this file (§4, §6, §8, §9).
- **Git commit:** `f679847` through `7c85d54` (9 phase commits on
  `booking-engine-branches-foundation`), merged to `main` at `3739477`
  ("Merge booking-engine-branches-foundation into main: Project 09").
- **Production status:** **Live in production**, deployed and verified 2026-08-19 —
  homepage, `/auth`, `/search`, a business detail page, and real Supabase connectivity all
  confirmed working against commit `3739477`. Confirmed zero Lovable
  requests/assets/dependencies/environment variables on this deployment.

### Project 10 — Customer Booking HOLD → CONFIRMATION Flow
- **Objective:** Eliminate the direct customer-booking-insert path entirely (both signed-in
  and guest) and replace it with the authoritative server-side hold→confirm engine Project 09
  built but never wired to a UI, made safe under concurrency, slow connections, duplicate
  submissions, and manipulated clients.
- **Implementation status:** DONE — server-side guest hold support, branch-aware price
  resolution, client state machine, and the direct-insert closure all built, then verified
  against the real deployed Vercel Preview (not just the database layer): 12-way concurrency
  (1 success, 11 correctly rejected), idempotent confirm-retry (same cached result returned,
  no duplicate booking), and IDOR/manipulation tests (forged guest token, nonexistent hold,
  forced-past expiry) all passed. Merged to `main` and deployed to production.
- **Important architectural decisions:** Guest holds are anonymous at creation (no contact
  details required until confirm, matching when the UI actually collects them); ownership
  proven by a server-issued `guest_hold_token`, never a client-supplied id. Coupon resolution
  moved from hold-time to confirm-time, since the pre-existing UI applies a coupon at the
  confirmation step, which now happens after hold creation. Staff-facing direct-insert paths
  (`createMyAppointment`, `admin/appointments.tsx`'s manual-booking-duplicate feature,
  `createWalkInBooking`) were explicitly left untouched — out of this project's scope by the
  brief's own instruction.
- **Important database changes:** `bookings.guest_hold_token`; `bookings_identity_present`
  extended to accept a guest hold via token alone (no contact details yet); dropped the
  `authenticated`-role "Customers create own bookings" INSERT policy (the only remaining
  INSERT policy on `bookings` is the staff/owner one, unaffected). Two critical fixes to
  pre-existing infrastructure, found only by testing the real HTTP endpoints for the first
  time (see `DALLTY_BOOKING_ENGINE.md`'s Project 10 update for the full story): 
  `guard_bookings_customer_update()` (Project 03) was silently blocking every hold→confirm
  status transition since Project 09 shipped it — confirming a hold had never actually worked
  in production before this fix; `idempotency_keys`' unique constraint never deduplicated for
  `actor_id = NULL` (every guest operation), and `withIdempotency()`'s cached-response lookup
  used `.eq("actor_id", null)` instead of `.is("actor_id", null)`, so a guest could never
  retrieve their own completed response on retry.
- **Known gaps:** None introduced by this project. Confirmation UI and Walk-in UI remain
  PENDING from Project 09 — not required by this project's brief, not attempted here (see
  Project 09's entry above).
- **Deferred work:** Same as Project 09's remaining deferred item — dashboard UI for the
  confirmation-call queue and walk-in booking.
- **Documentation location:** `DALLTY_BOOKING_ENGINE.md` ("Project 10 update" section, read
  first), this file (this entry).
- **Git commit:** `d2e3b2b` through `7f6b182` (5 commits on
  `project-10-customer-booking-hold-confirm`: DB lockdown, engine rewrite, UI rewrite,
  critical-bug fixes, docs), merged to `main` at `e74c013`
  ("Merge project-10-customer-booking-hold-confirm into main: Project 10").
- **Production status:** **Live in production**, deployed and verified 2026-08-19 — homepage
  rendered correctly with real data on both `https://www.dallty.com` and `https://dallty.com`
  (redirects to `www`), and a live Supabase REST request returned 200 against commit
  `e74c013`.

---

## NEXT PROJECT

**Recommendation: complete the Security Anti-Fraud Hardening initiative (Batches 2–6).**

Reasoning, based on actual architectural/dependency state rather than general priority:

1. **It is already half-shipped in production, not a clean unstarted proposal.** Batch 1
   (RPC rate-limit lockdown, error sanitization, notification idempotency) is live; Batches
   2–6 (central risk engine, server-side login-throttle enforcement, multi-owner protection
   workflow, review-abuse protection, booking-hold expiry cron sweep, magic-byte upload
   validation, security-event taxonomy + Super Admin dashboard, refreshed threat model) were
   never started. A partially-implemented security initiative left indefinitely incomplete
   is a worse state than either finishing it or not having started it — it's the kind of gap
   most likely to be silently assumed "done" by a future session skimming commit history.
2. **The login-throttle/CAPTCHA gap it would close is the single most-repeated unresolved
   item across the entire documentation set** — flagged as the top-priority open item in
   Project 03, still open through Project 09, independently rediscovered as a related root
   cause (RPC-grant exposure) during Project 09 itself. No other deferred item has been
   flagged this many times across this many independent projects.
3. **It has no unmet dependency.** Unlike the RBAC/permission-enforcement wiring (§7,
   architecturally real work but not blocking anything currently broken) or the Project 09
   dashboard-UI gaps (§8/§9, valuable but additive — the backend they'd drive already
   exists and is safe without them), this initiative closes actively-exploitable gaps in
   already-shipped, already-live functionality.
4. **It naturally absorbs the multi-owner protection workflow** (Batch 3 of the original
   plan), which is exactly the piece §7 identifies as blocked on nothing except being built
   — `business_memberships.is_primary_owner`'s partial unique index has been schema-ready
   since Project 01 specifically for this.

**Close seconds, not recommended first, with reasoning:**
- Project 09's own dashboard-UI gaps (confirmation-call queue, walk-in UI) — smaller, safer,
  immediately valuable, but the backend is already safe without them; no security exposure
  results from leaving them PENDING a while longer.
- Wiring the RBAC/permission schema into real enforcement (§7) — genuinely valuable and a
  real architectural dependency for several future capabilities, but nothing today is
  actively broken by its absence the way the login-throttle gap is.
- A CI pipeline (§2, §19) — should happen soon, but is process infrastructure, not a
  user-facing or security-facing gap, and doesn't block any specific next feature.

**Do not implement any of this yet** — this document is the architecture/documentation audit
only, per this task's explicit instruction. No application functionality was modified while
producing it.
