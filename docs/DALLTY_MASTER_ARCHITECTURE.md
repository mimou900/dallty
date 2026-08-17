# Dallty — Master Architecture

**Status:** Living document. Source of truth for all future implementation work.
**Produced by:** Project 00 (Master Architecture, Codebase Audit & Foundation).
**Updated by:** Project 01 (Database & Core Domain Foundation) — see §E and
`DALLTY_DATABASE_ARCHITECTURE.md` for what changed.
**Updated by:** Project 02 (Identity, Authentication & Account Foundation) — see §F/§G/§P
and `DALLTY_IDENTITY_ARCHITECTURE.md` for what changed.
**Updated by:** Project 03 (Security, Anti-Bot, Anti-Fraud, Anti-Scraping & Abuse Prevention
Foundation) — see §P and `DALLTY_SECURITY_THREAT_MODEL.md`/`DALLTY_SECURITY_ARCHITECTURE.md`.
Found and fixed the most serious issue across all four projects: a `bookings` RLS gap letting
any customer rewrite their own booking's `payment_status`/`total_price`/`staff_id` directly
via PostgREST, bypassing the app entirely — live-tested as both broken and then fixed.
**Last updated:** 2026-08-17.

This document is grounded in an actual audit of the codebase at
`C:\Users\ababs\OneDrive\Bureau\.lovable\Dallty` as it existed on 2026-08-17 — every
"current state" claim below was verified by reading code/migrations, not assumed. Where the
target architecture differs from the current state, both are stated explicitly and the gap
is tracked in `DALLTY_IMPLEMENTATION_ROADMAP.md`.

---

## A. Product vision

"Dallty is the digital storefront and booking infrastructure for appointment-based
businesses." Dallty gives appointment-based businesses (salons, barbershops, spas, nail
studios, gyms, clinics, and future categories) a public digital presence, booking system,
customer management, staff management, payments, marketing and marketplace exposure without
requiring them to build their own website.

Algeria is the launch market. The architecture is not Algeria-specific: every place the
current code hardcodes a Gulf-region or Algeria-only assumption is flagged below as
technical debt, not treated as acceptable permanent design.

Brand: **Dallty** (Latin), **دالّتي** (Arabic, never translated, used as a brand term only).
The existing uploaded logo is the visual source of truth (compact mark: `dallty-mark.png`;
full lockup: `dallty-wordmark.png`, both under `src/assets/`, served via Lovable's asset
manifest system) — it is not to be redesigned or replaced by future work.

## B. Technical principles

1. **The backend technical entity is always `Business`**, never a category-specific noun.
   This is already true in code (`businesses` table, post salon→business rename) — see §F.
2. **Frontend terminology may adapt per category**, backend never does.
3. **Server-side authorization is mandatory** for every mutation. A client-side check is a
   UX convenience, never the security boundary. Verified as the dominant real pattern in
   the current codebase (§F) — preserve it, don't regress it.
4. **Configuration over hardcoding** for anything that varies by country, language, plan,
   role, or business — but only build a configuration table when it has a real consumer.
   Don't pre-build country-config tables nobody reads yet (see §J).
5. **Additive, forward-only migrations.** Never edit a historical migration file. This is
   already the established convention in `supabase/migrations/` — every rename in this
   project's history (salon→business, customer→client, staff→specialist) was done as new
   migrations on top of old ones. Continue it.
6. **One Business application, role-based views** — not fragmented codebases per role. This
   is already true (`AdminShell` renders for owner/staff/platform-admin alike, branching
   internally) — preserve it.
7. **RTL and i18n are data-driven**, never `lang === "ar"` conditionals. Partially true
   today — see §K for the real gap.
8. **Don't build ahead of a consumer.** The existing reference-data and i18n work already
   follows this discipline (e.g. `emails`/`metadata` i18n namespaces are declared
   `"reserved"`, not built, until a feature needs them) — continue that discipline in every
   future project.

## C. Domain architecture

Canonical domain model (target — see per-table detail in §D and the current-state note after
each group):

**Identity:** User (Supabase Auth), Profile, Customer, Business Owner, Staff, Specialist,
Affiliate (not yet modeled), Super Admin.

