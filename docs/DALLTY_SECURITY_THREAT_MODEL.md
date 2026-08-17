# Dallty — Security Threat Model

**Status:** Living document. Produced by Project 03 (Security, Anti-Bot, Anti-Fraud,
Anti-Scraping & Abuse Prevention Foundation).
**Last updated:** 2026-08-17.

This is the threat model — what Dallty defends against and how, organized by attacker goal.
`DALLTY_SECURITY_ARCHITECTURE.md` documents the mechanisms in more technical depth; this
document is the "why" and "against what."

## Trust boundaries

```
Browser (hostile by default)
   │  Bearer JWT (localStorage, never a cookie)
   ▼
TanStack Start server functions (createServerFn) ── the ONE place app code runs trusted
   │  service-role client (bypasses RLS) OR request-scoped client (RLS-bound)
   ▼
Postgres (Supabase) ── RLS is the actual, final enforcement layer
```

Two things make this app's trust model distinctive, both confirmed by direct testing in
this project, not assumed:

1. **RLS is not defense-in-depth here, it's load-bearing.** A meaningful fraction of
   mutations (`src/lib/admin.ts`) go straight from the browser to Postgres via PostgREST,
   with no server function in between. Every business-scoping guarantee for those calls
   comes entirely from RLS policies (`owns_business()`, `is_business_staff()`) — there is no
   second layer to catch a mistake there.
2. **Server functions are not automatically safe just for existing.** `createServerFn`
   handlers still read/write through the same RLS-bound or service-role client — a handler
   that forgets an ownership check is just as exploitable as a missing RLS policy would be.
   This project found and fixed exactly one case of each category (see "What was found and
   fixed" below).

## Attacker goals and defenses

### Create fake/disposable accounts
- **Defense:** `email_domain_rules` classification + `handle_new_user()` hard block
  (Project 02 addendum). Disposable/blocked domains cannot complete signup at all — verified
  by direct test (`mailinator.com` signup fails with zero rows created).
- **Residual gap:** no CAPTCHA (none configured in this Supabase project), so a script can
  still attempt signup at whatever rate `rate_limit_hits`/Supabase's own project-level auth
  limits allow. See "Deferred" below.

### Brute-force authentication / OTP abuse
- **Defense:** `check_login_throttle`/`record_login_attempt` (5 attempts/15min per email,
  Project 00), OTP resend cooldown + max-attempts (Project 00), server-side OTP step-up
  enforcement for privileged roles (Project 02, `auth_step_up_sessions`).
- **Residual gap, carried forward unresolved:** the login throttle is orchestrated by this
  app's own `/auth` page code, not enforced inside Supabase Auth itself — a caller that
  skips this app's code (direct REST call to Supabase's token endpoint) bypasses it. Explicitly
  investigated in this project via the Supabase Management API: no field maps cleanly onto
  "password-grant brute force" specifically among the project's configurable auth rate
  limits, and CAPTCHA (which would close this properly) remains disabled. This is the single
  highest-priority open security item across Projects 00-03.

### Enumerate accounts (email/phone existence)
- **Defense:** password-reset (`resetPasswordForEmail`) returns success regardless of
  existence, by Supabase's own design. `checkEmailHasAccount`/`checkPhoneHasAccount` are
  intentionally allowed to reveal existence (normal signup-duplicate-check UX, not the
  enumeration risk the brief warns about) but are now rate-limited per-IP (Project 03) to
  stop volume-based scanning.

### Scrape businesses/phone numbers/emails
- **Defense, verified by direct audit (not assumed):** every anonymous-reachable query and
  server function was traced in this project — none returns customer/staff PII or private
  business contact fields. Column-level Postgres GRANTs exclude PII from the public role
  entirely, and every function that *does* read PII via the service-role client is gated by
  `requireSupabaseAuth` + an ownership/role assertion. No fix was needed here; the existing
  architecture already holds.
