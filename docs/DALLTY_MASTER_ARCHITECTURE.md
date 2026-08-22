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

**Live today at `https://www.dallty.com`** (verified 2026-08-21, post Project 11 deployment).

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

Current production commit: `4f6d2d8` (merge of `project-11-business-operations` into
`main`, Project 11). Verified live at deploy time: homepage (real `countries`/`businesses`
REST calls returning 200, zero console errors) and `/admin/confirmations` (correctly
redirects an unauthenticated visitor to `/auth?next=...` rather than crashing) confirmed
against this exact commit. See §19 for the full deployment architecture and §20 for
Lovable-independence verification.

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

**As of Project 11 (2026-08-20): permission-based, not just role-only.** `platform_roles`/
`permissions`/`role_permissions` (Project 01, seeded but consulted by nothing through
Project 10) are now real, live-consulted enforcement via two new SECURITY DEFINER
resolvers: `has_permission(_user_id, _business_id, _permission_key, _branch_id)` — resolves
`businesses.owner_id` first, then an active `business_memberships` row's
`role_id → role_permissions → permissions`, honoring `scope` (`global`/`business`/`self`
all pass regardless of branch; `branch` requires the membership's `branch_id` to be NULL
["all branches"] or match) — and the coarser `has_branch_access(_user_id, _business_id,
_branch_id)` for branch-scoped list views. Both are additive: `owns_business()` and every
pre-existing RLS policy/`assertCanManageBusiness` built on it are byte-for-byte unchanged,
so nothing that worked before Project 11 changed behavior. New Project 11 surfaces
(`src/lib/permissions.server.ts`'s `assertHasPermission`/`hasPermission`, consulted by
`rescheduleBooking`, `createWalkInBooking`, `markCashPayment`, `addExtraService`, and the
new confirmation/no-show/cancellation functions) are the first real consumers.

`business_memberships` gained a `branch_id` column (nullable = all branches) — previously
no branch-scoping concept existed for governance roles at all. A new
`src/lib/business-membership.functions.ts` provides the invite/list/update/remove flow for
owner/manager/receptionist/confirmation_member/specialist-as-membership roles, plus
business-scoped custom-role creation (`createCustomRole`/`setCustomRolePermissions`,
constrained to the Super-Admin-controlled `permissions` catalog — a business can only
compose from keys Super Admin has already made available, never invent one). This is
deliberately separate from `staff-access.functions.ts`'s specialist (service-delivery
profile) invite flow — governance role vs. service-delivery profile remain two tables by
design (see below).

**Verified live** (Project 11, real fixtures created and torn down against the production
database, not assumed): the full role × permission matrix — owner gets every key on their
business; receptionist gets `booking.confirm`/`payments.mark_paid` but not
`payments.refund`/`finance.view_revenue`/`staff.permissions`; confirmation_member gets
`booking.confirm`/`booking.no_show` but not `payments.mark_paid` — and cross-tenant
isolation both directions (a receptionist/owner of Business A gets `false` for every
permission check against Business B, and vice versa). Also verified: `business_memberships`
RLS correctly restricts a non-owner to only their own membership row;
`booking_status_history`'s INSERT policy blocks both cross-tenant writes and actor-id
spoofing (a user cannot insert a history row claiming to be someone else), confirmed via a
real FK-only failure (RLS itself passed) for a legitimate same-actor, same-business insert.