**Business:** Business, Branch (not yet modeled — see §D), Business Owner Membership (not
yet modeled as a table — ownership is currently a single `owner_id` column, see §D),
Staff Membership, Specialist, Service, Business Category (many-to-many not yet modeled —
currently `businesses.categories text[]`, see §D), Business Location, Business Hours,
Business Policies.

**Booking:** Booking, Booking Item (not modeled — bookings are single-service today),
Booking Hold (not modeled — no hold concept exists), Availability (computed via
`get_available_slots`), Confirmation (conflated into `booking_status`, not separate — see
§M), Reschedule, Cancellation, No Show (not a real persisted state — see §M), Waitlist
(modeled), Walk-in (modeled via staff-desk booking creation).

**Financial:** Subscription (plan is a column on `businesses`, not a real subscription
entity), Plan, Invoice (not modeled), Payment (not modeled — see §N), Deposit (columns exist,
not enforced), Refund (not modeled), Dallty Balance (not modeled), Credit (not modeled),
Points (not modeled), Staff Payout (not modeled), Commission (not modeled), Tip (not
modeled), Discount, Coupon (modeled as `promotions`).

**Marketplace:** Search (modeled, client-side filtering), Ranking (not modeled), Sponsored
Placement (not modeled), Featured Business (not modeled), Business Visibility
(`marketplace_status` modeled), Reviews (modeled), Ratings (modeled, trigger-computed),
Verification (`is_verified` modeled).

**Affiliate:** Not modeled at all. No `affiliate` role, no referral/attribution tables exist.

**Platform:** Country (modeled), Currency (modeled), Language (modeled via i18n runtime, not
a DB table), Administrative Level/Region (modeled as `regions`/`cities`), Category (modeled),
Feature Flag (not modeled), Plan (column only), Permission (not modeled — see §G), Role
(modeled as `app_role` enum), Audit Log (modeled, `admin_audit_log`), Notification Template
(modeled via `src/lib/email-templates/`), CMS Content (not modeled).

## D. Application architecture

TanStack Start (file-based routing, SSR), React 19, TypeScript, Supabase (Postgres + Auth +
Storage + Realtime), Tailwind v4, shadcn/ui. Deployed via **Lovable Cloud** (confirmed by
`AGENTS.md`'s warning about git history syncing back to the Lovable editor, the
`@lovable.dev/*` SDK dependencies, and Nitro's Cloudflare-Workers-by-default build target in
`vite.config.ts`) — not a self-managed Vercel/Netlify/AWS deployment.

**Route structure (verified):**
- Public marketplace: `/`, `/search`, `/business/$businessSlug` (canonical), plus legacy
  redirect shims at `/business-id/$businessId` and `/salon/$salonId` (both 301 to the
  canonical slug URL).
- Auth: `/auth`, `/reset-password`, `/verify-otp`, `/business/signup`, `/staff/signup`.
- Customer (`/_authenticated/*`, gated by a real `beforeLoad` auth check): `/bookings`,
  `/favorites`, `/profile`, `/reschedule/$bookingId`.
- Business/staff dashboard (`/_authenticated/admin/*`, one shared `AdminShell` component,
  gated **client-side only** — see §P for the resulting risk): dashboard home, calendar,
  appointments, my-appointments (staff self-service), availability, customers (CRM),
  services, staff, reviews, payments, reports, marketplace, notifications, settings.
- Platform/Super Admin (`/_authenticated/admin/platform/*`, same client-side-only gating
  pattern): overview, businesses, marketplace, users, directory, categories, countries,
  reserved-slugs, auth-policies.
- `/lovable/*`: Lovable platform infrastructure (auth email webhook, transactional email
  preview) — not a Dallty product surface.

**Known architectural debt in the route tree (verified, not inferred):**
- `/_authenticated/dashboard.tsx` is a fully-built, orphaned business-analytics page,
  unreferenced anywhere in the app's nav, functionally duplicating `/admin` + `/admin/reports`.
  Candidate for removal.
- No route under `/admin/*` or `/admin/platform/*` has a `beforeLoad`/`loader`-level role
  guard — every one of the 22 files gates access inside the component body after data has
  already begun fetching (`enabled: isSuper`-style query gating prevents data leakage, but
  the page shell itself briefly mounts for any authenticated user).

