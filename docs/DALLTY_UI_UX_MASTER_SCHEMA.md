# Dallty — Super Admin UI/UX Master Schema

**Status:** Living document. Produced by Phase 00 (Super Admin UI/UX Transformation — Audit
Only), 2026-08-22. HEAD at time of audit: `105056e`.
**Read this first:** this document is split into two kinds of statement, and every claim in
it is labeled as one or the other:

- **VERIFIED CURRENT STATE** — confirmed by reading actual route/component code, live
  production database schema/RLS/grants (via the Supabase Management API, read-only), and
  `git log`/`git branch` history. Not inferred from other docs.
- **PROPOSED FUTURE STATE** — a recommendation for a later implementation phase. Nothing
  under this heading has been built. No code, database, or design-token change was made while
  producing this document.

This document does not restate everything the existing `docs/DALLTY_*.md` files already cover
well (database schema, financial ledger mechanics, booking engine, notifications, i18n). It
focuses on what those docs don't: the Super Admin's actual UI surface, its component/design
foundation, and the gap between what several docs *claim* about current state and what is
*actually* deployed — see §0.

---

## 0. Documentation vs. reality — discrepancies found this phase

Read in full this phase: all 15 existing `docs/DALLTY_*.md` files. Compared against live
production database state (Supabase Management API, read-only SQL), `git log main`, and direct
reads of the actual route/component/server-function code. Documentation is not treated as
authoritative where it disagrees with verified reality — every discrepancy below states which
side was verified true.