**Still open:** the multi-owner protection workflow (owner-removal email confirmation,
15-day protection window — schema-ready via `business_memberships.is_primary_owner`'s
partial unique index, not built) remains not built — Project 11 wired the permission
resolver, not this specific workflow. `has_permission()`'s `'self'` scope resolves to `true`
at the resolver layer; callers combining it with a resource-level self-check (e.g. "is this
booking's `staff_id` this specialist's own `staff` row") are responsible for that second
check themselves, since "self" ownership means a different thing per resource type. The
`'country'` permission scope exists in the enum but is granted to no role (unchanged from
Project 01) — no country-scoped enforcement exists yet, correctly not built ahead of a real
consumer. The dashboard nav (`AdminShell`) now filters to a reduced set for
receptionist/confirmation_member (no finance/staff/settings sections), resolved against the
caller's *first* managed business — a real owner/manager with a receptionist membership on
a *second* business would still see the reduced nav there today, a known, narrow gap from
resolving role against a single "active business" rather than per-business context.

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

**Current deployment:** Vercel Production, commit `4f6d2d8`.

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
- **Known gaps at the time this project shipped (updated below — see Projects 10 and 11):**
  - Customer HOLD → CONFIRM: **COMPLETED** (Project 10)
  - Branch price override: **COMPLETED** (Project 10)
  - Confirmation UI: **COMPLETED** (Project 11 — Confirmation Center, `/admin/confirmations`)
  - Walk-in UI: **COMPLETED** (Project 11 — `WalkInDialog`, wired into `/admin/appointments`)
- **Deferred work:** All four items originally listed here are now closed across Projects 10
  and 11 — see each project's own entry below for what specifically shipped.
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

### Project 11 — Business Booking Operations & Confirmation Center
- **Objective:** Build the operational workflow letting a business actually manage bookings
  after customers create them — confirmation calls, walk-ins, cash settlement, no-shows,
  cancellation, branch-scoped staff roles — on top of Project 09/10's foundations, per an
  explicit instruction not to rebuild either.
- **Implementation status:** DONE (7 phases) — RBAC enforcement, booking-ops backend gaps
  (including one live security fix), Confirmation Center UI, walk-in booking UI, payments/
  calendar dashboard upgrades, ledger-backed financial breakdown, and a live security
  verification pass, all built, tested, and merged to `main`.
- **Important architectural decisions:** The permission resolver (`has_permission()`) was
  built strictly additive — `owns_business()` and all 41+ pre-existing RLS policies stay
  untouched; new surfaces consult the new resolver, old surfaces keep working exactly as
  before. Governance-role invitation (`business-membership.functions.ts`) was kept as a
  separate flow from specialist invitation (`staff-access.functions.ts`), matching the
  Master Architecture's own staff-vs-membership table distinction. Confirmation call
  history was added as a new table rather than widening the existing
  `booking_confirmation_status` summary enum, keeping that pre-existing three-state-machine
  contract (`booking_status`/`payment_status`/`confirmation_status`) unchanged per the
  brief's own "internal enums remain stable" instruction. The customer-facing cancellation
  path (Project 10) was deliberately left untouched — `cancelBookingStaff` is a separate,
  staff-side-only function, not a migration of the customer flow.
- **Important database changes:** `business_memberships.branch_id`; `has_permission()`/
  `has_branch_access()` SECURITY DEFINER functions; a `booking.no_show` permission key and
  financial (`payments.*`/`finance.*`/`balance.*`) role grants that existed since Project 06
  with zero role grants until now; `booking_confirmation_calls` (call-attempt history,
  service-role-write-only) and `booking_status_history` (immutable operational audit trail,
  actor-spoofing-proof INSERT policy) tables.
- **Known gaps:** No dedicated staff-payout *recording* function exists yet (accrual via the
  ledger is real; marking a payout as actually paid out is not — a pre-existing Project 06
  gap, not reopened or closed here). The multi-owner protection workflow remains unbuilt
  (§7). AdminShell's reduced-nav-by-role resolves against the caller's first managed
  business only — a receptionist membership on a second business would still see the full
  nav there. `createWalkInBooking`'s any-specialist option and the new server-side
  authorization on every mutation were verified via direct database-level testing (a live
  role/permission matrix across real, disposable test fixtures, torn down afterward) and
  static verification (`tsc`/`eslint`/build) on every phase; full interactive click-through
  of the new dashboard UI (Confirmation Center buttons, Walk-in dialog submission, Cash
  Payment dialog submission) was **not** performed end-to-end in a real authenticated
  browser session — this session had no working login credentials for a fresh account on
  the Preview deployment, and Preview sessions cannot inherit the production login (separate
  origin, separate `localStorage`). Recorded here rather than silently assumed done —
  a real click-through pass is recommended as the first follow-up.
- **Deferred work:** Staff-payout recording; multi-owner protection workflow; per-business
  (not just per-caller) nav role resolution; migrating the customer-facing cancellation flow
  onto `cancelBookingStaff`'s shared history/audit trail.
- **Documentation location:** This file (§7 RBAC, this entry). No dedicated
  `DALLTY_BUSINESS_OPERATIONS_ARCHITECTURE.md` was created — the scope stayed small enough
  to document here without a new file, per the Master Architecture's own "don't build ahead
  of a consumer" discipline applied to documentation structure too.
- **Git commit:** `63216ae` through `ef33f3d` (8 commits — 7 implementation phases plus
  documentation — on `project-11-business-operations`), merged to `main` at `4f6d2d8`
  ("Merge branch 'project-11-business-operations': Project 11").
- **Production status:** **Live in production**, deployed and verified 2026-08-21 —
  `https://www.dallty.com` homepage confirmed rendering with real data (`countries`/
  `businesses` REST calls returning 200, zero console errors), and `/admin/confirmations`
  confirmed redirecting unauthenticated visitors to `/auth?next=...` rather than crashing,
  against production commit `4f6d2d8`. Full authenticated click-through of the new dashboard
  UI was not performed in this pass — see this entry's Known gaps.

---

### Project 12 — Central Financial Ledger: Payouts, Deposits, Reconciliation, Affiliates
- **Objective:** Close the real gaps Project 06 and Project 11 both explicitly carried
  forward as "not yet built" — staff-payout *recording* (accrual into `staff_payable` was
  real, actually marking a payout paid was not), deposit-collection recording, and a
  no-show financial policy — plus build the payments-vs-ledger reconciliation tool and the
  affiliate/business-referral foundations that were confirmed genuinely zero anywhere in the
  codebase, and country-specific payout field requirements. Per branch name and commit
  history, run as 8 phases on `project-12-financial-ledger`.
- **Implementation status:** DONE (8 phases: staff payout recording; deposit collection +
  no-show charge policy; payments-vs-ledger reconciliation; affiliate foundation; business
  referrals; country-specific payout field requirements; financial-dashboard date-preset and
  branch/specialist/service/payment-status filters; a live security fix plus an RLS test
  matrix pass), all built and phase-tested on this branch. **Not yet merged to `main` as of
  this writing — code-complete on `project-12-financial-ledger` only, not deployed.**
- **Important architectural decisions:** `staff_payout_items` links a payout to the exact
  `staff_earning` ledger rows it covers via a `UNIQUE` constraint on
  `ledger_transaction_id` — enforced at the database level, not just in application logic,
  so the same earning can never be double-paid across concurrent/retried payout runs.
  `createStaffPayout`/`settleStaffPayout` is a deliberate two-step create→settle flow: create
  locks the covered earnings without touching the ledger at all; only the transition to
  `'paid'` posts (debit `staff_payable`/credit `external_cash`), so a cancelled or failed
  payout never leaves a phantom ledger entry to reverse. Deposit collection
  (`collectDepositPayment`) posts only `cash_received`/`service_revenue` for the deposit
  amount with no commission/staff-earning split; `markCashPayment` was made deposit-aware
  (`expected = total_price − alreadyPaid`, commission/staff-earning computed once on the
  booking's full final service revenue) so a deposit-then-remainder booking nets identically
  to one paid in a single shot — verified backward compatible (no prior payment ⇒
  byte-for-byte unchanged behavior). No-show charging (`markNoShow`) records policy intent
  only — `'full_charge'` is never an actual charge, since no payment gateway exists in this
  environment to collect one, matching every prior project's same honest framing.
  Reconciliation (`runReconciliation`, Super Admin only) checks `payments.received_amount`
  sums against `ledger_transactions` `external_cash`-debit sums per business — a genuine
  integrity check between two independently-written record sets, not cache-vs-source (the
  ledger has no cached balance to drift). Affiliate commission rules mirror the existing
  `commission_rules` precedence shape (affiliate-specific → country-specific → global
  default) rather than inventing a new hierarchy. Both affiliate and business-referral
  "activation" are explicitly Project-13-dependent — "becomes a paying subscriber" has no
  real trigger since no subscription system exists — so `activateAffiliateReferral`/
  `activateBusinessReferral` are Super-Admin-callable manual stand-ins today, each documented
  as the hook a future subscription-payment-success handler should call instead of
  duplicating the logic. A live security pass (Phase 8) found that `has_permission()`'s SQL
  implementation does not distinguish `scope='self'` from `'business'`/`'global'` — dead code
  until `getStaffOwedAmount`/`listStaffOwedAmounts` became its first consumer of a
  `'self'`-scoped grant, which would have let a specialist view every other specialist's
  owed payout amount business-wide. Fixed in application code
  (`src/lib/payout.functions.ts`, using the pre-existing but previously-unused
  `myBusinessRole()` helper) rather than the shared SQL function, since these are the only
  two `'self'`-scope consumers today — flagged as an open architectural note for any future
  `'self'`-scope consumer.
- **Important database changes:** `staff_payouts.status` CHECK constraint realigned to the
  brief's 6-state machine (`pending`/`available`/`processing`/`paid`/`failed`/`cancelled`);
  new `staff_payout_items` (`UNIQUE (ledger_transaction_id)`). `businesses.no_show_charge_policy`
  (`no_charge`/`retain_deposit`/`full_charge`). New `affiliates` (`user_id` `UNIQUE`,
  `referral_code` `UNIQUE`, auto-approved on apply), `affiliate_commission_rules`,
  `affiliate_referrals` (`pending`→`converted` attribution tracking); new
  `ledger_account_type` enum value `affiliate_payable`; `ledger_transactions`' SELECT RLS
  policy extended additively (every existing clause preserved, one new OR'd clause) so an
  affiliate can see their own accrual. New `business_referrals` (one-off reward, distinct
  from the ongoing affiliate commission model, credited to `promotional_credit` — explicitly
  not the same account as `business_balance`'s real cash revenue). New
  `country_payout_requirements` reference table, seeded for Algeria
  (`ccp_account`/`ccp_key`/`rib`/`account_holder_name`) as the proof-of-shape example —
  deliberately schema/reference-data only, no collection UI built ahead of a consumer.
- **Known gaps:** Same Project-13 boundary noted above for affiliate/business-referral
  activation — no real "became a paying subscriber" trigger exists. `country_payout_requirements`
  has no UI/server function collecting an actual filled-in payout profile yet (reference data
  only). `has_permission()`'s own SQL implementation still doesn't distinguish `'self'` scope
  from `'business'`/`'global'` — only worked around in the two current application-code
  consumers, not fixed at the source; any future `'self'`-scoped permission consumer must
  replicate the same `myBusinessRole()`-based check or risk the identical exposure.
- **Deferred work:** A real charge mechanism for `no_show_charge_policy: 'full_charge'`
  (blocked on a payment gateway that doesn't exist); a payout-profile collection UI/flow for
  `country_payout_requirements`; hardening `has_permission()` itself to accept a
  target-user parameter so `'self'` scope is safe by default rather than by convention;
  Project 13's subscription-payment-success handler wiring into
  `activateAffiliateReferral`/`activateBusinessReferral`.
- **Documentation location:** `DALLTY_FINANCIAL_ARCHITECTURE.md` (Project 12 update
  section, read first), `DALLTY_DATABASE_CHANGELOG.md`, this entry.
- **Git commit:** `b8a2252` (Phase 1, staff payout recording), `669f8de` (Phase 2, deposits/
  no-show policy), `a1ab6b9` (Phase 3, reconciliation), `42f3543` (Phase 4-5, affiliate
  foundation + business referrals, one combined commit), `bef1cb2` (Phase 6, country payout
  config), `b0450c7` (Phase 7, dashboard filters), `ac16f1e` (Phase 8, security fix + live
  RLS test matrix, 9/9 pass) — 7 commits covering 8 phases, on `project-12-financial-ledger`.
- **Production status:** **Not deployed.** `main` remains at `96cd71b` (Project 11's docs
  commit) as of this writing — `project-12-financial-ledger` has not been merged. Everything
  above is code-complete and phase-tested on the branch only; no production verification has
  been performed for this project.

### Project 13 — Subscription/Billing Architecture

- **Objective:** Build the plan/pricing/subscription/billing system Project 12 explicitly
  flagged as its own boundary — "becomes a paying subscriber" had no real trigger because no
  subscription system existed. Editable plan configuration (price, trial/grace periods,
  staff/branch/booking/customer limits, feature entitlements, advertising eligibility), the
  full subscription lifecycle (plan → subscription → billing period → upgrade/downgrade →
  cancellation → renewal → expiration), a temporary manual payment-recording mechanism reusing
  Project 12's ledger exactly, real staff-limit entitlement enforcement, and wiring the
  affiliate/business-referral triggers Project 12 built as a documented hook for this project
  to call. Required a security prerequisite (`has_permission()` scope audit) before the new
  permission checks could be trusted. Run as 5 commits on `project-13-subscriptions`.
- **Implementation status:** DONE — security prerequisite, main schema/server-function build,
  and three live-testing-driven follow-up security/bug fixes, all built and live-tested on
  this branch. **Not yet merged to `main` and not deployed as of this writing** — `main`
  remains at `82761f5` (verified via `git log main`); none of the five Project 13 commits are
  present on it.
- **Important architectural decisions:** `subscription_plans` is an editable reference table
  (`plan_key` is text, not the pre-existing `businesses.plan` enum, so a future plan needs
  only an `INSERT`) — 3 provisional plan keys seeded (starter/professional/enterprise),
  explicitly marked `is_provisional`, not final commercial pricing. `business_subscriptions`
  holds one current-state row per business; `subscription_events` is the append-only
  transition history — mirrors Project 12's `staff_payouts`/ledger split ("one current status
  row, immutable trail for the history"), not a new pattern. A real `pg_cron`-scheduled daily
  sweep (`run_subscription_lifecycle_sweep()`, matching the existing
  `generate_due_booking_reminders()` pattern) handles trial expiry, grace-period entry, and
  scheduled cancellation automatically, rather than needing a manual trigger.
  `subscription_payments` + `recordSubscriptionPayment` are an explicit, honestly-labeled
  **TEMPORARY** manual/admin-recorded mechanism — no payment gateway is configured for Dallty
  subscriptions anywhere in this environment, confirmed via a repo-wide + `.env` audit before
  building this. Super-Admin-only, since a business self-attesting its own payment would be
  trivially forgeable. Reuses Project 12's ledger exactly (`external_cash` debit /
  `dallty_revenue` credit on the business's own account, type `'subscription_payment'`) — no
  new ledger/payment/balance/payout system. On a business's first successful payment, the real
  affiliate-commission and business-referral-reward triggers now fire automatically:
  `activateAffiliateReferralCore`/`activateBusinessReferralCore` were extracted from Project
  12's existing, already-tested `activateAffiliateReferral`/`activateBusinessReferral` so both
  the Super-Admin manual path and this new automatic trigger share one implementation.
  Business-referral reward is a Super-Admin-editable percentage (new `subscription_settings`
  single-row config table, matching `auth_settings`' own pattern), not a hardcoded number.
  Real entitlement enforcement: a `BEFORE INSERT/UPDATE` trigger on `staff`
  (`enforce_staff_limit()`) blocks exceeding a plan's `staff_limit` — the actual
  add-staff-member path is a plain RLS-gated client-side insert, not a server function, so a
  DB trigger was the only enforcement point that couldn't be bypassed. Branch-limit is tracked
  in the plan config but deliberately **not enforced anywhere** — no branch-creation function
  exists in the app yet to enforce it against. Fixed the pre-existing hardcoded 14-day trial in
  `business.functions.ts`'s `registerBusiness` (now reads the chosen plan's own
  `trial_duration_days` via `resolvePlanTrialEndsAt`). Backfilled all 9 pre-existing businesses
  with a grandfathered `'active'` subscription row (`current_period_end` left `NULL` so the
  lifecycle sweep never force-transitions a business that never had a real billing cycle).
  **Security findings, the most significant part of this project:** (1) a live audit found
  `has_permission()`'s SQL treated `scope='self'` identically to `'business'`/`'global'` — a
  complete no-op — and unlike a narrower Project 12 finding, this one was live and exploitable:
  `assertBookingAction` and `rescheduleBooking` fell back to "does the caller have ANY staff
  row at this business" rather than "is the caller the specific assigned staff for THIS
  booking," meaning any specialist could confirm/reschedule/view-history on any OTHER
  specialist's booking. Fixed `has_permission()` itself (added an optional `_target_user_id`
  parameter; self-scope now requires it to match the caller; global-scope now checks across
  every membership instead of one specific `business_id`) and rewired both callers to resolve
  the booking's actual assigned staff and pass it as the target — live-verified against the
  real Specialist A / Specialist B test accounts. `recordBookingConfirmation` and
  `createWalkInBooking` were confirmed deliberately "any staff member" by design per their own
  doc comments and correctly left untouched. (2) Live RBAC testing against the real Manager
  test account found `owns_business()` deliberately treats `'manager'` as owner-equivalent
  (its own SQL ORs in `role.key IN ('owner','manager')`) — correct for most surfaces, wrong for
  subscription actions specifically, since `subscription.manage`/`subscription.view` are only
  ever seeded to `'owner'` and `'super_admin'`, never `'manager'`, and every subscription
  function's `owns_business() OR hasPermission(...)` check let the OR-clause silently defeat
  that restriction. Fixed by using a literal `businesses.owner_id = userId` check instead of
  `owns_business()` in all 4 subscription management functions and the 3 subscription tables'
  RLS SELECT policies (defense in depth) — live-verified against every real test account
  (owner PASS; manager/receptionist/specialist/affiliate/customer/second-owner all correctly
  DENY). (3) An actual end-to-end functional SQL simulation (not just `tsc`) caught two real
  bugs: `postLedgerGroup`'s `paymentId` parameter has a foreign key to the `payments` table
  specifically (booking payments) — passing `subscription_payments.id` there would have failed
  on every real payment recorded; fixed by not passing `paymentId` at all, routing
  traceability through the `reason` field instead. And `subscription_payments`/
  `subscription_events` had `UPDATE`/`DELETE` REVOKEd from `service_role` too (copying
  `ledger_transactions`' stricter immutability pattern), which broke
  `recordSubscriptionPayment`'s own legitimate `ledger_group_id` backfill `UPDATE` — confirmed
  failing live before the fix. Fixed by restoring `UPDATE` for `service_role` on both tables
  (`DELETE` stays revoked even for `service_role` — no legitimate deletion path exists for
  financial/audit records). (4) Also found and fixed in passing: 4 orphaned test businesses
  from an earlier Project 12 security-test run that the immutable ledger trigger correctly
  prevented from being deleted (working as designed) but that predated the `is_test` isolation
  flag and were silently inflating real platform KPI totals in `platformOverview` — re-tagged
  `is_test=true`. This is leftover Project 12 hygiene debt found while working in this area,
  not a Project 13 deliverable in its own right. (5) A forward-compatibility bug caught by
  directly testing the scenario the whole reference-table design exists to support:
  `businesses.plan` was still typed as the fixed 3-value `subscription_plan` enum, so
  assigning a business to a hypothetical 4th plan (created live to test this) threw `invalid
  input value for enum subscription_plan` on the `businesses.plan` sync every subscription
  function performs — silently defeating this project's own explicit "treat these as the
  initial plan keys only" promise. `businesses.plan` is confirmed display-only (Super Admin
  directory badge, settings page's read-only field — neither gates any logic), so it was
  widened to `text` with a foreign key to `subscription_plans.plan_key` instead — live-
  verified by creating a disposable 4th plan, assigning a real business to it, then reverting.
- **Important database changes:** New `subscription_plans` (editable reference table, public
  SELECT, Super-Admin-only write, 3 provisional rows seeded); `business_subscriptions`
  (`UNIQUE (business_id)`, current-state row, RLS SELECT owner/`subscription.view`/
  platform-admin, no direct authenticated write policy — every write goes through server
  functions using the service-role client); `subscription_events` (append-only, `UPDATE`/
  `DELETE` revoked from both `authenticated` and `service_role`); `subscription_payments`
  (`payment_method` defaults to `'manual_admin_recorded'`, `ledger_group_id` nullable then
  backfilled, `UPDATE`/`DELETE` revoked from `authenticated`, `UPDATE` restored for
  `service_role` in a follow-up migration, `DELETE` stays revoked for everyone);
  `subscription_settings` (single-row config, `business_referral_reward_percent`, Super-Admin
  write). `enforce_staff_limit()` trigger on `staff` (`BEFORE INSERT`/reactivate `UPDATE`).
  `run_subscription_lifecycle_sweep()`, scheduled daily via `pg_cron`
  (`dallty-subscription-lifecycle-sweep`, `0 3 * * *`). `has_permission()` signature extended
  with `_target_user_id uuid DEFAULT NULL` (backward compatible — every existing caller that
  doesn't pass it keeps its exact current behavior for `'business'`/`'branch'` scope, and now
  correctly fails closed for `'self'` scope instead of silently passing).
- **Known gaps:** Branch-limit is configured per plan but not enforced anywhere (no
  branch-creation function exists yet to enforce it against). `monthly_booking_limit`/
  `customer_limit` are configured per plan and surfaced in the `/admin/billing` usage display
  (`getBusinessEntitlements`) but not enforced by any trigger or server function — only
  `staff_limit` has real enforcement. `subscription_events`' `'entitlement_denied'` event type
  exists in the CHECK constraint but has no producer yet (only the staff-limit trigger denies
  today, via a raw Postgres exception, not an event row). No payment gateway exists —
  `recordSubscriptionPayment` remains a manual Super-Admin stand-in by design, not a gap to
  close within this project. `businesses.is_test`/`profiles.is_test` weren't touched by any
  Project 13 migration — the 4 re-tagged test businesses were fixed via direct
  `UPDATE`/admin tooling, not a migration, since they were pre-existing Project 12 rows.
- **Deferred work:** A real payment-gateway adapter (blocked on provider credentials that
  don't exist in this environment); branch-limit enforcement (needs a branch-creation function
  to exist first); monthly-booking-limit and customer-limit enforcement (need real consumers —
  the booking-creation and customer-creation code paths — wired against
  `getBusinessEntitlements`); an `'entitlement_denied'` event producer for entitlement checks
  beyond the staff trigger's raw exception.
- **Documentation location:** `DALLTY_FINANCIAL_ARCHITECTURE.md` (Project 13 update section,
  read first), `DALLTY_DATABASE_CHANGELOG.md`, this entry.
- **Git commit:** `a07c53d` (Phase 0, `has_permission()` scope audit and fix — security
  prerequisite), `6fcd544` (main build — plan/pricing/subscription/billing architecture),
  `bc1ee85` (live-testing fix — deny manager access via `owns_business()`'s owner-equivalent
  grant), `2b26f1d` (live-testing fix — ledger FK mismatch and over-strict `service_role`
  grants), `817ff78` (live-testing fix — `businesses.plan` widened from a 3-value enum to
  text) — 5 commits, on `project-13-subscriptions`.
- **Production status:** **Not deployed.** `main` remains at `82761f5` (predates all five
  Project 13 commits, confirmed via `git log main --oneline`) as of this writing —
  `project-13-subscriptions` has not been merged. Everything above is code-complete and
  live-tested on the branch only; no production verification has been performed for this
  project.

---

### Project 16 — UI/UX Transformation (Premium App-Like Experience)

- **Scope:** Presentation/interaction layer only, per this project's own explicit rule — no
  backend, database, auth architecture, or second booking engine. Delivered: brand design
  tokens (colors, typography, motion, z-index), a phone-first authentication hierarchy, a
  real booking-flow bug fix, a reusable skeleton system, a connection-lost banner, and
  targeted responsive/mobile fixes. Full audit (design system, components, fonts, colors,
  navigation, responsive strategy, booking flow, auth flow, loading behavior) was delivered
  as a standalone chat report before any code changed, per the project's own audit-first
  requirement — not reproduced here; see git history / session record for the full text.
- **Design tokens (`src/styles.css`):** Brand palette converted from the approved hex board to
  oklch, matching the existing token system's own convention (no hex anywhere else in the
  file): `--primary` = deep green `#0F4F35` (structure/identity — the role this token already
  played everywhere: nav, borders, rings, icons), new `--lime` = `#C0DD00` (primary-action
  energy, scoped to actual CTA buttons — Book Now/Continue/Confirm — not blanket-applied to
  every existing `--primary` usage, to avoid a "fluorescent everywhere" result the brief
  explicitly warned against), new `--pink` = `#FF78DB` (accent/highlight moments), `--background`
  (light) = cream `#F7F5EE`. Added `--motion-fast/normal/emphasis` and `--z-sticky/nav/overlay/
  drawer/toast` tokens (previously no centralized motion/z-index scale existed). Added a
  `text-display/h1/h2/h3/body/body-sm/label/caption/button` typography utility set on
  Clash Display (headlines) + Inter (everything else, replacing Manrope) — applied to the
  homepage hero and the auth headline as the reference implementation; full hierarchy adoption
  across every remaining heading in the app was not attempted in this pass (see Remaining Gaps).
  Fonts load via Google Fonts (Inter) and Fontshare (Clash Display, free-for-commercial), which
  required adding `api.fontshare.com`/`cdn.fontshare.com` to the CSP in `src/server.ts` — that
  CSP is otherwise deliberately minimal and origin-verified (see its own comment); this was the
  one required addition, confirmed necessary by an actual CSP violation during testing, not
  guessed.
- **Booking-flow bug fix (`src/routes/business.$businessSlug.tsx`):** The audit found a real,
  live bug matching this project's own "no booking redirects" rule: tapping a time slot as a
  signed-out customer force-redirected to `/auth` unconditionally, via a stale code path whose
  own comment ("online booking requires an authenticated account, no guest booking") was
  already contradicted by the rest of the component — guest checkout (name/phone/email
  collected inline at step 4, `createGuestBookingHold`/`confirmGuestBookingHold`) was fully
  wired and already the intended path. Removed the dead redirect block entirely; `createHold`
  already dispatches to the guest-safe RPC automatically based on `user` presence, so no other
  change was needed. This was the most consequential fix in the project — every signed-out
  customer hitting the primary booking path was being sent to a redirect that guest checkout
  had already made unnecessary.
- **Auth phone-first hierarchy (`src/routes/auth.tsx`):** The "choose method" screen previously
  showed four visually-equal buttons (Phone/Email/Google/Apple). Rebuilt to match the brief's
  own mockup exactly: the phone input renders inline as the default state with a large lime
  "Continue" CTA, "Continue with email" is a small secondary text link, Google/Apple sit below
  a divider, equal to each other but secondary to phone. The now-redundant separate `"phone"`
  step was removed from the state machine (merged into `"choose"`) rather than left as dead
  code. No new auth architecture — same OTP/OAuth/profile-completion logic underneath, only the
  entry screen's layout changed. New i18n keys (`continue_to_book`, `enter_phone_sub`,
  `continue`) added to all three locales (en/fr/ar), not hardcoded.
- **Skeleton system (`src/components/dallty/skeletons.tsx`, new file):** `BusinessCardSkeleton`,
  `SearchSkeleton`, `BusinessPageSkeleton`, `BookingSkeleton`, `CalendarSkeleton`,
  `DashboardSkeleton`, `TableSkeleton`, `ProfileSkeleton`, `ReviewSkeleton`, plus a `ListSkeleton`
  for the recurring "grid of glass cards" loading pattern. Wired into search results, the
  business detail page's initial load, the customers/staff lists, and the platform overview
  dashboard/table — replacing bare "Loading…" text and a couple of undersized ad hoc skeletons.
  Not every loading state in the app was converted (see Remaining Gaps) — the homepage's
  nearby-businesses section and the main business dashboard home were deliberately left
  untouched since their loading semantics (demo-data fallback; no existing loading branch)
  would have needed a real behavior change, not just a presentation swap, to wire in safely.
- **Connection-lost banner (`src/components/dallty/connection-banner.tsx`, new):** Listens to
  `online`/`offline` browser events, shows a non-blocking pill at the top of the screen. Purely
  informational — it never retries anything itself; existing booking/payment mutations keep
  their own idempotent retry logic untouched, per the brief's explicit "never blindly retry
  financial mutations" rule.
- **Responsive (`src/routes/_authenticated/admin/platform/overview.tsx`):** The one true
  `<table>` in the app (platform shops list, previously horizontal-scroll-only on mobile) now
  has a card-based mobile view below `sm:`, with the full table preserved at `sm:` and up.
  Business-owner-facing "tables" (customers, staff) were already card-based per the audit and
  needed no change.
- **Brand color rollout beyond tokens:** `bg-lime`/`text-lime-foreground` applied to the actual
  primary-action buttons the brief's own button mockup shows as lime (homepage hero search,
  business card "Book", booking flow "Continue"/"Confirm booking"). `bg-pink` applied to the
  homepage's closing marketing CTA (the brief's own "Get Started"-style accent-button example).
  Two new `button.tsx` variants (`lime`, `accent`) added alongside the existing ones rather than
  changing the `default` variant's color — dozens of existing `variant="default"` call sites
  across the admin/dashboard are structural actions, not high-energy CTAs, and changing their
  color globally was judged out of scope and risky for this pass.
- **CRITICAL, UNRESOLVED — excessive/looping requests on real data (found during this
  project's own testing, not something this project caused):** Opening the booking tab of a
  business that has real services/staff/availability configured (previously impossible — every
  production business was `marketplace_status='draft'` with zero services until this session's
  test-data work) produces a very high volume of repeated identical requests to
  `getBusinessAvailabilityOverview`/`getStaffDayAvailability`, confirmed live on both
  `www.dallty.com` and `dallty.vercel.app`. One real, verified contributing cause was found and
  fixed: `src/routes/business.$businessSlug.tsx`'s `useQueries` call for per-specialist "next
  available day" was fed a brand-new, unmemoized config array every render — confirmed via
  `git blame` to predate this session (original commit `5864923`), now memoized (commit
  `cfa696a`, already deployed to production). That fix is real and verified working in
  isolation (local dev server, clean single-call-per-function trace, interactive booking flow
  end to end). **However, retesting live in production after deploying it, the excessive-request
  pattern still reproduces** — and a second instance was observed on the homepage
  (`useLiveBusinesses`, a simple single stably-keyed `useQuery` with no plausible in-code loop
  mechanism), suggesting either a shared root cause not yet isolated, or an artifact of the
  testing method itself (rapid repeated navigations) rather than the app's real steady-state
  behavior — this session could not distinguish between those with confidence. Supabase's own
  connection count was checked and is healthy (24/60) and the request-based rate limiter (which
  throws a hard, visible error rather than degrading silently) never fired, which rules out the
  most severe interpretations but does not resolve the question. **Do not treat the booking or
  marketplace pages as fully performance-verified until this is investigated with real browser
  DevTools** (proper network waterfall timing — this session only had access to an approximated
  request log, insufficient to distinguish a true infinite loop from a large bounded burst).
  Currently low real-world exposure: no real (non-test) approved business has services
  configured yet, so no actual customer has hit this path.
- **Post-report fixes (found via live user bug reports after this project's final report was
  delivered, deployed directly to `main` — commit `bb0b924`):**
  - **Booking confirmation failure ("Something went wrong confirming your booking"):**
    root-caused to `z.string().datetime()` (in `src/lib/booking-engine.functions.ts`) defaulting
    to `offset: false`, which rejects the valid offset-format ISO 8601 timestamps
    (`"...+00:00"`) that PostgREST legitimately returns for `timestamptz` columns/RPC results.
    Fixed at all three call sites (hold create, reschedule, walk-in) with `{ offset: true }`.
    Verified end-to-end locally (a real test booking was created and confirmed, then deleted).
  - **Guest form replaced with inline full sign-in (`src/routes/business.$businessSlug.tsx`
    step 4):** per explicit user instruction, the old plain guest name/phone/email form and its
    "Sign in instead" link to `/auth` (which was also the only path from the booking flow to the
    salon/staff signup links) were removed entirely. Step 4 now offers real authentication
    embedded directly in the page — phone OTP, email OTP, and Google/Apple OAuth, mirroring
    `/auth`'s own phone-first hierarchy — with no navigation away. Google/Apple necessarily
    bounce through the provider; the existing `pending-booking.ts` stash/restore mechanism
    (already used for the pre-existing "sign in from elsewhere" flow) carries the in-progress
    booking selection across that round trip. Also fixed a related latent bug surfaced while
    building this: `confirmBooking`'s mutation now branches on `hold.guestToken` presence rather
    than current `user` state, since a guest-owned hold must always confirm via the guest path
    even if the customer authenticates mid-flow — the previous `user`-based branch would have
    hit `UNAUTHORIZED_BOOKING` server-side the first time this sequence occurred for a real
    customer. Verified live on `www.dallty.com`: phone/email/Google/Apple options all render
    inline with no redirect; zero console errors.
- **Verified:** `tsc --noEmit` clean, `eslint .` clean (zero output), `npm run build` clean.
  Visually verified in the local dev server at mobile (375px) and tablet (834px) widths, in
  English, French-capable, and Arabic/RTL (confirmed correct mirroring and Clash Display
  rendering in Arabic too) — not the full 14-breakpoint matrix the brief lists (see Remaining
  Gaps). No Lovable references or production-facing `localhost`/`127.0.0.1` were introduced by
  this project (existing historical references in docs/comments from the prior vendor-migration
  project were left as-is — they're records of what was removed, not live dependencies).
- **Remaining gaps (explicitly not claimed complete):** Full typography hierarchy adoption
  across every heading (only the homepage hero and auth headline use the new `.text-h1`/
  `.text-display` utilities so far); the two remaining in-booking `/auth` links (waitlist
  sign-in, "sign in instead" at step 4) still navigate to the auth route rather than opening an
  in-context drawer — the forced/blocking redirect was fixed, these two are opt-in secondary
  paths only; iPad-specific split layouts (§9/§88/§95) beyond what standard `md:`/`lg:`
  breakpoints already provide; full booking-auth test matrix (§126) and low-network simulation
  testing (§130) against real test accounts; LCP/CLS/INP measurement; a dedicated loading state
  for the homepage's nearby-businesses section and the business-owner dashboard home; full
  14-breakpoint visual QA sweep. None of this was rushed to a false "done" — see the final
  report delivered in chat for the complete PASS/FAIL breakdown.
- **Documentation location:** This entry. No separate `DALLTY_UI_UX_SYSTEM.md` was created —
  the token/typography/glass/motion rules are self-documented as comments directly in
  `src/styles.css` (the single source of truth for all of it), which stays accurate by
  construction in a way a separate doc would drift from; this entry covers the narrative/
  decisions a code comment can't carry.
- **Git commit(s):** See `project-ui-ux-transformation` branch history.
- **Production status:** See git/deployment section of the final report delivered in chat.

#### Update — visual system refinement (branch `visual-system-refinement`, 2026-08-22)

A follow-up pass, scoped app-wide (not Super Admin — see the separate
`DALLTY_UI_UX_MASTER_SCHEMA.md` for that track), fixing the one thing this project's own
"Remaining gaps" didn't catch: the base canvas color was off the brand's own hue family. Used
the `frontend-design` and `ui-ux-pro-max` skills (the latter's `--design-system`/`--domain
color` searches, run against green/nature/premium reference palettes) to ground the fix in
palette science rather than eyeballed values.

- **Root finding:** `--background` (light mode) was oklch hue ~93° (a warm cream) while
  `--primary` (the brand green) is hue ~161° — two unrelated hues sharing a page. Every other
  brand/accent token was already correctly on- or near-family; the canvas was the one outlier.
- **Fixed:** `--background` now sits on the same hue family as `--primary` in both modes — a
  soft, low-chroma mint-tinted neutral in light mode (oklch(0.975 0.014 161)), a deliberate
  deep emerald in dark mode (oklch(0.16 0.026 164), not a desaturated near-black). `--card`
  changed to a warm near-white (not green-tinted) so translucent glass surfaces stay legible
  against the now-tinted canvas instead of muddying into it.
- **Added, all additive to the existing token set:** purpose-named brand-green states
  (`--primary-hover/-active/-light/-surface`, brief's "hover/active/disabled/subtle/surface"
  ask) so state changes stay visibly the same green family; a semantic status layer
  (`--color-success/-warning/-error/-info/-neutral`) decoupled from the brand-accent tokens it
  reuses; `--gradient-canvas` (light and dark), an opt-in, barely-there tonal gradient for
  hero/premium surfaces via a new `bg-gradient-canvas` utility — never applied to the page body
  itself; a `glass-highlight` utility (a single soft inset top-edge highlight, not a shine
  sweep) applied to the bottom nav and top nav, the two surfaces the brief calls out as primary
  glass elements; `--shadow-elevation-low/-medium/-high` aliases over the existing shadow scale.
- **Glass levels formalized** (Level 0 solid / Level 1 `.glass-soft` / Level 2 `.glass`),
  documented directly in `styles.css` — no new component needed, this was already the shape of
  the existing utilities, just given explicit names and a "use the lowest level that still
  works" rule. Audited `bottom-nav.tsx` and `site-nav.tsx` (already using `.glass` correctly,
  buttons already flat) — brought their hardcoded `z-40`/`z-50` in line with the `--z-nav`
  token and added the highlight; no other component changes were needed since color/typography/
  glass are all consumed via the shared tokens already.
- **Button tactile feedback:** `src/components/ui/button.tsx` gained `active:scale-[0.98]` —
  additive, respects the existing global `prefers-reduced-motion` rule, disabled buttons
  excluded.
- **Dark mode:** confirmed only wired up in the admin/business dashboard shell today —
  the customer-facing app has no dark-mode toggle. Per explicit product decision, this pass
  builds a genuinely coherent dark-mode token system (verified by toggling the `.dark` class
  directly, independent of any login) but does not add a customer-facing toggle — that would be
  a new feature, not a token refinement.
- **Verified:** `tsc --noEmit` clean, `eslint` clean on every changed file, `npm run build`
  clean. Visually verified in the local dev server at 390/430 (mobile), 768 (tablet), 1280/1440
  (desktop) on the homepage, auth, search, and a real business/booking page, in both light mode
  and (via direct `.dark` class toggle) dark mode — zero console errors, zero horizontal
  scroll, no broken cards. Booking flow (service selection step) confirmed still functional and
  visually consistent after the change.
- **Remaining gaps (explicitly not claimed complete):** this was a token-level, systemically-
  cascading change verified on a representative set of screens, not an exhaustive hand-audit of
  every page in the app (dozens of business-dashboard/admin/specialist pages were not
  individually opened this pass) — the brief's own "every major screen" QA list is broader than
  what one pass can exhaustively re-screenshot. RTL/Arabic was not re-verified this pass
  specifically (no token change should affect it, but it wasn't re-screenshotted). The
  pre-existing, previously-flagged excessive-request issue on the booking tab (documented
  above, still unresolved) was observed again during regression testing — confirmed unrelated
  to this pass (this pass is CSS-only; direct URL navigation to the same tab worked cleanly).
- **Documentation location:** This entry, plus the token rationale as comments directly in
  `src/styles.css` (same policy as the original project — the code stays the source of truth).
- **Git:** branch `visual-system-refinement`, off `main`. Not yet merged/deployed — see the
  final report delivered in chat for exact commit/deployment status.

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