- **Residual gap:** public `/search` had no row-count bound at all (fetched the entire
  `businesses` table) — fixed in this project with a `.limit(500)` stopgap. A real
  paginated/rate-limited search endpoint is the correct long-term fix (see Deferred).

### Spam bookings / reserve slots repeatedly
- **Current state (unchanged by this project, Booking Engine not in scope):** no hold/lock
  concept exists; only exact-timestamp double-booking is prevented at the DB level (Project
  00/01 findings, still true). `createGuestBooking` now has a per-IP rate limit (Project 03).
  Full concurrency-safe booking-hold infrastructure is Booking Engine project scope.

### Bypass frontend restrictions / access another business's data (IDOR/BOLA)
- **Defense, verified by direct attack simulation in this project:** created two unrelated
  businesses, signed in as one owner, attempted to read and update the other's private
  columns directly via PostgREST — both attempts failed completely (`permission denied`).
  Every sampled server-function authorization chokepoint (`assertSuperAdmin`,
  `assertCanManageBusiness`) now also logs a `security.bola_attempt`/
  `security.permission_denied` security event on denial.
- **Found and fixed in this project — the most serious issue in the whole audit:** the
  `bookings` table's UPDATE RLS policy checked only row ownership (`customer_id =
  auth.uid()`), not which columns changed. A signed-in customer could PATCH their own
  booking's `payment_status`, `total_price`, `staff_id`, `service_id`, or `business_id`
  directly via PostgREST — completely bypassing the app's own payment/reassignment UI, which
  only ever sent safe fields but provided no actual protection since the underlying grant was
  wide open. Fixed with a `BEFORE UPDATE` guard trigger (`guard_bookings_customer_update`)
  restricting non-privileged callers to cancel/reschedule only. **Live-tested**: the exact
  attack (set `payment_status: 'paid'` on your own booking) is now blocked; legitimate
  customer cancellation and owner payment-marking both still succeed.

### Mass assignment (submit `role: SUPER_ADMIN`, `payment_status: PAID`, etc.)
- **Defense:** every server function reviewed uses explicit field allowlists or
  strict-mode Zod schemas (which strip unknown keys by default) for anything touching a
  sensitive column. `guard_business_marketplace()` (pre-existing) blocks non-admin changes to
  `is_verified`/`marketplace_status`/`plan`/`status` on `businesses` even if application code
  were bypassed. The `bookings` gap above was the one place this held only at the app-code
  layer, not the DB layer — now fixed identically. Two lower-risk spread-based mutations
  (`useSaveService`/`useSaveStaff` in `src/lib/admin.ts`) were converted to explicit field
  maps for consistency, though RLS's `WITH CHECK` on `business_id` already prevented the
  cross-business version of this attack.

### Upload malicious files
- **Found and fixed in this project:** upload validation (size, MIME type) existed only in
  client-side JavaScript across all 5 upload call sites, trivially bypassed by calling
  Supabase Storage's REST API directly with a valid session token — and 2 of the 5 paths
  (specialist portfolio, business gallery) had no size check even client-side. Fixed by
  setting `file_size_limit` (10MB) and `allowed_mime_types` (JPEG/PNG/WebP/GIF) directly on
  the `business-media`/`avatars`/`review-photos` Storage buckets — enforced server-side by
  Supabase Storage itself regardless of client behavior. **Live-tested**: a disallowed MIME
  type and an oversized file are both now rejected server-side; a valid small image still
  succeeds.
- **Residual gap:** no magic-byte/content inspection (a file with a spoofed-but-matching
  `Content-Type` and a crafted-but-small byte size could still pass), no pixel-dimension
  validation, no image re-encoding/stripping. No image-processing library exists in this
  project and adding one (sharp/jimp) was judged out of scope for a security-foundation
  project — see Deferred.

### Overload APIs / consume excessive database resources
- **Defense:** all list/search endpoints reviewed either had pre-existing hardcoded row caps
  (5-5000 rows depending on endpoint, all server-controlled, never client-adjustable) or
  Zod-enforced page-size maximums (Super Admin directory, capped at 100/page). The one
  genuinely unbounded query (`/search`) is fixed in this project. No client-controlled sort/
  filter field names exist anywhere — every `.order()`/filter column is a hardcoded string,
  confirmed by direct grep of every call site.

### XSS
- **Verified, no fix needed:** exactly one `dangerouslySetInnerHTML` exists in the entire
  codebase (a shadcn chart-theming component injecting developer-supplied CSS custom
  properties, never user content). No markdown-to-HTML rendering path exists. Business
  descriptions/reviews/all user-generated text render as plain React children, auto-escaped
  by JSX. DOMPurify is present in the build only as a transitive dependency of `jspdf`
  (PDF export), unrelated to and not applied to any user-content rendering path.

### Information disclosure via error messages
- **Found and partially fixed in this project:** the dominant server-function error pattern
  (`throw new Error(error.message)`, ~50+ call sites) lets raw Postgres error text — which
  can reveal table/column/constraint names — reach the browser, since TanStack Start's RPC
  layer serializes thrown errors back to the client by design (confirmed: this happens
  *before* `errorMiddleware` ever sees it, which only catches genuinely unhandled crashes).
  Fixed for the 4 customer/anonymous-facing files (`account.functions.ts`,
  `email-trust.functions.ts`, `business-slug.functions.ts`, `business-settings.functions.ts`
  — 24 call sites) via a new `sanitizeDbError()` helper that logs the real error server-side
  and returns only a known-safe or generic message to the client.
- **Explicitly not fixed, and why:** ~10 remaining files with the identical pattern are
  Super-Admin-only server functions. A raw Postgres error reaching a Super Admin (a trusted
  platform operator, not the public) is a UX-quality issue, not the schema-leak-to-an-
  attacker scenario this defense is for. Retrofitting all ~50 sites safely in one pass was
  judged too large a blast radius for this project — flagged as a prioritized, scoped
  follow-up, not silently left broken.

### Bot/automated abuse generally
- **Defense:** a provider-agnostic `BotChallengeLevel` abstraction (`NO_CHALLENGE`/
  `RISK_CHALLENGE`/`REQUIRED_CHALLENGE`) exists (`src/lib/bot-challenge.server.ts`), using a
  real signal (rate-limit-bucket consumption percentage) rather than a fabricated score, per
  the "deterministic rules, not an AI fraud model" instruction. No CAPTCHA/Turnstile provider
  is configured, so nothing currently blocks a user based on this — it's consumed today only
  to risk-score security-event logging, ready to gate an actual challenge widget once a
  provider is enabled.

### Future systems (payments, coupons, affiliates, reviews) — foundation only
Per the brief's own explicit instruction, none of these systems exist yet and none were
built in this project. What *was* built as reusable foundation for them:
- **Idempotency** (`idempotency_keys` table + `withIdempotency()` helper) — scoped to
  actor+operation+key, never a timestamp, caches the original response so a legitimate retry
  doesn't re-execute a future booking/payment/refund.
- **Risk-scored security events** (`admin_audit_log` extended with `ip`/`risk_level`/
  `outcome`, not a second audit table) — ready for future fraud-signal accumulation
  (repeated cancellations, coupon abuse, referral abuse) without a schema change.

No coupon/affiliate/review-specific fraud tables were built — there is no coupon, affiliate,
or review system yet for them to protect, and building fraud infrastructure for a
non-existent feature would be pure speculation.

## Incident response (foundation, not a runbook)

```
Security event occurs
  → logged to admin_audit_log (actor_id, action, ip, risk_level, outcome, details)
  → Super Admin can query by risk_level/action (indexed columns)
  → suspend the account (setUserSuspended → Supabase Auth ban_duration, verified to
    actually block sign-in, not just an admin-visible flag)
  → hard-delete if warranted (deletePlatformUser)
```

No dashboard/alerting UI was built for this in Project 03 (out of scope — "do not create a
huge analytics system"). The data needed to build one exists.