## E. Database architecture

See `DALLTY_DATABASE_ARCHITECTURE.md` (Project 01) for full entity-relationship detail. This
section states only the current-state summary and the architectural rules that govern it.

**Project 01 update (2026-08-17):** the membership, category-join, branch, permission, and
soft-deletion gaps flagged below are now closed at the schema level — `business_memberships`
+ `platform_roles` (extending, not replacing, `owner_id`), `business_categories`,
`business_branches`, `permissions` + `role_permissions`, and `deleted_at` on
Business/Service/Staff/Customer profile all exist now. None of them are wired into
application-level enforcement yet (existing `hasRole()`/`owns_business()`/
`assertCanManageBusiness` continue to be the real authorization mechanism, extended
additively, not replaced) — that wiring is future-project work. The critical live bug below
(stale `salons` references in booking triggers) is also fixed as of this update.

**Current tables (verified, post all 60 migrations as of 2026-08-17):** `profiles`,
`user_roles`, `businesses`, `services`, `staff`, `staff_schedules`, `staff_day_hours`,
`staff_breaks`, `staff_time_off`, `staff_services`, `staff_join_requests`, `bookings`,
`promotions`, `waitlist_entries`, `notifications`, `favorites`, `recently_viewed`,
`reviews`, `review_reports`, `business_gallery`, `business_hours`, `admin_audit_log`,
`currencies`, `countries`, `categories`, `regions`, `cities`, `reserved_slugs`,
`business_slug_redirects`, `auth_otp_codes`, `auth_settings`, `auth_role_policies`,
`auth_login_attempts`. All 35 tables ever created have RLS enabled (verified: no gap between
`CREATE TABLE` count and `ENABLE ROW LEVEL SECURITY` count).

