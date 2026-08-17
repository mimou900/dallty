# Dallty — Implementation Roadmap

**Status:** Living document, adjusted from the original 28-phase target sequence based on
what Project 00's audit found already built vs. not started.
**Produced by:** Project 00.

Legend: **DONE** = built and verified working. **PARTIAL** = real work exists but has
verified gaps. **NOT STARTED** = greenfield.

| # | Phase | State | Notes |
|---|---|---|---|
| 00 | Architecture & Foundation | **DONE** | This project. Docs at `docs/DALLTY_*.md`. |
| 01 | Database & Core Domain Foundation | **DONE (schema only)** | `business_memberships`+`platform_roles`, `permissions`+`role_permissions`, `business_categories`, `business_branches`, country/currency FK closure, soft-deletion columns all shipped 2026-08-17 — see `DALLTY_DATABASE_ARCHITECTURE.md`. None of it is wired into enforcement yet; that's the future authorization project's job. Also fixed the stale-trigger booking-cancellation bug as a bundled bug fix. |
| 02 | Identity / Authentication | **DONE (foundation)** | Project 02, 2026-08-17. OTP step-up now server-enforced at the two central authorization chokepoints (`assertSuperAdmin`/`assertCanManageBusiness`); email/phone/password change flows verified matching spec; rate limiting added to 4 previously-open endpoints; account suspension confirmed enforced by Supabase Auth natively. See `DALLTY_IDENTITY_ARCHITECTURE.md`. Residual gaps documented there (RLS-layer step-up, Super-Admin password tier, CAPTCHA, passkeys) — none silently claimed done. |
| 03 | Security / Anti-Abuse | **DONE (foundation)** | Project 03, 2026-08-17. Found and fixed a critical `bookings` mass-assignment RLS gap (live-tested), fixed unvalidated file uploads at the Storage bucket level (live-tested), added security headers (CSP/HSTS/etc, verified against real browser errors), added rate limiting to unauthenticated endpoints, sanitized raw DB errors on customer-facing paths, built idempotency + risk-scored security-event + bot-challenge foundations. See `DALLTY_SECURITY_THREAT_MODEL.md`/`DALLTY_SECURITY_ARCHITECTURE.md`. Remaining gap: login-throttle bypass via non-app callers still needs a CAPTCHA product decision — the single highest-priority open item across all four projects. No CI still open. |
| 04 | Countries / Currencies / Administrative Geography | **DONE (foundation)** | Project 04, 2026-08-17. `countries.marketplace_enabled` (Algeria-only, RLS-enforced, live-tested), `administrative_levels` (per-country level labels), business-country immutability guard, French locale-formatting bug fixed. `businesses.country_code`/`currency` FKs already closed in Project 01. See `DALLTY_INTERNATIONAL_ARCHITECTURE.md`. Deferred: IP geolocation, `country_languages`, N-level admin hierarchy, SEO slugs. |
| 05 | Localization / i18n | **PARTIAL** | Namespaced runtime fully built and active (master doc §K). Gap: legacy `dallty-content.ts` not fully retired (stale Gulf-region fallback content, no French branch, 5 hardcoded `lang === "ar"` sites, `Intl` locale fallback bug for French). This is a finishing task, not new scope — worth doing before Locale-Prefixed Routing (Project 3 of the internal localization program) so the last legacy consumers aren't ported twice. |
| 06 | Business / Branches / Owners / Staff | **PARTIAL** | Business, staff, staff scheduling all built and working. No branch/multi-location entity exists at all — `branch_count` is cosmetic. No membership table — ownership is a single column. This phase's "Branches / Owners" half is genuinely NOT STARTED; "Business / Staff" half is DONE. |
| 07 | Services / Availability | **PARTIAL** | Services, staff-service assignment, `get_available_slots` all built and working for the single-location, single-specialist-per-booking model. Per-staff price/duration overrides exist in schema+UI but are dead (ignored by availability/booking logic) — fix or remove. Branch-level service availability doesn't exist (no branches yet). |
| 08 | Booking Engine | **DONE (backend), PARTIAL (frontend)** | Project 05, 2026-08-17. Real concurrency-safe overlap prevention (`EXCLUDE` constraint), live-tested with concurrent requests — no double booking, verified not assumed. Server-side 15-min holds, multi-service duration/price resolution, any-specialist selection, atomic reschedule, `booking_items` historical snapshots all built and tested. The customer-facing UI was deliberately NOT rewired to the hold flow this pass (scope decision, documented) — it keeps its existing direct-confirm flow, which now automatically inherits the same overlap protection with zero code change. See `DALLTY_BOOKING_ENGINE.md`. |
| 09 | Payments / Financials | **DONE (foundation), NOT STARTED (gateway)** | Project 06, 2026-08-17. Immutable double-entry ledger, cash settlement with overage/underage reconciliation, commission, staff-earning accrual, refunds — all built and live-tested. No real payment gateway integrated (no credentials exist) — `PaymentProvider` abstraction is ready for one. See `DALLTY_FINANCIAL_ARCHITECTURE.md`. |
| 10 | Notifications | **DONE (foundation)** | Project 07, 2026-08-17. Domain-event/outbox architecture, live-tested (dedupe, concurrent claim, retry/backoff, RLS). Reminder engine (24h/1h/15m, business-configurable) generating on a real, live `pg_cron` schedule. `emails` i18n namespace activated (en/fr/ar) for 14 booking/payment event types. Push/WhatsApp/SMS: architecture-ready, no real provider. Fixed a real bug where every reschedule fired a spurious "booking cancelled" notification. See `DALLTY_NOTIFICATION_ARCHITECTURE.md`. Deferred: automatic scheduling of outbox *dispatch* specifically (needs a confirmed deployment URL or an Edge Function — reminder *generation* is already automatic), real push/WhatsApp/SMS providers, customer-facing preferences UI. |
| 11 | Marketplace | **DONE (foundation)** | Project 08, 2026-08-17. Real server-side ranked/paginated/rate-limited search (`search_businesses_page`), live-tested for country isolation, visibility enforcement, anti-enumeration. Organic ranking with a sponsorship-merge extension point (not built). Real favorites wiring fixed in `BusinessCard`. See `DALLTY_MARKETPLACE_ARCHITECTURE.md`. Deferred: wiring `search.tsx`'s results feed onto the new function (kept on the existing client-filtered path this pass), branch-aware search, specialist search, a real cache layer, consolidating 3 parallel category/type fields found during the audit. |
| 12 | Sponsorship / Advertising | **NOT STARTED** | |
| 13 | Affiliate / Referral | **NOT STARTED** | No `affiliate` role, no referral/attribution tables. |
| 14 | Reviews / Trust | **DONE** | Reviews, ratings (trigger-computed), moderation, reporting all built and working. |
| 15 | Super Admin / CMS | **PARTIAL** | Reference-data management (categories/countries/currencies-readonly/reserved-slugs), business approval/verification, user management, cross-entity directory, OTP policy config — all built. General CMS (homepage, banners, legal pages, blog, help center): NOT STARTED. |
| 16 | International SEO | **PARTIAL** | Meta tags, OG, canonical, hreflang, robots.txt: DONE. Sitemaps, JSON-LD, locale-prefixed URLs: NOT STARTED — correctly sequenced after Locale-Prefixed Routing in the internal localization program. |
| 17 | Customer Web | **DONE** (for current scope) | Search, business detail, booking, favorites, bookings list, profile all built and working. |
| 18 | Business Web App | **DONE** (for current scope) | Single shared `AdminShell`, role-based, full feature set per master doc §D. One orphaned route (`/dashboard`) to clean up. |
| 19 | Customer Mobile App | **NOT STARTED** | |
| 20 | Analytics / Reports | **PARTIAL** | `/admin/reports` (Recharts-based revenue/staff/service charts) exists per-business. Platform-wide analytics exist via `/admin/platform/overview`. No dedicated analytics/BI layer beyond these two dashboards. |
| 21 | Legal / Compliance | **NOT STARTED** | No privacy policy / terms / cookie-consent / data-export / account-deletion flow found. |
| 22 | Observability | **NOT STARTED** | No error monitoring, APM, or uptime monitoring. `admin_audit_log` is a minimal, real foundation. |
| 23 | Performance / Low Internet | **NOT STARTED** (not audited in depth) | No skeleton-loading pattern in real use (component exists, unused) — 36 files hand-roll their own loading state instead. Worth consolidating before this phase is formally scoped. |
| 24 | Production Hardening | **NOT STARTED** | No CI at all. This should likely move earlier than #24 in practice — recommend standing up a minimal CI (lint + typecheck + build) opportunistically during Project 01 or 02, not waiting for a dedicated late-stage phase. |
| 25 | QA / Security Testing | **NOT STARTED** | No test suite exists (`package.json` has no `test` script). |
| 26 | Launch Algeria | **NOT STARTED** | Blocked on: the booking-cancellation bug (§E), the OTP/login-throttle security gaps (§P), and Payments (#09) at minimum. |
| 27 | International Expansion | **NOT STARTED** | Architecture is already reasonably ready for this (no hardcoded country logic found) — the real blocker is that most country-scoped subsystems (§I/§J) don't exist yet because the subsystems themselves don't exist yet. |

## Immediate next steps (in recommended order)

1. ~~Project 01 — Database & Core Domain Foundation~~ **DONE** 2026-08-17 (schema only, see
   above).
2. ~~Fix the three stale trigger functions~~ **DONE**, bundled into Project 01 as a
   necessary bug fix (`20260817100000_fix_stale_business_rename_references.sql`).
3. ~~Close the OTP step-up enforcement gap~~ **DONE**, Project 02, 2026-08-17 (server-function
   layer; RLS-layer residual gap documented, not silently closed). Login-throttle bypass
   **still open** — needs a product decision on enabling CAPTCHA (investigated, not enabled).
4. **Wire the Project 01 schema into real enforcement** — nothing yet consults
   `business_memberships`/`permissions`/`role_permissions` outside `owns_business()`'s
   additive OR clause. This is the natural next authorization project: multi-owner
   protection workflow (§12 of the original brief), custom staff roles, and real
   permission/scope-based RLS.
5. **Decide on CAPTCHA** (hCaptcha, supported by the project but disabled) to close the
   login-throttle bypass properly — needs a real site/secret key, a product-level call.
6. ~~Project 03 — Security, Anti-Bot, Anti-Fraud, Anti-Scraping & Abuse Prevention
   Foundation~~ **DONE**, 2026-08-17 — see `DALLTY_SECURITY_THREAT_MODEL.md`/
   `DALLTY_SECURITY_ARCHITECTURE.md`. Fixed a critical `bookings` mass-assignment RLS gap and
   unvalidated file uploads (both live-tested), added security headers, rate limiting on
   unauthenticated endpoints, and DB-error sanitization on customer-facing paths.
7. **Complete the DB-error-sanitization sweep** — 24 of ~74 raw-`error.message`-to-client
   call sites were fixed in Project 03 (the customer/anonymous-facing ones); ~10
   Super-Admin-only files still leak raw Postgres errors to a trusted-but-imperfect-UX
   audience. Low urgency, real to close eventually.
8. Everything else follows the phase table above in roughly its existing order, with
   Payments (#09) and Booking Engine hardening (#08's hold/lock gap) prioritized ahead of
   Marketplace/Sponsorship/Affiliate (#11–13), since a booking platform without payments or
   reliable concurrency safety isn't launch-ready regardless of how complete the marketplace
   layer is.