1. **`DALLTY_DATABASE_CHANGELOG.md` and `DALLTY_FINANCIAL_ARCHITECTURE.md` both claim Project
   12 (financial ledger extensions: payouts, deposits, reconciliation, affiliates) and Project
   13 (subscriptions/billing) are "not yet merged to `main`."** VERIFIED FALSE: `git
   merge-base --is-ancestor origin/project-12-financial-ledger origin/main` and the same check
   for `project-13-subscriptions` both return true. The specific security-fix commits these
   docs describe (`a07c53d`, `ac16f1e`, `bc1ee85`) are direct ancestors of `main`'s current
   HEAD. The live production `has_permission()` function and `business_subscriptions` RLS
   policy both match the Project 13 code exactly (confirmed via `pg_get_functiondef` against
   the live database, not the migration file). **Both projects are deployed and live.** This
   is the safer direction of error (docs understate what's shipped, not overstate it), but it
   means these two docs cannot be trusted for "is X live" without independent verification.
2. **`DALLTY_MASTER_ARCHITECTURE.md`'s PROJECT STATUS table has no entry for Project 14, the
   UI/UX transformation project, or the two post-report fixes documented at the end of its own
   Project 16 entry.** Git shows real, merged, production commits for all of these
   (`61eeb84`/`0797414`/`71e8371` — Project 14 marketplace/SEO; `09560e1`/`8683cdf` — the
   UI/UX transformation; `bb0b924`/`105056e` — the datetime-confirmation-bug and inline-auth
   fixes). The master doc's own status table — its single source of truth for "what's been
   built" — is missing at least two full projects' worth of shipped code.
3. **`DALLTY_MASTER_ARCHITECTURE.md` §17 states "Affiliate architecture: Not built at all... no
   referral/attribution table exists."** VERIFIED FALSE for the feature as a whole:
   `affiliates`, `affiliate_commission_rules`, `affiliate_referrals`, and `business_referrals`
   tables all exist live in production, built by Project 12. (Narrowly true only in that the
   `app_role` enum itself has no `affiliate` value — that specific detail checks out, but the
   section's headline claim does not.)
4. **`DALLTY_FINANCIAL_ARCHITECTURE.md`'s claim that `ledger_transactions` has "no UPDATE/DELETE
   grant to any role, including `service_role`"** is false at the grant level, verified via a
   live query against `information_schema.role_table_grants`: `service_role` (and, via a
   project-wide `ALTER DEFAULT PRIVILEGES` setting, `anon`/`authenticated`/`postgres` too)
   currently hold UPDATE/DELETE grants on `ledger_transactions` in production. **The ledger is
   not actually mutable today** — RLS has no UPDATE/DELETE policy for `anon`/`authenticated`
   (default-deny), and the `forbid_ledger_mutation` trigger blocks `service_role`/`postgres`,
   which bypass RLS — but the doc's specific "two independent layers, no grant exists" framing
   overstates what's independent. Only the trigger is real; the grant-level layer was defeated
   by the very next line of its own founding migration. Practical risk today: low (the trigger
   holds), but the documentation is factually wrong about the mechanism, and a future migration
   that touches this table without knowing the trigger is the *only* backstop would be riskier
   than the doc implies.
5. **`DALLTY_SECURITY_ARCHITECTURE.md`/`DALLTY_SECURITY_THREAT_MODEL.md` list "~10 remaining
   Super-Admin-only files leaking raw Postgres error text" as a known, open gap.** VERIFIED
   FALSE today: zero occurrences of that pattern remain in `src/lib/*.functions.ts`;
   `sanitizeDbError()` is used pervasively (12 call sites in `platform.functions.ts` alone).
   This gap appears to have been closed incidentally while building later projects, without any
   doc being updated — the inverse kind of staleness from findings 1-3 (docs report a *worse*
   state than reality).
6. **`DALLTY_DEPLOYMENT.md` states "No environment variables are configured on the Vercel
   project," lists Preview/Production as "Unconfirmed," and says the health check "was not
   performed this session — no deployed production URL was reachable."** VERIFIED STALE:
   production at `https://www.dallty.com` is live today, serving real Supabase-backed traffic
   — confirmed directly in the session that produced the Project 16 datetime-bug fix (a real
   test booking was created and confirmed against production, then cleaned up). This doc was
   never updated after Vercel env vars were actually set.
7. **The previously-flagged scope-based permission vulnerability is FIXED and live in
   production**, not merely "found." Original bug: `has_permission()`'s `scope = 'self'` branch
   was a complete no-op (treated identically to `'business'`/`'global'`), live-exploitable via
   `assertBookingAction`/`rescheduleBooking`'s "any staff at this business" fallback — any
   specialist could act on another specialist's bookings, and could view another specialist's
   payout amounts. Fix commit `a07c53d`, migration
   `20260822010000_project13_has_permission_scope_fix.sql`, confirmed present in the live
   database's actual function body (not just the migration file) and confirmed a direct
   ancestor of `main`'s current HEAD. **No further action needed on this specific issue** — it
   is resolved, not merely mitigated.
8. **`DALLTY_DATABASE_ARCHITECTURE.md`'s row counts (0 for every Project 01 table) and
   "93 migration files"** reflect its own 2026-08-17 dateline against a now-115-file, populated
   production database. Expected/honest staleness (the doc says what was true when written),
   not an error — flagged for completeness since Phase 00's brief asks for every discrepancy.

**Not found as a discrepancy, worth stating plainly:** the core claims that matter most for
this Super Admin project — the role/permission model, RLS being genuinely load-bearing, the
booking-engine concurrency guarantees, the notification/reminder architecture — all checked out
against live code and the live database. The stale items above are about *deployment status*
and a couple of *specific mechanism claims*, not about the architecture being fictional.

---

## 1. Super Admin route map — VERIFIED CURRENT STATE

The "Super Admin" and the business-owner-facing admin dashboard **share one route directory**
(`src/routes/_authenticated/admin/`) and **one shell component**
(`src/components/admin/admin-shell.tsx`), gated by role inside the same layout. They are not
separate apps.

**Layout:** `src/routes/_authenticated/admin/route.tsx` (110 lines).

**Super Admin ("Platform") routes** — 12 files, all under `src/routes/_authenticated/admin/platform/`:

| Route | File |
|---|---|
| `/admin/platform/overview` | `overview.tsx` |
| `/admin/platform/directory` | `directory.tsx` |
| `/admin/platform/businesses` | `businesses.tsx` |
| `/admin/platform/marketplace` | `marketplace.tsx` |
| `/admin/platform/users` | `users.tsx` |
| `/admin/platform/categories` | `categories.tsx` |
| `/admin/platform/reserved-slugs` | `reserved-slugs.tsx` |
| `/admin/platform/email-domains` | `email-domains.tsx` |
| `/admin/platform/countries` | `countries.tsx` |
| `/admin/platform/auth-policies` | `auth-policies.tsx` |
| `/admin/platform/reconciliation` | `reconciliation.tsx` |
| `/admin/platform/subscription-plans` | `subscription-plans.tsx` |

**Business-owner/staff admin routes** (top level of `admin/`, NOT Super Admin — listed here
only to mark the boundary clearly, since the brief's file list initially grouped them together):
`index.tsx` (dashboard), `marketplace.tsx` (owner's own listing status — note the name
collision with `platform/marketplace.tsx`, which is the *approval queue*; these are two
different pages for two different roles), `services.tsx`, `staff.tsx`, `customers.tsx`,
`appointments.tsx`, `calendar.tsx`, `confirmations.tsx`, `payments.tsx`, `billing.tsx`,
`reviews.tsx`, `availability.tsx`, `notifications.tsx`, `reports.tsx`, `settings.tsx`,
`my-appointments.tsx`.

### Route guard — VERIFIED CURRENT STATE

Purely client-side, inside a `useEffect` in `route.tsx` — **no `beforeLoad` anywhere under
`admin/`** (confirmed by repo-wide grep). Sequence:

- `allowed` gate for the whole `/admin` area: `business_owner | specialist | admin |
  super_admin`. A user with none of these sees a "Business area" bounce screen with a link
  home — never platform content.
- `isPlatformAdmin` = `admin | super_admin` — lets the sidebar show the Platform nav section
  and lets a user reach any `/admin/platform/*` URL.
- **Every one of the 12 platform pages additionally self-guards in its own component body**
  with `hasRole("super_admin")` specifically — stricter than the shell/layout gate. An
  `admin`-role user (not `super_admin`) sees the Platform nav, can click into any page, and is
  then blocked page-by-page with a "Super Admin only" message. This two-tier model exists in
  code but is never explained anywhere in the UI.
- There is an unguarded render window before the redirect fires (`route.tsx:76-82` shows a
  bare "Loading…" text screen while `loading`/`rolesLoading`/`staffLoading`/
  `managedBusinesses.isLoading` resolve) — a client-render-timing gap, not a data-leak: **every
  actual data-fetching server function independently re-asserts authorization** (§4), so this
  is a UX/hygiene issue, not a security hole.
- Guard markup itself is copy-pasted 12 times, not shared (10 of 12 files use an identical
  `glass`-card block; `reconciliation.tsx` and `subscription-plans.tsx` use a bare one-line
  `<p>` instead and skip the `loading` check the other 10 include).

---

## 2. Navigation map — VERIFIED CURRENT STATE vs. PROPOSED (brief §13)

**VERIFIED — `PLATFORM_NAV`** (`admin-shell.tsx:187-260`), exact current order: Overview,
Directory, Businesses, Marketplace Approvals, Users, Categories, Reserved Slugs, Email Domains,
Countries, Auth Policies, Reconciliation, Subscription Plans.

**VERIFIED — when `isPlatformAdmin`, the sidebar shows the Platform nav block AND, immediately
below it, the full business-owner nav** (minus Dashboard/Marketplace-status links) under a
"manage any business" heading — a platform admin's sidebar is both consoles stacked, not a
dedicated platform-only chrome.

**VERIFIED — topbar**: mobile hamburger; a `⌘K` command palette (`GlobalCommand`) that queries
`profiles`/`services`/`staff` only — **does not index any platform entity or nav item**; a
"Quick create" `+` dropdown with 5 business-owner-only actions, no platform actions;
`NotificationCenter` (the same in-app bell as the rest of the app); a working
language-cycle button (en/fr/ar, flips `dir` to `rtl`); a theme toggle; a `mailto:` support
link. **No breadcrumbs.** No profile menu — just `{email} · {role}` as plain text and a bare
"Sign out" button.

### Classification against the brief's proposed navigation (§13)

| Proposed section | Item | Status | Evidence |
|---|---|---|---|
| OVERVIEW | Overview | **EXISTS** | `overview.tsx`, KPI dashboard + shop list |
| MARKETPLACE | Businesses | **EXISTS** | `businesses.tsx` (status/slug) |
| | Marketplace | **EXISTS** | `marketplace.tsx` (approval queue + verification) |
| | Categories | **EXISTS** | `categories.tsx` (activate/deactivate only, no create) |
| | Locations | **MISSING** | `regions`/`cities`/`administrative_levels` tables exist (Project 04) with no admin UI found anywhere in the 12 platform pages |
| USERS | Customers | **PARTIAL** | `users.tsx` is undifferentiated global account management, not a customer-specific view |
| | Business Users | **MISSING** | No dedicated view; only reachable indirectly via `directory.tsx`'s staff entity tab |
| | Identity | **PARTIAL** | `auth-policies.tsx` covers OTP policy only; no broader identity/account-merge tooling |
| OPERATIONS | Bookings | **PARTIAL** | `directory.tsx` can search appointments read-only; no dedicated bookings page with status-override actions |
| | Reviews | **MISSING** at platform level | Review moderation exists at `admin/reviews.tsx` (business-owner scope), not `platform/*` |
| | Notifications | **MISSING** | `processNotificationOutboxNow` exists as a callable Super-Admin-only server function (per `DALLTY_NOTIFICATION_ARCHITECTURE.md`) but has no page surfacing it |
| FINANCE | Finance | **PARTIAL** | No general finance/payments dashboard beyond reconciliation |
| | Reconciliation | **EXISTS** | `reconciliation.tsx` |
| | Payouts | **MISSING** UI | `payout.functions.ts` exists server-side; no platform/* payouts page found |
| MONETIZATION | Subscriptions | **EXISTS** | `subscription-plans.tsx` |
| | Plans | **EXISTS** | same file |
| | Advertising | **MISSING** | Sponsorship/Advertising confirmed NOT STARTED (`DALLTY_IMPLEMENTATION_ROADMAP.md` phase 12) |
| | Affiliates | **MISSING** UI | `affiliate.functions.ts`/tables exist and are live (§0.3); no admin page |
| | Referrals | **MISSING** UI | `business-referral.functions.ts` exists; no admin page |
| INTERNATIONAL | Countries | **EXISTS** | `countries.tsx` |
| | Languages | **MISSING** | `LANGUAGES` is a static TS config by design (docs: "Translation Manager belongs to the later CMS/localization project") |
| | Translations | **MISSING** | Same — explicitly future scope per `DALLTY_INTERNATIONAL_ARCHITECTURE.md` |
| SEO | SEO Dashboard / Indexation / Sitemaps / Redirects | **MISSING** | Roadmap: sitemaps/JSON-LD/locale-prefixed URLs NOT STARTED |
| CONTENT | CMS / Homepage / Help Center / Blog | **MISSING** | Roadmap: General CMS NOT STARTED |
| SECURITY | Security | **PARTIAL** | `auth-policies.tsx` is the closest existing page (OTP/auth policy only) |
| | Fraud & Abuse | **MISSING** | `security_event`-style logging exists server-side (`logSecurityEvent`); no admin page |
| | Audit Logs | **MISSING** UI | `admin_audit_log` table is written to (§4), but no page reads/displays it |
| | Permissions | **MISSING** platform-wide page | `business-membership.functions.ts` handles per-business RBAC; no platform-wide permissions console |
| ANALYTICS | Platform Analytics | **EXISTS** | `overview.tsx` |
| | Search Analytics | **MISSING** | No evidence found anywhere |
| PLATFORM | Feature Flags | **MISSING** | No feature-flag system found anywhere in code or docs |
| | Health | **MISSING** | Observability confirmed NOT STARTED (roadmap phase 22 — no error monitoring/APM/uptime) |
| | Settings | **PARTIAL** | `auth-policies.tsx` is the closest thing to general platform settings |
| GLOBAL | Notifications | **EXISTS** (shared) | `NotificationCenter` in the topbar — same component the rest of the app uses, not admin-specific |
| | Help | **PARTIAL** | A single `mailto:support@dallty.com` link, not a help center |
| | My Account | **MISSING** | No profile page/menu — plain text + sign-out button only |

---

## 3. Entity administration capability audit — VERIFIED CURRENT STATE (brief §14-17)

Per-module actions actually available today (verified by reading each file's mutations, not
inferred):

| Module | View | Create | Edit | Suspend/Deactivate | Restore/Activate | Delete | Approve/Reject | Other |
|---|---|---|---|---|---|---|---|---|
| Businesses | Yes | No | No (only slug, via `SlugEditDialog`) | Yes | Yes (move to pending) | No | Yes | — |
| Marketplace listings | Yes (queue) | — | — | Hide/send-to-draft | — | — | Approve/Reject | Grant/remove "Verified" badge; per-row review notes; readiness checklist gates Approve |
| Users (global) | Yes | No | No | Suspend | Restore | **Yes — permanent delete** (native `window.confirm`, no typed-confirmation) | — | Verify email |
| Countries | Yes | No | No | Deactivate | Activate | No | — | Currencies list explicitly read-only |
| Categories | Yes | No | No | Deactivate | Activate | No | — | Translations shown read-only |
| Reserved slugs | Yes | Yes (word + reason) | No | Deactivate | Activate | No | — | — |
| Email domain rules | Yes | Yes (domain + category + reason) | No | Deactivate | Activate | No | — | — |
| Auth policies | Yes | — | Yes (global OTP settings + per-role toggle) | — | — | — | — | Some roles `is_locked` (cannot be changed) |
| Reconciliation | Yes (read-only report) | — | — | — | — | — | — | Manual "Re-check" (refetch) only |
| Subscription plans | Yes | No | Yes (price/limits/flags) | — | — | — | — | **Manual payment recording — business ID pasted as raw UUID text, explicitly commented `TEMPORARY`**; referral-reward % setting |
| Directory (cross-entity search) | Yes (shops/staff/services/appointments) | — | — | — | — | — | — | Read-only; entity tabs + text/status filter + pagination |

**Not found as platform-level capabilities at all** (per §2's classification): branch-level
admin, service-level admin, specialist-level admin, staff-level admin, booking status
overrides, payout management, affiliate/referral management, review moderation, CMS,
feature-flag toggling, a permissions console, an audit-log viewer. Some of these exist at the
**business-owner** admin level (services/staff/appointments/reviews are all real pages under
the top-level `admin/*` routes) but not as a platform-wide Super Admin surface — a Super Admin
today cannot, for example, edit one specific business's services without impersonating/opening
that business's own dashboard (not verified either way in this phase — flagged as an unknown,
see §9).

**Financial ledger admin note (brief §17):** `reconciliation.tsx` is read-only by design — it
compares payments against the ledger and reports mismatches; it does **not** offer any action
to modify ledger history, consistent with the ledger's actual immutability (§0.4). No proposal
in this document suggests changing that.

---

## 4. Security & permission model — VERIFIED CURRENT STATE (brief §18)

- **Roles**: Postgres enum `app_role` — `client`, `business_owner`, `specialist`, `admin`,
  `super_admin` (5 values, confirmed live). Separately, `platform_roles` — a business-scoped
  governance-role table with live rows for `super_admin`, `owner`, `manager`, `receptionist`,
  `confirmation_member`, `specialist`, `customer`, `affiliate`, **plus at least one live
  custom role** (`junior_receptionist`) — confirming the custom-role feature is exercised, not
  just schema.
- **Permission resolver**: `has_permission(_user_id, _business_id, _permission_key, _branch_id,
  _target_user_id)`, `SECURITY DEFINER`, 38 live permission keys. Resolves in order: literal
  `businesses.owner_id` match → a `business_memberships` row scoped `business`/`branch`/`self`
  → a separate `global`-scope check. The `'self'`-scope handling bug is fixed and live (§0.7).
- **Server-side enforcement of Super Admin actions is real and layered**, verified by reading
  `assertSuperAdmin()` (`platform.server.ts:16-35`) directly: (1) a live DB call to
  `is_super_admin()`, not a client-trusted role claim; (2) on denial, a `security_event` row is
  logged (`riskLevel: "high"`) before the error is thrown; (3) on success, **step-up
  (MFA/re-authentication) is required** via `assertStepUpComplete()`, keyed to the caller's
  actual session ID, not a client-supplied value. Every one of the 12 platform pages' mutating
  server functions calls `assertSuperAdmin(context)` before touching data — confirmed via grep
  (11 call sites in `platform.functions.ts` matching 12 files/guard blocks).
- **RLS**: every table in `public` has row-level security enabled (confirmed live, zero
  exceptions). The `bookings` mass-assignment guard trigger is present and enabled. The
  `ledger_transactions` immutability nuance is documented in §0.4.
- **Residual, previously-documented gaps confirmed still open** (not new findings, not fixed
  this phase, not fixed by this audit): direct-PostgREST calls in `src/lib/admin.ts` are not
  step-up-gated at the RLS layer, only at ownership level; login-throttle bypass via non-app
  callers still needs a CAPTCHA product decision (hCaptcha supported, disabled, no keys
  configured); Super Admin shares the same password tier as other privileged roles (no
  dedicated stronger policy).
- **The previously-flagged scope vulnerability is fixed and live** — see §0.7. No open
  vulnerability of this kind was found in this phase.
- **Audit log gap (new finding, not previously documented anywhere)**: `admin_audit_log` is
  written via `logAdminAction()`, called from 15 of 26 `src/lib/*.functions.ts` files. **Two
  specific, sensitive surfaces write zero audit-log rows**: `business-membership.functions.ts`
  (granting/revoking business governance roles, creating custom roles — i.e. *permission
  changes themselves*) and `reconciliation.functions.ts` (the Super-Admin financial-integrity
  tool). This means today, granting someone a role or running a reconciliation leaves no
  record of who did it or when.

---

## 5. Future risk-model infrastructure audit — VERIFIED CURRENT STATE (brief §19)

What already exists that a future Level 0-4 risk classification system could build on:

- **Step-up/re-authentication**: real, live, reusable (`step-up.server.ts`) — already the
  mechanism a Level 4 "critical" action would need.
- **Audit logging**: real but inconsistent (§4) — `admin_audit_log`'s schema is `actor_id,
  action, target_type, target_id, details jsonb`. **No `risk_level`, `reason`, or
  `requires_confirmation` column exists today** — a future risk-tiering system would need
  either a schema addition or to encode risk level inside the existing `details` jsonb (the
  simpler, non-breaking option).
- **Security-event risk scoring**: `logSecurityEvent()` already accepts a `riskLevel` field
  (`"high"` seen in `assertSuperAdmin`'s denial path) — a real, existing precedent for
  risk-leveled logging, just on a different table than `admin_audit_log`.
- **Typed/reason-required confirmation UI**: does not exist anywhere in the current Super
  Admin. All destructive actions found (`deletePlatformUser`, suspend/restore) use a native
  `window.confirm()` — no typed-confirmation pattern, no reason-capture field, no distinct
  visual treatment for a high-risk action versus a low-risk one.
- **Conclusion**: the *backend* primitives for a risk-tiered system (step-up, audit logging,
  risk-scored security events) already exist and are proven in production. The *frontend*
  pattern (a shared, reusable "confirm this Level N action" component with reason capture and
  typed confirmation) does not exist at all — every current destructive action was built
  independently with `window.confirm()`. This is the natural implementation seam for a future
  phase: build one shared component, wire it to the existing `logAdminAction`/step-up
  primitives, then adopt it page by page — not a from-scratch security build.

---

## 6. Component inventory — VERIFIED CURRENT STATE (brief §10-11)

**Full detail preserved in the Step 1 research transcript; summarized here.**

`components.json`: shadcn "new-york" style, `rtl: false`, oklch CSS-variable theme. 41 files
in `src/components/ui/`.

**Installed, relevant, and completely unused anywhere in `src/` (0 importers)** — directly
material to this project since the Super Admin hand-builds equivalents of every one of these:
`sidebar.tsx`, `table.tsx`, `badge.tsx`, `tabs.tsx`, `pagination.tsx`, `card.tsx`, `form.tsx`,
plus `accordion`, `alert`, `aspect-ratio`, `avatar`, `carousel`, `chart`, `checkbox`,
`collapsible`, `context-menu`, `hover-card`, `menubar`, `navigation-menu`, `progress`,
`radio-group`, `resizable`, `scroll-area`, `select`, `slider`, `textarea`, `toggle-group`.

**Used somewhere in the app, but not by the Super Admin specifically**: `dialog` (4 importers,
0 in platform/*), `drawer` (0 total), `sheet` (3, 0 in platform/*), `input` (1, 0 in
platform/*), `calendar` (2, not applicable to platform/* content), `tooltip` (1, not used —
platform/* uses the native `title` attribute instead in 2 places).

**Genuinely, consistently reused by the Super Admin today**: `sonner` (toast) — the one real
cross-cutting shared-component success story, used in 9 of 12 platform files; `command`
(the ⌘K palette, shell-level only); `alert-dialog` (once, inside `SlugEditDialog`).

**Everything else the Super Admin needs is hand-rolled per file**: buttons (dozens of
near-identical inline `className` strings for what is conceptually one "primary action button"
role — `min-h-9`/`min-h-10`/`min-h-11`/`min-h-12` all used for equivalent buttons across
different files), cards (the `glass`/`glass-soft` Tailwind utility, applied manually,
consistent in 11 of 12 files — `reconciliation.tsx` breaks the pattern, using plain borders
instead), status badges/pills (inline `<span>` repeated independently in 5 files with drifting
styles), search inputs, filter chips, empty states (no shared component — every page's empty
state is different, some have icons, most don't, several have none), error states (**no shared
component; 10 of 12 pages have no visible error state for a failed query at all** — a failed
fetch silently renders an empty list rather than an error message).

---

## 7. Design system audit — VERIFIED CURRENT STATE (brief §25)

Full token set already exists in `src/styles.css` (oklch colors, `--radius-sm` through
`--radius-4xl`, `--shadow-soft/-glass/-float`, `--motion-fast/-normal/-emphasis`,
`--z-sticky/-nav/-overlay/-drawer/-toast`, and a `text-display`/`text-h1`/`text-h2`/`text-h3`/
`text-body`/`text-body-sm`/`text-label`/`text-caption`/`text-button` typography scale) — built
by the earlier Project 16 UI/UX transformation for the **customer-facing** app.

**Adoption by the Super Admin, verified by grep:**

| Token category | Adopted? | Evidence |
|---|---|---|
| Color (oklch semantic classes) | **Yes, consistently** | Zero arbitrary hex colors found anywhere in `admin-shell.tsx` or the 12 platform files |
| Radius (`rounded-2xl`/`rounded-3xl`) | **Yes, consistently** | Used pervasively for every card/button/input |
| `glass`/`glass-soft`/`press` utilities | **Yes, mostly** | 3-7 uses per file in 11 of 12 files; `reconciliation.tsx` is the exception |
| Typography scale (`text-display`/`text-h1`/etc.) | **No — 0% adoption** | Zero matches anywhere in `admin-shell.tsx` or any of the 12 platform files; headings use ad hoc raw combos (`text-2xl font-extrabold`, `text-xl font-extrabold`, `text-lg`...) that are inconsistent with each other for the conceptually-same "page heading" role |
| `--z-*` tokens | **No** | `admin-shell.tsx` uses raw `z-30`/`z-40`/`z-50` directly; values happen to coincide with the token scale but don't reference it |
| `--motion-*` tokens | **No** | `press`'s hover/active transitions hardcode their own durations rather than referencing the tokens |
| Shadow tokens | **Partial** | Used correctly in some places (`press`, mobile drawer), Tailwind's default `shadow-xl` used elsewhere for a dropdown instead of `shadow-float` |

**Net assessment**: the Super Admin is visually coherent with the brand at the color/radius/
glass level (the highest-visibility layer), but has never adopted the typography scale, motion
tokens, or z-index tokens that exist specifically to prevent exactly the kind of per-file drift
found in §6 (inconsistent heading sizes, inconsistent button heights, inconsistent z-index
reasoning).

---

## 8. Loading, responsive & information-density audit — VERIFIED CURRENT STATE (brief §20-22)

**Loading (brief §20):** `src/components/dallty/skeletons.tsx` already defines 9 reusable
skeletons including `TableSkeleton` and `ListSkeleton`, explicitly built to be composed
"instead of ad hoc `animate-pulse` divs." **11 of 12 platform pages (92%) ignore this** and
show a bare, unstyled `"Loading…"` (or `"Loading accounts…"`, `"Checking…"`, etc.) text
paragraph — despite `TableSkeleton` being close to a drop-in fit for `reconciliation.tsx`'s
table shape and `ListSkeleton` for the several card-grid pages (`users.tsx`, `businesses.tsx`,
`marketplace.tsx`). Only `overview.tsx` uses a real skeleton (`DashboardSkeleton`). No page
shows a true blank/flash (all gate on `isLoading` before rendering), but the visual experience
for 11 of 12 pages is a plain text flash rather than a layout-preserving skeleton.
`auth-policies.tsx` additionally shows two independent, uncoordinated "Loading…" lines for its
two separate queries.

**Responsive (brief §21):** not independently re-tested in a live authenticated browser this
phase (see §9 — credential policy). Verified from code instead: `overview.tsx` has an explicit
mobile-card/desktop-table split (`sm:hidden` / `hidden sm:block`, `min-w-[820px]`); most other
pages use `flex-wrap` filter rows and single-column card grids that should reflow reasonably.
**One concrete, verified problem**: `reconciliation.tsx` is a single `<table>` in a plain
`overflow-hidden` wrapper (not `overflow-x-auto`) with no mobile card fallback, unlike
`overview.tsx`'s equivalent table — it will clip, not scroll, on a narrow viewport.
`countries.tsx` and `categories.tsx` have inconsistent or absent breakpoint classes on their
list layouts.

**Information density (brief §22):** the existing 12 pages are mostly low-density (single
lists, simple filters) — the brief's concern about future overload is prospective, for the
larger capability set §2/§3 identify as missing (a real bookings-admin table, a permissions
console, an audit-log viewer will all need real information-density strategy). Nothing in the
current 12 pages is overloaded today; this is a forward-looking concern, not a current defect.

---

## 9. What could not be verified this phase, and why

- **Live authenticated browser walkthrough of the Super Admin at the 12 target breakpoints
  (brief §21)** — not performed. Logging into a real Super Admin account requires entering a
  password or completing an OTP flow on the user's behalf; per this assistant's standing rules,
  credentials are never entered into a login form, even for verification purposes. Everything
  above about responsive/visual behavior is verified from code (Tailwind breakpoint classes,
  layout structure), not from rendered screenshots at each of the 12 target widths. If live
  visual verification is wanted, the straightforward path is: the project owner logs into
  Super Admin themselves in the shared browser pane, after which this assistant can navigate,
  screenshot, and inspect the authenticated pages without ever touching credentials.
- **Whether a Super Admin can currently reach business-level editing (services/staff/branches)
  without impersonating that business's own dashboard** — not confirmed either way. None of
  the 12 platform files expose this; whether it's reachable through some other path (e.g. a
  "view as business" mechanism) wasn't found but also wasn't exhaustively ruled out.
  Flagged as an open question for the next phase, not asserted as missing.
  Note: this differs from — and does not contradict — §3's finding, which is about
  platform-level pages specifically, not about every possible path through the app.
- **Whether `RESEND_API_KEY` and other secrets are actually set on the Vercel *production*
  deployment specifically** (vs. the local `.env`, which does have values) — no Vercel API
  access was available this phase.
- **The exact historical moment the ~10-file raw-error-leak gap (§0.5) was actually closed** —
  confirmed closed today, but no commit or doc note was found explicitly closing it; likely
  fixed incidentally while building later projects.
- **Full functional re-verification of the RBAC permission matrix or the reconciliation tool's
  correctness** — this phase audited schema, grants, RLS, and function *bodies*; it did not
  execute live authenticated requests end-to-end against a test account.

---

## 10. Recommended implementation phases — PROPOSED FUTURE STATE

Nothing below is built. This is a sequencing recommendation only, informed by §0-§9.

1. **Documentation correction pass** (small, low-risk, high-value): fix the six discrepancies
   in §0 directly in the affected docs (`DALLTY_DATABASE_CHANGELOG.md`,
   `DALLTY_FINANCIAL_ARCHITECTURE.md`, `DALLTY_MASTER_ARCHITECTURE.md`,
   `DALLTY_SECURITY_ARCHITECTURE.md`, `DALLTY_SECURITY_THREAT_MODEL.md`,
   `DALLTY_DEPLOYMENT.md`) so the doc set stops contradicting the live system. Not part of this
   phase's own scope (audit-only), but cheap and worth doing before further Super Admin work
   makes the drift worse.
2. **Design-system adoption pass on the existing 12 pages** (no new capability, pure
   consistency): swap raw heading classes for the `text-h1`/`text-h2`/`text-h3` scale, adopt
   `--z-*`/`--motion-*` tokens, bring `reconciliation.tsx`'s card styling in line with its 11
   siblings, and add `overflow-x-auto` + a mobile card fallback to its table specifically. Low
   risk (styling only), immediately visible improvement, and establishes the pattern before
   more pages are built on top of it.
3. **Shared component extraction** (build once, adopt everywhere): a real `AdminCard`
   (wrapping `glass`), a real primary/secondary/destructive `AdminButton`, a `StatusBadge`, an
   `EmptyState`, and an `ErrorState` — each replacing the dozens of hand-copied equivalents
   found in §6. Adopt the shadcn primitives already installed but unused (`table`, `tabs`,
   `pagination`, `badge`, `card`) as the base rather than building from scratch.
4. **Skeleton adoption pass**: replace the 11 bare `"Loading…"` text states with the existing
   `TableSkeleton`/`ListSkeleton`/`DashboardSkeleton` components — no new skeleton components
   needed, just wiring up what already exists.
5. **English-only/LTR-only decision, implemented explicitly**: today the admin shell's chrome
   is fully wired into i18n/RTL (including a working language switcher) while every platform
   page's content is 100% hardcoded English — an inconsistent half-state, not the brief's
   English-only requirement. Implementing the brief's requirement means either (a) removing the
   language switcher and forcing `dir="ltr"` for `/admin/*`, or (b) actually translating the
   chrome's remaining namespaces to match the pages — (a) is far less work and matches what the
   brief actually asks for.
6. **Risk-model foundation** (per §5): add a `risk_level`/`reason` field to `admin_audit_log`
   (or formalize using its `details` jsonb), build one shared "confirm this action" component
   with typed-confirmation support, reusing the *existing* step-up/audit-log primitives —
   then adopt it on the highest-risk existing actions first (permanent user delete, business
   suspend) before any new capability is added.
7. **Audit-log coverage gap fix**: add `logAdminAction()` calls to `business-membership.functions.ts`
   (role grants/revocations) and `reconciliation.functions.ts` — both are zero-audit-trail today
   (§4) and both are exactly the kind of action an audit log exists to cover. Small, isolated,
   high-value.
8. **Missing capability builds, in roughly the order the brief's proposed nav implies priority**:
   a real Bookings admin surface (view/status-override, currently only reachable read-only via
   Directory); an Audit Log viewer (the data already exists, §4); a Permissions console (RBAC
   backend already exists per Project 11); Payouts, Affiliates, Referrals admin pages (backend
   already exists per Project 12); a Locations admin page (reference data already exists per
   Project 04). CMS, SEO tooling, Feature Flags, and System Health are all confirmed
   NOT STARTED anywhere in the codebase — real net-new builds, not wiring gaps, and should be
   sequenced after the wiring-gap items above.

None of the above is authorized by this document. This is Phase 00 — audit only.

---

## 11. Phase 01 — Design system + UI foundation (VERIFIED CURRENT STATE)

Built on branch `project-super-admin-ui-ux` (not merged to `main`). Implements the
recommendations from §10 items 2-4 as a reusable foundation — no admin pages were built or
redesigned; §10 items 8+ (missing-capability builds) remain future work. Every primitive below
is real, typechecked, linted, and visually verified in the local dev server via a temporary
unauthenticated preview route (`src/routes/dev-preview-design-system.tsx`, not committed —
screenshotted at mobile/iPad/desktop widths, then deleted). The permanent, super-admin-gated
showcase lives at `src/routes/_authenticated/admin/design-system.tsx`, reachable only by direct
URL — not linked from the nav, since nav changes are Phase 02's scope.

### Colors

Extended `src/styles.css`'s existing oklch token set (§7 of this doc already covers what
existed before this phase) with two semantic layers, both decoupled from the brand-accent
tokens they reuse so a future rebrand can't silently change what "warning" or "risk level 3"
looks like:

- **Status**: `--color-success` (new — a distinct green from `--primary`'s structural brand
  green), `--color-warning` (→ `--amber`), `--color-error` (→ `--destructive`), `--color-info`
  (→ `--sky`), `--color-neutral` (→ `--muted`) — each with a matching `-foreground` for text use.
- **Risk (brief §13)**: `--color-risk-0` through `--color-risk-4`, mapped to
  `neutral/info/warning/rose/error` respectively. Deliberately restrained — consumed only as
  small badge/icon accents (`AdminRiskBadge`), never a full-bleed background, so a Level 4
  badge never makes the whole interface read as alarmist.
- **Fixed during this pass**: `--sky-foreground` and `--rose-foreground` were originally
  defined as light/white text (copying `--pink-foreground`'s pattern), which fails contrast on
  both colors' actual light, low-chroma bases. Corrected to dark text, matching the
  already-correct `--amber-foreground`/`--gold-foreground` treatment — verified visually in the
  showcase (badges read clearly against their light tint backgrounds).

### Typography

Two gaps filled in the existing scale (Display/H1/H2/H3/Body/Body-sm/Label/Caption/Button,
documented in §7): `text-stat` (large dashboard numbers, tabular-nums so a stat column never
jitters as digits change) and `text-body-lg` (a lead-paragraph size between Body and H3).

### Spacing &amp; radius

No new tokens — Tailwind's default spacing scale and the existing `--radius-sm` through
`--radius-4xl` scale (already documented in §7) are sufficient; adding a parallel spacing-token
layer would only duplicate values Tailwind already keeps consistent. Components use the
existing radius scale directly (`rounded-2xl` for controls, `rounded-3xl` for cards,
`rounded-4xl` for drawers/major surfaces).

### Shadows &amp; glass

Added semantic elevation aliases — `--shadow-elevation-low/-medium/-high` — mapped onto the
existing `--shadow-soft/-glass/-float` values (§7) rather than inventing new numbers, so a
component picks an elevation *level*, not a raw shadow. Glass (`--glass`/`--glass-border`, the
`.glass`/`.glass-soft` utilities) is unchanged — used by `AdminGlassCard`, dialogs' and
drawers' overlays, exactly the "floating controls, not main content" scope the brief specifies.

### Motion &amp; accessibility

No new motion tokens — the existing `--motion-fast/-normal/-emphasis` (§7) are referenced
directly by the new drawer's transition duration. Added one global rule to `src/styles.css`
(`@media (prefers-reduced-motion: reduce)`) collapsing all animation/transition durations to
near-zero — covers the skeleton pulse, `press`'s hover transform, and every keyframe at once,
rather than opting each new component in individually.

### Components built (`src/components/admin/ui/`)

`AdminButton` (primary/lime/accent/secondary/outline/ghost/glass/destructive variants; default/
sm/lg/icon sizes; loading state), `AdminInput`/`AdminSearchInput`/`AdminTextarea` (+
`AdminFieldLabel`/`AdminFieldError`, error/loading/disabled states), `AdminSelect` (themed
trigger/content/item over the existing shadcn Select primitive), `AdminCard`/`AdminGlassCard` (+
header/title/description), `AdminBadge`/`AdminStatusBadge`/`AdminRiskBadge`, `AdminTabs`
(themed over shadcn Tabs), `AdminDialog` (confirmations/short forms), `AdminDrawer` (single
component, responsive by CSS — bottom sheet under `sm:`, right-side drawer at `sm:` and up, per
brief §24's exact spec), `AdminTable` (+ `AdminTableScroll` wrapper so wide tables scroll
instead of clipping — the concrete bug found in `reconciliation.tsx`, §8), `AdminPagination`
(prev/next, matching what the 12 platform pages actually paginate with today), 
`AdminBreadcrumbs`, `AdminPageHeader`, `AdminEntityHeader`, `AdminSection`/`AdminDivider`,
`AdminFilterBar`/`AdminFilterChip`, and the four result states — `AdminEmptyState`/
`AdminErrorState`/`AdminPermissionDenied`/`AdminNotFound` (`admin-states.tsx`).

**Deliberately not built this phase** (brief §16: "do not create unnecessary components"):
`AdminSidebar`/`AdminCommand` — both Shell/Navigation, explicitly the next phase, per the
brief's own stop condition. `AdminCalendar` — no current consumer (nothing in the 12 platform
pages needs a date-range picker). `AdminDropdown`/`AdminTooltip` — the stock shadcn primitives
are already themed via the same CSS-variable system; a wrapper would add no value yet.
`AdminToast` — `sonner`'s existing `Toaster` is already the one genuinely-consistent shared
pattern Phase 00 found (§6); use it directly rather than re-wrapping it. `AdminIconButton` —
folded into `AdminButton` as `size="icon"`, avoiding a near-duplicate component (matches the
stock shadcn `Button`'s own pattern).

Priority order followed throughout (brief §14): existing Dallty component (none existed for any
of these) → shadcn primitive, themed (Select, Tabs, Dialog, Sheet-as-Drawer, Table) → custom
built from scratch only where no primitive existed (Button — the shadcn default was judged too
small for admin's "big and clear" requirement rather than reused and overridden; PageHeader,
EntityHeader, Section, Filter, the four result states).

### Skeleton system

Extended the existing `src/components/dallty/skeletons.tsx` (§9 of this doc) rather than
creating a parallel system, per the brief's explicit "build ONE canonical skeleton system"
instruction. Added the missing composable primitives — `SkeletonText`, `SkeletonTitle`,
`SkeletonAvatar`, `SkeletonCard`, `SkeletonRow` — and one new page-level pattern,
`DetailSkeleton` (entity-header + grouped-fields shape, for the future entity-detail drawers
§3's capability audit found missing). `DashboardSkeleton`/`TableSkeleton`/`ListSkeleton`
(already existed) are unchanged.

### Responsive foundation

No new breakpoint tokens — Tailwind's default `sm`/`md`/`lg`/`xl`/`2xl` scale is used
throughout, matching every other part of this codebase. Verified at mobile (375px), iPad
(834px), and desktop (1440px) in the showcase: the drawer's bottom-sheet-to-side-panel switch,
the result-states grid's 1-column-to-2-column reflow, and button/input sizing were all
confirmed to hold up across the three widths. The full 12-breakpoint matrix (brief §35) was not
individually re-tested — the three checked are the ones that exercise every responsive
behavior any component actually has (nothing in this phase's components branches at a
finer-grained breakpoint than `sm:`).

### Accessibility

Every interactive primitive is built on a Radix primitive (Select/Tabs/Dialog) or plain
semantic HTML with explicit `aria-*` (buttons, inputs, badges, result states) — keyboard nav,
focus trapping, and screen-reader roles for dialog/drawer/tabs/select come from Radix, not
reimplemented. `focus-visible` rings are present on every focusable primitive. Result states
never encode meaning by color alone (icon + label + color together, per brief §12/§33). Not
run through an automated accessibility scanner this phase (no such tool is wired into this
project yet) — verified by code review and Radix's own accessibility guarantees, not an
independent audit tool.

### What was not touched

No existing admin page (`src/routes/_authenticated/admin/**`) was modified to actually use
these primitives — per the brief's explicit "do not build admin pages yet," they remain
available for Phase 02+ to adopt, not yet wired into `overview.tsx`/`users.tsx`/etc. The
12-page/`admin-shell.tsx` design-token-drift findings from §7/§8 of this doc are therefore
still accurate today; this phase built the replacement parts, not the retrofit.