**Rules for all future schema work (binding on Project 01 onward):**
- Ownership must not remain a bare `businesses.owner_id` column once multi-owner support is
  needed — a membership table is required (Project 01's job).
- `businesses.categories text[]` must migrate to a proper many-to-many
  `business_categories` join table against the existing `categories` table — the array
  column is a stopgap, not the target design.
- `businesses.country_code`/`currency`/`timezone` are currently **plain free-text columns**,
  not foreign keys into `countries`/`currencies` — this is unfinished integration from the
  reference-data project and must be closed, not left as permanent design.
- No "branch"/multi-location entity exists (`branch_count` is cosmetic metadata only) — a
  business with multiple physical locations today must be modeled as multiple separate
  `businesses` rows. This is the single biggest gap between current schema and the target
  domain model in §C.
- Two status concepts on `businesses` currently coexist: legacy `status business_status`
  and `marketplace_status marketplace_status` (the one that actually gates public
  visibility). Do not add a third; converge on the four-axis model in §M/§H once a project
  touches this.

**Critical live defect — FIXED in Project 01 (`20260817100000_fix_stale_business_rename_references.sql`):**
three trigger functions bound to `bookings` (`notify_on_booking_change`,
`notify_waitlist_on_free_slot`, and the `notify_booking_audience` helper they call), plus
`get_staff_day_availability`, referenced the pre-rename `salons`/`salon_id` names. Because
the trigger functions fire unconditionally on booking cancellation/reschedule, those
operations were very likely erroring in production before this fix. All four now reference
`businesses`/`business_id` correctly; no signature, grant, or trigger-binding changes were
needed. Not yet verified end-to-end against a real booking cancellation (the live database
has no bookings to test with as of this update) — recommended as a smoke test once real
booking data exists.

## F. Authentication architecture

**Current state (verified, not aspirational):** Supabase Auth is the actual identity
provider. `@lovable.dev/cloud-auth-js` supplies only the OAuth leg (currently feature-flagged
off) and hands Supabase-compatible tokens back into the same Supabase client — there is no
separate Lovable-hosted user store. Email+password is the live sign-in path; magic-link and
phone-OTP handlers exist and are wired but hidden behind a `SHOW_ALT_METHODS` flag.

A custom **email-OTP step-up engine** (`auth_otp_codes`, `auth_settings`,
`auth_role_policies` tables; `src/lib/otp.server.ts`) sits on top of Supabase Auth for
`business_owner`/`admin`/`super_admin` roles by default (Super-Admin-configurable per role).
Codes are HMAC-hashed, never stored plaintext, compared with constant-time equality.

**FIXED in Project 02:** the OTP step-up gap described above (client-redirect-only
enforcement) is closed at the server-function layer — see `DALLTY_IDENTITY_ARCHITECTURE.md`
"OTP model" for full detail. `assertSuperAdmin`/`assertCanManageBusiness` (the two
authorization chokepoints essentially every privileged server function funnels through) now
verify step-up completion against a session-correlated table
(`auth_step_up_sessions`) before allowing the action. A documented, deliberate residual gap
remains at the RLS layer for direct-from-browser table mutations in `src/lib/admin.ts` —
see the identity doc for why it wasn't also closed there this pass.

Session storage: Supabase's own `localStorage` session object; "remember me" is implemented
as an ephemeral-session guard that clears the token on tab close when off, not a different
storage backend. CSRF middleware is explicitly re-installed (defining `start.ts` opts the
app out of the framework default, and the codebase correctly re-adds it).

**Rule for all future work:** authentication mechanism is Supabase Auth + this OTP
step-up layer. Do not introduce a second auth system, a second session store, or a second
OTP mechanism. Fix the step-up enforcement gap; don't route around it.

## G. Authorization architecture

**Current state (verified):** role is `app_role` enum — `client`, `business_owner`,
`specialist`, `admin`, `super_admin` (no `affiliate` role exists yet). Every sampled
mutating server function (7 checked in the audit, covering slug changes, user
suspension/deletion, business status/marketplace changes, business settings, staff
invites, staff-desk bookings, business registration) enforces authorization **server-side**,
independent of anything the client asserts — via `assertCanManageBusiness`/
`assertSuperAdmin` helpers that call `SECURITY DEFINER` Postgres RPCs
(`owns_business`, `is_platform_admin`, `is_super_admin`) keyed off the JWT-verified user id,
never a client-supplied id. `hasRole()` on the client is used consistently for UI/routing
decisions only, never as the sole gate on a mutation.

**Target architecture (not yet built — this is Project 01+ work):** Role + Permission +
Business Scope + Country Scope, as specified in the original Project 00 brief (§18–20 of
that brief). Today's system is **role-only**, with the role→capability mapping implicit in
each server function's own logic, not a queryable `permissions`/`role_permissions` table.
Building the explicit permission/scope model is required before "Owners can create custom
staff roles from Super-Admin-approved permissions" (multi-owner protection workflow) can be
implemented — do not build that workflow on top of the current role-only system; it needs
the permission/scope foundation first.

**Multi-tenancy enforcement (verified real, not just designed):** RLS is the actual
backstop even where client code issues raw table mutations directly from the browser
(`src/lib/admin.ts` does this for services/staff/payment-status). `owns_business()`/
`is_business_staff()` are `SECURITY DEFINER` functions checked inside RLS policies
independent of what the client-side query logic decided to request. This pattern must be
preserved by every future table: **RLS is not optional "defense in depth" here, it is the
actual enforcement layer**, given how much client code talks to Postgres directly through
PostgREST.

## H. Multi-tenancy architecture

A business's data is isolated by `business_id`/`owner_id` foreign keys plus RLS policies
built on `owns_business(auth.uid(), business_id)` / `is_business_staff(auth.uid(), staff_id)`.
This is verified working for the current single-owner-column model. It must be re-derived,
not assumed to still work unchanged, once §G's membership-table work lands — `owns_business`
currently reads `businesses.owner_id` directly; a membership table means this function (and
every RLS policy built on it) needs a rewrite to check membership rows instead, not an
additional parallel check bolted on.

## I. International architecture

Country → supported languages, currency, timezone, administrative hierarchy, categories,
plans, payment methods, taxes, commissions, affiliate rules, WhatsApp rules, deposit rules,
feature flags, SEO configuration — this is the target. **Current state:** only currency,
timezone (partially, via free-text columns not FKs — see §E), and administrative hierarchy
(`regions`/`cities`, generic, not Algeria-specific — already done correctly) exist as
country-scoped data today. The rest (plans, payment methods, taxes, commissions, affiliate
rules, WhatsApp/deposit rules, feature flags, SEO config) have no country-scoping mechanism
yet because none of those subsystems exist yet either (see §M–T). Do not build the
country-config table for a subsystem before that subsystem itself is being built — this
repeats the reference-data project's own "build only what has a consumer" discipline.

**Confirmed clean:** no `if country === "DZ"` (or equivalent) hardcoding exists anywhere in
`src/` today. Country-specific behavior is correctly data-driven where it exists at all.

**Project 04 update (2026-08-17):** `countries.marketplace_enabled` now exists, distinct
from `active` — Algeria is the only marketplace-enabled country, enforced server-side in the
public business-read RLS policy (live-tested). `administrative_levels` provides per-country
labels for the existing (still fixed-2-level) `regions`/`cities` hierarchy. Business country
is now immutable post-creation for non-admins (guard trigger, live-tested). A real
French-locale money/date-formatting bug (silently falling back to English on every call site,
since none passed the locale param) was found and fixed. Full detail in
`DALLTY_INTERNATIONAL_ARCHITECTURE.md`.

## J. Country configuration architecture

See §I. No dedicated `country_settings`/`country_features` table exists yet — this is
correct for the current stage (no subsystem depends on it yet), not a gap to close
immediately. When Project 09 (Payments) or later projects need country-scoped behavior,
build the minimal table that subsystem needs; do not pre-build a generic settings blob now.

## K. Localization architecture

**Current state (verified — more built than the internal spec docs' own "current state"
framing suggested when they were written):** the namespaced i18n runtime described in
`docs/superpowers/specs/2026-08-14-core-i18n-runtime-design.md` is **fully built and is the
active system**: `src/lib/i18n/namespaces.ts` (16 active namespaces + 2 reserved),
`loader.ts` (Vite `import.meta.glob`-backed, zero network fetch), `hooks.ts`
(`useTranslation()`), `keys.gen.ts` (compile-time key safety), used across 14+ files.
`locales/{en,fr,ar}/*.json` exist for all 16 active namespaces.

**Verified gap:** the legacy `src/lib/dallty-content.ts` bilingual `copy` object is **not
fully retired**. It still (a) supplies the shared `Lang` type that `src/lib/i18n.tsx` imports
rather than owning, and (b) exports a hardcoded 4-business demo dataset with **stale
Gulf-region content** ("Al Olaya", "Jumeirah") and **no French branch at all** — still
rendered as a fallback on the live homepage (`(liveBusinesses ?? businesses)` in
`src/routes/index.tsx`). Every `lang === "ar" ? x.ar : x.en` hardcoded ternary in the
codebase (5 confirmed sites) exists specifically to consume this legacy shape. `formatMoney`/
`formatInTimezone` in `src/lib/countries.ts` also silently fall back to English `Intl`
locale formatting for French. **Closing this gap (migrate the last consumers off
`dallty-content.ts`, delete it, add real French demo/fallback content, fix the `Intl` locale
selection) is higher priority than building anything new in localization** — it's a finishing
task on already-built infrastructure, not new scope.

Locale is carried as a `?lang=` query parameter today (`localizedPath()`), not a path prefix
— this is Project 3 of the localization program (Locale-Prefixed Routing) and is correctly
not yet built. Do not build locale-prefixed SEO features (sitemaps, `/dz/fr/...` URLs) on
top of query-param locale — that program's own sequencing (Business Slugs → Core i18n
Runtime → Locale-Prefixed Routing → Translation Manager → SEO → Build-Time Guardrails) must
be respected; SEO is Project 5 of that program for a reason.

