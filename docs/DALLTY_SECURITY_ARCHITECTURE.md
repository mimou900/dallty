# Dallty — Security Architecture

**Status:** Living document. Produced by Project 03.
**Last updated:** 2026-08-17.

Technical reference for the security mechanisms in this codebase. See
`DALLTY_SECURITY_THREAT_MODEL.md` for the attacker-goal-oriented view of the same material.

## Authentication & authorization

Unchanged from Project 02 (`DALLTY_IDENTITY_ARCHITECTURE.md`) — Supabase Auth, custom OTP
step-up with server-side session-correlated enforcement (`auth_step_up_sessions`), RLS as
the real multi-tenant boundary. This project added security-event logging to the two central
authorization chokepoints (`assertSuperAdmin`, `assertCanManageBusiness` in
`src/lib/platform.server.ts`/`src/lib/business-crm.server.ts`) — a denied check now logs
`security.permission_denied`/`security.bola_attempt` to `admin_audit_log` before throwing.

## Database RLS & tenant isolation

Verified (not assumed) in this project via direct attack simulation: two unrelated
businesses, cross-owner read/update attempts, both rejected outright by RLS/column grants.

**One critical fix**: `guard_bookings_customer_update()` (new `BEFORE UPDATE` trigger on
`bookings`, migration `20260817230000`). Privileged callers (owner/staff of the booking's
*original* business — checked against `OLD.business_id`/`OLD.staff_id`, never `NEW`, so an
attacker can't launder privilege by simultaneously reassigning those columns) may change
anything, matching prior behavior exactly. Everyone else (a customer on their own booking)
may only change `starts_at`/`ends_at` (reschedule) and move `status` to `cancelled` — every
other column, including `payment_status`, `total_price`, `staff_id`, `service_id`,
`business_id`, `discount_amount`, `promotion_id`, `customer_name`/`phone`/`email`, is
rejected. Mirrors the pre-existing `guard_business_marketplace()` pattern on `businesses`.

## Public data / DTOs

Audited every anonymous-reachable query and server function (`business.$businessSlug.tsx`,
`search.tsx`, `index.tsx`, every `createServerFn` without `requireSupabaseAuth`). No fix
needed — column-level Postgres GRANTs already exclude PII (`businesses.business_email/
business_phone/latitude/longitude`, `staff.email/phone`) from the anon/authenticated roles,
and every service-role-client function reading those columns is gated by an ownership/role
check. `get_business_public_staff()` (SECURITY DEFINER, anon-callable) uses a fixed column
list, not `SELECT *`.

## Rate limiting

Generic, reusable limiter (Project 02): `check_rate_limit(bucket, max_hits, window_minutes)`
RPC + `rate_limit_hits` table, `src/lib/rate-limit.server.ts`. Different operations use
different policies (bucket key + limits), not one global limit:

| Bucket | Limit | Key |
|---|---|---|
| `check_email:*` / `check_phone:*` / `check_email_domain:*` | 20/10min | IP |
| `check_signup_password:*` | 60/10min | IP |
| `guest_booking:*` | 5/10min | IP |
| login (pre-existing) | 5/15min | email |
| OTP resend (pre-existing) | 1/60s + 5 max attempts | user |
| business-slug change (pre-existing) | 3/30 days | business |

A throttled request now logs `security.rate_limit_triggered` (`risk_level: medium`) —
new in this project, via `logSecurityEvent()`.

Live-tested (not assumed): a bucket allows exactly `max_hits` requests then blocks the
next one, confirmed via direct RPC calls.

## Bot challenge abstraction

`src/lib/bot-challenge.server.ts` — `resolveBotChallengeLevel()` returns `NO_CHALLENGE` /
`RISK_CHALLENGE` / `REQUIRED_CHALLENGE` based on a real signal (percentage of a rate-limit
bucket's budget consumed in-window), compared against Super-Admin-configurable thresholds in
`platform_security_settings` (`risk_challenge_threshold`/`required_challenge_threshold`,
defaults 60/90). `platform_security_settings.bot_challenge_provider` defaults to `'none'` —
no Turnstile/hCaptcha site or secret key exists in this environment, so nothing currently
blocks a request based on this function's result; it's provider-agnostic by construction
(never hardcodes a specific vendor) and ready to gate a real challenge widget once one is
configured.

## Idempotency

`idempotency_keys` table + `withIdempotency()` (`src/lib/idempotency.server.ts`). Scoped to
`(actor_id, operation, idempotency_key)` — never a timestamp. A second call with the same
triple while the first is in-flight throws `DuplicateRequestError`; after completion, returns
the cached `response` without re-running the operation. No consumer exists yet (booking/
payment/coupon/affiliate aren't built) — this is foundation for those, per the brief's own
"establish requirements, don't implement the systems" instruction for Project 03.

## Risk-scored security events

`admin_audit_log` (Project 01's audit foundation) extended with `ip text`, `risk_level text
CHECK IN ('low','medium','high','critical')`, `outcome text` — not a second audit system.
`logSecurityEvent()` (`src/lib/security-event.server.ts`) is the write path. Events wired up
in this project: `security.rate_limit_triggered`, `security.permission_denied`,
`security.bola_attempt` (in addition to Project 02's `security.otp_requested/verified/
failed` and the pre-existing `security.email_changed/password_changed/phone_changed`,
`user.suspend/restore`). `actor_id` may be `null` for pre-authentication events (already made
nullable in Project 02 for the disposable-email-rejection case).

Never logged, anywhere in this codebase (verified, not assumed): passwords, OTP codes,
access/refresh tokens, verification tokens. OTP codes are HMAC-hashed before storage;
`console.error` calls in `sanitizeDbError()`/security-event paths log error *messages*, never
credential values.

## Upload security

Bucket-level enforcement (migration `20260817220000`), the actual fix for a real gap: all
five upload call sites validated size/MIME client-side only (trivially bypassed — no server
hop exists between the browser and Supabase Storage), and two of the five had no size check
even client-side. `business-media`/`avatars`/`review-photos` buckets now have
`file_size_limit = 10485760` (10MB) and `allowed_mime_types = ARRAY['image/jpeg','image/png',
'image/webp','image/gif']`, enforced by Supabase Storage itself server-side. Live-tested:
disallowed MIME and oversized files both rejected; valid small image accepted.

**Not implemented, and why**: magic-byte/content-signature validation, pixel-dimension
limits, image re-encoding/EXIF-stripping. No image-processing library (sharp/jimp/etc.)
exists in this project; adding one is a real dependency-and-maintenance decision better made
by whichever project actually needs server-side image processing (e.g. a future CMS/SEO
project wanting AVIF/WebP re-encoding), not bolted on speculatively here. The bucket-level
MIME/size limits close the most severe part of this gap (unbounded arbitrary file upload)
without that dependency.

## Security headers

Applied once, at the single point that sees every response this app returns
(`src/server.ts`'s Worker `fetch` handler) — not per-route config, since the Nitro wrapper
this project uses (`@lovable.dev/vite-tanstack-config`) doesn't expose a `routeRules`
passthrough for headers (confirmed by reading its type definitions).

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'
  https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:
  https://maps.gstatic.com https://maps.googleapis.com <supabase-origin>;
  connect-src 'self' <supabase-origin> wss://<supabase-origin> https://maps.googleapis.com;
  worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(self)
X-Frame-Options: DENY
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

**`script-src`/`style-src` include `unsafe-inline` — a verified, documented exception, not
an oversight.** Confirmed by testing this CSP against the running dev server before trusting
it: TanStack Start's client hydration injects an inline bootstrap script carrying per-request
loader data (`window.$_TSR`) directly into the HTML. A stricter `script-src` broke hydration
entirely (`Invariant failed: Expected to find bootstrap data window.$_TSR`). Hash-based CSP
isn't viable (that script's content, and therefore its hash, changes on every request since
it embeds page-specific data); nonce-based CSP would need per-request nonce injection into
TanStack Start's own hydration output, which isn't wired up in this app's current setup —
flagged as a real follow-up for whoever next touches the SSR/hydration layer, not silently
dropped. Every other directive is real and restrictive (`frame-ancestors 'none'` blocks
clickjacking, `object-src` is implicitly none via `default-src 'self'`, connect/script/style/
font/img are scoped to exactly the origins this app loads from, confirmed by reading the
source rather than guessing).

Iterated twice against actual browser console errors before landing on the final policy
(first pass broke hydration, second pass missed `worker-src` for a blob: Web Worker some
dependency spins up) — verified clean (zero console errors, fully interactive page, real
dropdown options populated) on the homepage and search page before considering this done.

## CORS

No explicit CORS configuration exists, and none was added — confirmed correct as-is, not a
gap. Server functions are same-origin RPCs, not a separately-hosted API. The `/lovable/
email/*` route handlers are called server-to-server (Lovable's backend), gated by a Bearer
API-key check rather than an Origin check, which is the correct control for that caller.

## CSRF

Pre-existing, confirmed still correct: `createCsrfMiddleware({ filter: (ctx) =>
ctx.handlerType === "serverFn" })` re-installed in `src/start.ts` (defining that file opts
the app out of the framework's automatic CSRF middleware). Session lives in `localStorage`,
never a cookie, and every server-function call manually attaches `Authorization: Bearer
<token>` — meaning there's no ambient credential for a forged cross-site request to exploit
in the first place; the CSRF middleware is real defense-in-depth on top of that, not the
primary defense.

## XSS

No fix needed, verified not assumed: exactly one `dangerouslySetInnerHTML` in the entire
codebase (shadcn chart theming, developer-supplied CSS values, never user content). All
user-generated content renders through plain JSX (auto-escaped).

## Error handling

`errorMiddleware` (`src/start.ts`) correctly shows only a generic page for unhandled SSR
crashes, full detail server-logged only — confirmed unchanged and correct. The gap this
project found and partially fixed was different: server-function (RPC) errors bypass that
middleware entirely (TanStack's own RPC layer serializes thrown errors to the client first)
— see `sanitizeDbError()` above and the threat model doc's "Information disclosure" section
for what was fixed vs. explicitly left as a documented follow-up.

## Search & pagination bounds

Every list/search endpoint reviewed. Fixed: `/search` and the homepage's businesses query
had no bound at all (`src/hooks/use-live-businesses.ts`, `src/routes/index.tsx`) — now
`.limit(500)`, a stopgap not a real pagination solution. Confirmed already-safe: Super Admin
directory (`Zod pageSize.max(100)`), every other list endpoint (5-5000 row hardcoded server-
side caps, never client-adjustable), no client-controlled sort/filter field names anywhere
(every `.order()` column is a literal string, verified by grep across every call site).

## What was deliberately NOT built in Project 03

Per the brief's own scope boundary: booking engine, availability engine, payment engine,
subscriptions, sponsorship, affiliate commissions, loyalty engine, reviews, marketplace
ranking, CMS, international SEO, mobile app, AI, WhatsApp, SMS. Also not built, and why:

- **CAPTCHA/Turnstile integration** — no site/secret key available in this environment;
  enabling it is a product decision requiring real credentials, not something to fabricate.
- **Login-throttle enforcement inside Supabase Auth itself** — investigated via the
  Management API, no clean solution found without CAPTCHA; remains the top open item.
- **RLS-layer OTP step-up enforcement** (carried from Project 02) — would need to embed a
  step-up check inside `owns_business()`/`is_super_admin()` themselves, affecting 41+ live
  RLS policies at once; too large a blast radius to verify safely without extensive
  additional live browser testing this session couldn't perform against real accounts.
- **Complete error-message sanitization** (10 remaining Super-Admin-only files) — see above.
- **Magic-byte upload validation, image re-encoding** — would need a new dependency.
- **A monitoring/alerting dashboard** — the data (`admin_audit_log` with `risk_level`/
  `ip`/`outcome`) exists; no UI was built to consume it, matching "don't build a huge
  analytics system in this project."