## L. SEO architecture

**Current state (verified):** real, working meta tags via TanStack Start's route `head()`
option across 37 route files; real canonical + hreflang (`en`/`fr`/`ar` + `x-default`)
emitted from `__root.tsx`; `robots.txt` exists (allows all major crawlers, no `Sitemap:`
directive). **Not built at all:** sitemap/sitemap-index, JSON-LD structured data,
locale-prefixed URLs. This matches the localization program's own sequencing — SEO is
explicitly downstream of Locale-Prefixed Routing and the Translation Manager. Do not build
sitemap generation before locale-prefixed routing exists; the URL shape it needs to enumerate
doesn't exist yet.

The general international-SEO target (`/dz/fr/constantine/hair-salons` style URLs, SEO
candidate recalculation on inventory change, NOINDEX↔INDEXABLE transitions) from the
original Project 00 brief remains the target for the eventual SEO project — nothing here
contradicts it, it's simply not started.

## M. Booking architecture

**Current state (verified, not the aspirational three-independent-enum model):**
`booking_status` (`pending`/`confirmed`/`completed`/`cancelled`) and `payment_status`
(`unpaid`/`paid`/`refunded`) are separate enums, but there is **no third
`confirmation_status` enum** — confirmation is conflated into `booking_status`
(`pending` = awaiting confirmation). No `HELD`, `IN_PROGRESS`, real `NO_SHOW`, or `EXPIRED`
states exist; "no-show" is a client-only UI inference (`pending` + past start time), never a
persisted fact.

**FIXED in Project 05 — the single most important correctness gap in the whole
codebase.** `bookings_no_overlap` is now a real `EXCLUDE USING gist` constraint
(`staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&`), replacing the old
exact-start-time-only unique index. **Live-tested, not assumed**: 20 concurrent overlapping
requests for one staff member → exactly 1 succeeded; 30 concurrent requests across 3 staff
for the same slot → exactly 3 succeeded (1 per staff), capacity correctly respected. Full
detail and reproducible test results in `DALLTY_BOOKING_ENGINE.md`. `held`/`expired`/
`no_show` were added to `booking_status`; a hold is a `bookings` row with `status='held'`
(not a second table), so the same constraint protects holds, bookings, and their
interaction uniformly. `confirmation_status` (phone/manual confirmation tracking) remains
unbuilt, unchanged from before — not this project's focus.

Per-staff price/duration overrides (`staff_services.custom_price`/`custom_duration_minutes`)
were genuinely dead — confirmed by earlier audits — and are now the first tier actually
consumed by the new `createBookingHold` server function. `get_available_slots` was also
fixed to read `businesses.slot_interval_minutes`/`min_notice_hours` (both existed, neither
was ever read) instead of a hardcoded 30-minute step with no notice enforcement, and now
reserves a business/service-resolved buffer after each slot.

**V1 rule preserved:** one specialist per booking, matching the original brief's
recommendation — the current schema and every booking-creation path already assumes this;
no multi-specialist booking code exists to accidentally regress.

## N. Payment architecture

**Still true after Project 06: no payment GATEWAY integration exists** — zero provider
credentials exist anywhere in this project's environment, and none was faked. What Project
06 built instead, real and live-tested: the three-layer booking/payment/ledger model, an
immutable double-entry financial ledger (`ledger_transactions`, UPDATE/DELETE blocked even
for the service-role client, verified by direct attack), cash payment settlement with full
overage/underage reconciliation (`markCashPayment`, superseding the old raw `paid`/`unpaid`
toggle), commission calculation, staff-earning accrual, refunds (owner/admin-only,
verified), and a provider-agnostic `PaymentProvider` interface ready for a real adapter the
moment credentials exist. `deposit_percent`/`require_deposit` are now actually read (server-
side deposit calculation), though online deposit *collection* remains blocked on a real
provider. Full detail in `DALLTY_FINANCIAL_ARCHITECTURE.md`. Dallty Balance, staff payout
*disbursement* (the accrual side is real; recording an actual payout isn't wired up), and
country-scoped payment-method *activation* beyond cash remain unstarted/PLANNED.

## O. Marketplace architecture

**Updated by Project 08, 2026-08-17 — see `DALLTY_MARKETPLACE_ARCHITECTURE.md` for full
detail.** A real, server-side, rate-limited, cursor-paginated, ranked search function
(`search_businesses_page`) now exists, live-tested for country isolation, visibility
enforcement (approval/verification/active — independent of the separate, narrower
`is_listed` "has anything bookable" signal), anti-enumeration (hard 50-row server-side cap,
never client-trusted), and RLS-equivalent privacy (identical results whether called as
service-role or anonymous). Reviews/favorites/verification remain exactly as they were
(all real, all reused, not rebuilt) — Project 08's one real bug fix was `BusinessCard`'s
favorite heart icon, previously local-state-only and non-persisted despite a fully working
`favorites` table + `FavoriteButton` component already existing elsewhere in the app.
Ranking is organic-only, with a documented (not built) sponsorship-merge extension point.
Two real, pre-existing data-model duplications were found and documented rather than
silently fixed: `businesses.status` (dead, superseded by `marketplace_status`), and three
parallel "what kind of business is this" fields (`categories text[]`, the unused
`business_categories` join table, and `business_type`). Branch-level location search remains
out of scope — `business_branches` stays unpopulated/unwired, unchanged from Projects 01/05.

## P. Security architecture

Verified-real protections: RLS as actual enforcement (not just defense-in-depth, per §G);
server-side JWT validation via `getClaims()` (not trusting a client-supplied user id);
consistent server-side ownership/role re-derivation in every sampled mutating server
function; HMAC-hashed OTP codes with constant-time comparison; a 24h-supply-chain-attack
guard in `bunfig.toml` blocking freshly-published package versions.

**Status after Project 02 (fixed / still open — was "Verified gaps, in priority order"):**
1. ~~OTP step-up is client-side-only enforcement~~ **FIXED in Project 02** — see §F and
   `DALLTY_IDENTITY_ARCHITECTURE.md`. A documented residual gap remains at the RLS layer for
   direct-from-browser mutations in `src/lib/admin.ts`; not silently closed-in-name-only.
2. **Still open.** Login brute-force throttle remains orchestrated by application code
   around `signInWithPassword`, not enforced inside Supabase Auth itself. Investigated in
   Project 02 via the Supabase Management API (reachable now with a project access token):
   the project's own configurable rate limits don't map cleanly onto password-grant brute
   force specifically, and CAPTCHA (hCaptcha) is supported but currently disabled
   (`security_captcha_enabled: false`) — enabling it needs a real site/secret key and is a
   product decision, not made unilaterally here.
3. **Mostly fixed in Project 02.** `checkEmailHasAccount`/`checkPhoneHasAccount`/
   `checkSignupPassword`/`createGuestBooking` are now rate-limited per-IP via a new generic
   `check_rate_limit` RPC. CAPTCHA remains the recommended deeper mitigation, not enabled.
4. No general API/server-function rate-limiting middleware exists — Project 02 added a
   reusable, generic rate limiter (`src/lib/rate-limit.server.ts`) rather than a fourth
   purpose-built one; it's opt-in per endpoint, not a blanket middleware.
5. No WAF/DDoS/bot-protection/anti-scraping exists at the application layer (expected — this
   is normally an edge/CDN concern, and the deployment target is Lovable Cloud's platform;
   confirm what's provided there before building app-layer equivalents). Project 03 added a
   provider-agnostic bot-challenge abstraction (`src/lib/bot-challenge.server.ts`) using a
   real rate-limit-consumption signal, but no CAPTCHA provider is configured, so nothing
   currently blocks on its result.

**Project 03 additionally found and fixed (see `DALLTY_SECURITY_THREAT_MODEL.md` for full
detail):**
6. **CRITICAL, now fixed** — `bookings`' UPDATE RLS policy checked only row ownership, not
   which columns changed. A customer could PATCH `payment_status`/`total_price`/`staff_id`/
   `business_id` on their own booking directly via PostgREST. Fixed with a guard trigger,
   live-tested (attack now blocked, legitimate flows unaffected).
7. Upload validation was 100% client-side, trivially bypassed — fixed via Storage
   bucket-level `file_size_limit`/`allowed_mime_types`, live-tested.
8. Public `/search` had no row-count bound at all — fixed with a stopgap `.limit(500)`.
9. Raw Postgres error messages reached the client via ~50+ server-function call sites —
   fixed for the 4 customer/anonymous-facing files (24 call sites); ~10 Super-Admin-only
   files left as a documented, lower-priority remainder.
10. No security headers existed anywhere — added CSP/HSTS/X-Frame-Options/etc., verified
    against real browser console errors (not assumed safe) before trusting the change.

Item #2 (login-throttle bypass) remains the highest-priority open security item across all
four projects — should be treated as a pre-launch blocker regardless of roadmap position.

## Q. Notification architecture

**Updated by Project 07, 2026-08-17 — see `DALLTY_NOTIFICATION_ARCHITECTURE.md` for full
detail.** In-app notifications remain the pre-existing realtime path, now carrying
`deep_link`/`business_id`/`category` and clickable in the notification center. A real
domain-event/outbox layer (`notification_outbox`, `notification_deliveries`) now drives the
async channels off booking/payment events, dispatched by `processNotificationOutbox()`
(claim via `FOR UPDATE SKIP LOCKED`, retry with exponential backoff, per-attempt delivery
history). The `emails` i18n namespace is **active** (its reserved consumer arrived) — one
generic, i18n-rendered template covers 14 booking/payment event types in en/fr/ar; the 10
pre-existing auth/account templates remain hardcoded English, deliberately untouched.
Reminders (24h/1h/15m, business-configurable) are generated by a real `pg_cron` job running
every minute — `pg_cron`/`pg_net` were confirmed available and enabled on this Supabase
project. Push/WhatsApp/SMS are architecture-ready (provider interfaces, `device_tokens`
schema) with zero real providers configured, matching this session's established honesty
about unconfirmed integrations. A real bug (every reschedule silently sent a spurious
"booking cancelled" notification) was found and fixed while wiring this project.

## R. CMS architecture

Not built. Super Admin today can manage reference data (categories, countries, currencies
read-only, reserved slugs) and business approval/verification/user management — real content
management (homepage, banners, legal pages, help center, blog) does not exist. Nothing here
contradicts the original brief's eventual CMS scope; it's simply unstarted and correctly
deferred.

## S. Mobile architecture

Not built, not started. No React Native/Capacitor scaffold exists. Deferred per the original
brief's own sequencing (mobile apps come after the web platform is stable).

## T. Observability architecture

Not built. No error-monitoring SDK, no APM, no uptime monitoring found in dependencies or
config. `admin_audit_log` exists and is a real (if minimal) foundation for platform audit
history — append-only in practice (no UPDATE/DELETE RLS policy exists for it, which is the
safe default, not a gap). A Platform Health/Security Center for Super Admin does not exist.

## U. Deployment architecture

**Verified:** Lovable Cloud is the deployment target (commits to the connected branch sync
back into the Lovable editor per `AGENTS.md`). Build tooling is `@lovable.dev/vite-tanstack-
config` wrapping Vite + Nitro, Nitro defaulting to a Cloudflare Workers build target. No
`wrangler.toml`/`netlify.toml`/`vercel.json` exists — deployment is Lovable's own pipeline,
not a directly-managed cloud account. **No CI configuration exists anywhere in the repo**
(no `.github/workflows` at any level) — lint/typecheck/build are manual scripts only
(`npm run lint`, `build`, no `test` script exists at all). Closing this gap (at minimum a
CI check running lint + typecheck + build on every push) is recommended before the codebase
grows much further, and is tracked in the roadmap.

## V. Scalability principles

No scalability work has been done or is needed yet at current data volumes (verified: single
digits to low tens of rows per table in the live database prior to the Project 00 data
clear). The schema decisions most likely to need revisiting at scale: (1) `businesses`
having ~75 columns accreted in layers — a candidate for splitting into
`businesses`/`business_profile`/`business_settings` once the table becomes unwieldy to
query/index; (2) client code issuing raw table mutations directly from the browser
(`src/lib/admin.ts`) rather than through server functions — fine at current scale where RLS
is the real backstop, but worth revisiting if query patterns need caching/rate-limiting that
only a server function can add; (3) no sitemap/pagination strategy exists yet for
marketplace search at scale (see §L, correctly deferred).

## W. Future extensibility

The domain model in §C is intentionally broader than what's built today. The rule for every
future project: extend by adding new tables/columns/enums that reference the existing
identity/business/booking spine, never by duplicating a concept that already exists (see
`DALLTY_AI_IMPLEMENTATION_RULES.md`). The membership-table work in Project 01 is the single
highest-leverage extensibility fix available right now — nearly every future capability
(multi-owner protection, custom staff roles, permission/scope authorization, branches) is
blocked on it existing first.
