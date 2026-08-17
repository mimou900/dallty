# Dallty — Identity & Authentication Architecture

**Status:** Living document. Produced by Project 02 (Identity, Authentication & Account
Foundation), building on Projects 00/01.
**Last updated:** 2026-08-17.

This documents the identity/auth system as it actually exists after Project 02 — most of it
was already built (verified in Project 00's audit and re-verified here); this project closed
specific gaps and documents the whole picture. Every claim below is IMPLEMENTED unless
explicitly marked PLANNED.

## Identity model

Authentication (who you are) is Supabase Auth, full stop — no second identity provider, no
custom JWT handling. The Google OAuth login path (currently feature-flagged off) calls
Supabase's own `signInWithOAuth` directly; there is no intermediary user store.

Authorization (what you're allowed to do) is layered on top, deliberately kept separate:
`user_roles` (global `app_role`: `client`/`business_owner`/`specialist`/`admin`/
`super_admin`) for coarse platform role, `business_memberships` (Project 01) for
business-scoped governance role, RLS policies keyed off `owns_business()`/
`is_business_staff()`/`is_platform_admin()`/`is_super_admin()` for actual data access. This
project did not blur that line — see "What Project 02 changed" below for the one addition
(step-up enforcement), which lives in the authorization layer's central chokepoints, not in
`requireSupabaseAuth` itself.

## Account types

`CUSTOMER` / `BUSINESS_USER` / `SUPER_ADMIN` / `AFFILIATE` map onto the existing `app_role`
enum plus Project 01's `business_memberships` for the business-scoped sub-roles (owner,
manager, receptionist, confirmation_member, specialist, custom). **No separate
`owner_users`/`manager_users`/`specialist_users` authentication tables exist or were
created** — a single `auth.users` row is the identity; role/membership rows determine what
it can do. This was already the architecture before Project 02; nothing needed fixing here.

**Customer/business separation (§19 of the brief):** confirmed unchanged and correct.
`handle_new_user()` assigns exactly one role from signup metadata — a business owner never
automatically gets a `client` role, and vice versa. `user_roles` technically allows multiple
roles per user (`UNIQUE(user_id, role)`, not `UNIQUE(user_id)`), so a person *can* hold both
identities, but nothing does it automatically. **No account-merging feature exists or was
built** — per the brief's explicit instruction not to implement one.

## Authentication methods

Email+password is the only live customer sign-in path today. Magic-link and phone-OTP
handlers exist in code (`src/routes/auth.tsx`) but are hidden behind a `SHOW_ALT_METHODS`
flag — not deleted, just not surfaced. A Google OAuth button exists behind
`SHOW_OAUTH_BUTTONS` — infrastructure is present (`supabase.auth.signInWithOAuth()`), the
provider list isn't hardcoded into a component in a way that blocks turning it on. Enabling
either is a product decision (flip a flag), not a missing-code problem.

## Session model

Supabase's own session object in `localStorage`. "Remember me" off installs a
`pagehide`-triggered cleanup that deletes the `sb-*-auth-token` keys on tab close
(`src/lib/session.ts`) rather than using a different storage backend. CSRF middleware is
explicitly re-installed in `src/start.ts` (defining that file opts the app out of the
framework's automatic CSRF middleware). No custom JWT signing/verification was introduced —
`requireSupabaseAuth` calls Supabase's own `getClaims()` for every server function.

## OTP model — what changed in Project 02

**Before this project (verified in Project 00's audit):** a custom HMAC-hashed, constant-
time-compared OTP engine already existed (`auth_otp_codes`, `auth_settings`,
`auth_role_policies`, `src/lib/otp.server.ts`) for `login_step_up` / `change_email` /
`change_email_new` / `change_password` purposes, with real per-role configurability. But
enforcement of the *login* step-up was a client-side redirect only
(`dallty:otp-pending` in `localStorage`, checked in `/_authenticated`'s `beforeLoad`) — the
access token issued by `signInWithPassword` was already fully valid before OTP was even
checked, so a caller that skipped the `/verify-otp` UI (or called a server function
directly) could invoke privileged actions, including `super_admin`-gated ones, without ever
completing the OTP step.

**What Project 02 built:** `auth_step_up_sessions` (session_id ↔ user_id ↔ verified_at),
correlated to the caller's actual JWT `session_id` claim (a required, stable claim on every
Supabase Auth token — confirmed in `@supabase/auth-js`'s own type definitions, not assumed).
`verifyOtp`'s handler now writes a row here on successful `login_step_up` verification.
`assertSuperAdmin` and `assertCanManageBusiness` — the two central authorization helpers
every privileged server function funnels through (confirmed via Project 00's audit: 100% of
sampled mutating functions used one of these two) — now call `assertStepUpComplete`
(`src/lib/step-up.server.ts`) before allowing the action, for any user whose role requires
it. `assertManagesSalon` (a duplicate of `assertCanManageBusiness` flagged in Project 00) now
delegates to it instead of re-implementing the same check, closing that duplication as a
side effect. `checkLoginOtpRequired` was refactored to share the same `isStepUpRequired`
logic rather than duplicating the query.

**Residual gap, documented rather than silently left implicit:** business-dashboard pages
under `src/lib/admin.ts` (`useSaveService`, `useSaveStaff`, `useSetPaymentStatus`, etc.)
mutate tables directly from the browser via PostgREST, not through a server function — RLS
(`owns_business()`) is the real gate there, and step-up is **not** enforced at the RLS layer
itself. In normal use this doesn't matter (the client-side redirect to `/verify-otp` already
prevents a pending-step-up user from ever loading the dashboard that issues these calls), but
a caller with a leaked access token who skips the SPA and talks to PostgREST directly could
still perform these specific mutations without completing step-up. Closing this fully would
mean embedding a step-up check inside the `owns_business()`/`is_super_admin()` Postgres
functions themselves (reading `auth.jwt()->>'session_id'`, which Supabase does expose to RLS)
— evaluated and deliberately deferred: that change has much larger blast radius (it sits
underneath 41+ live RLS policies, including plain reads) and needs the kind of live,
end-to-end browser verification this session couldn't safely perform against real user
accounts. **PLANNED**, not implemented.

**OTP security properties (all pre-existing, verified unchanged):** 6-digit codes, HMAC-
SHA256 hashed at rest (never plaintext), constant-time comparison
(`crypto.timingSafeEqual`), configurable expiry (default 10 min), resend cooldown (default
60s), max verification attempts (default 5, then the code is dead — request a new one).

## Password model

Two-tier policy (`src/lib/password-policy.ts`, pre-existing, unchanged): `client` (length +
letter + number — low friction, matching the brief's "extremely simple" customer UX
principle) and `privileged` (length + upper + lower + number + symbol) for
`business_owner`/`specialist`/`receptionist`/`manager`/`admin`/`super_admin`. A short
common-password blocklist is checked regardless of tier. Both the signup form and every
server-side password mutation (`changeMyPassword`, `confirmPasswordChange`) resolve the
policy from this single shared module — no drift between client and server validation.

**Gap noted, not fixed:** the brief asks for Super Admin to have the *strongest* policy,
stronger than other privileged roles — today `super_admin` shares the same `privileged` tier
as `business_owner`/`manager`/etc. A third, stricter tier (e.g. minimum length 12,
no-repeat-characters, mandatory rotation) was not built this pass — low blast radius, but
real; flagged as a small, well-scoped follow-up rather than done speculatively here.

Passwords are never stored by this codebase — `supabaseAdmin.auth.admin.updateUserById()`
hands raw passwords to Supabase Auth's own hashing; nothing in `src/` persists or logs a raw
password.

## Email verification / password reset

Both ride Supabase Auth's native mechanisms (re-skinned via Dallty's own auth email hook, see
`DALLTY_VENDOR_INDEPENDENCE.md`, not replaced): `supabase.auth.signUp()`'s confirmation flow
for verification, `supabase.auth.resetPasswordForEmail()` for reset. Both are secure by
construction — Supabase
issues short-lived, single-use tokens server-side and (confirmed by design, not just
assumed) `resetPasswordForEmail()` returns success regardless of whether the email exists,
satisfying the brief's "do not reveal whether an email exists" requirement for this specific
flow without any code in this repo needing to enforce it. `safeOrigin()`
(`staff-access.server.ts`) allowlists which origins a generated recovery link can redirect
to, preventing an open-redirect via a forged `origin`.

## Email change / phone change

Both fully implemented, pre-existing, verified matching the brief's spec closely:

- **Email change** (`src/lib/account.functions.ts`): three-step flow —
  `requestEmailChange` (rejects a duplicate target, sends OTP to the *current* address) →
  `verifyOldEmailForChange` (proves ownership of the old address, sends OTP to the *new*
  one) → `confirmEmailChange` (applies the change using the OTP row's own stored target,
  never a client-resupplied value — closing a class of "tamper the redirect target" bug).
  Sends a security-alert email to the old address afterward, logs
  `security.email_changed` to `admin_audit_log`.
- **Phone change** (`notifyPhoneChanged`): the brief explicitly says phone change does *not*
  need phone OTP — matches the existing design, which layers on top of Supabase's native
  SMS-OTP `phone_change` flow (client-side) and adds a server-side confirmation-email +
  audit-log step (`security.phone_changed`) this app owns.
- **Password change** (authenticated, distinct from the recovery-link reset flow):
  `requestPasswordChange` (verifies current password, validates the new one, sends OTP) →
  `confirmPasswordChange` (re-validates everything — defense in depth — applies the change,
  sends a security alert, logs `security.password_changed`). The client signs out other
  sessions immediately after via `supabase.auth.signOut({ scope: "others" })`.

## Business context (§18 of the brief)

**Divergence from the brief's literal spec, documented rather than force-built:** the
brief describes a single-active-business model ("0 → onboard, 1 → auto-select, 2+ → 'choose
your business' picker"). The actual, working dashboard architecture is different: every
admin page (`services.tsx`, `calendar.tsx`, `reports.tsx`, and 7+ others) calls
`useManagedBusinesses()` and **aggregates data across every business the caller manages
simultaneously** — a deliberate, consistently-applied design (confirmed across 10+ files),
not an oversight. Retrofitting a single-active-business picker would mean rearchitecting
all of those pages' data-fetching, which is out of proportion for this project and risks
regressing working functionality the brief itself says not to touch.

What *is* the security-critical part of §18 — "never trust a client-supplied business ID,
verify membership server-side" — was already true and remains true: `useManagedBusinesses()`
only ever returns RLS-verified businesses (the query itself is scoped by `owner_id`/
`is_platform_admin`), and every mutation independently re-verifies via
`assertCanManageBusiness` regardless of what the client aggregated client-side. A stale or
tampered `businessId` in a request cannot succeed.

One real, pre-existing latent issue found and left as-is (not this project's to fix): a
now-dead `useMyBusiness()` hook in `src/lib/admin.ts` picks `businesses.data?.[0]` with no
ordering guarantee — but it has zero call sites anywhere in `src/`, so it's inert, not a live
bug. Noted for a future cleanup pass.

## Specialist without account (§8 of the brief)

Already fully satisfied by the existing schema — verified, not rebuilt.
`staff.user_id` is nullable (`REFERENCES auth.users(id) ON DELETE SET NULL`, no `NOT NULL`),
and `staff.invited_at`/`invite_accepted_at` track the claim lifecycle. A business can create
"Fatima — Hairdresser" with a full profile, schedule, and services and never require her to
sign up. `inviteStaffMember` creates or reuses an `auth.users` account and emails a
password-setup link generated via Supabase's own `generateLink({type: 'recovery'})` — this
delegates token security (single-use, expiring, scoped to one email) to Supabase's own
implementation rather than inventing a parallel one, which is the same reasoning the brief
itself gives for reusing established infrastructure.

## Invitations (§26 of the brief)

Staff invitation is implemented (`inviteStaffMember`, `staff_join_requests`,
`reviewStaffRequest` in `src/lib/staff-access.functions.ts`), using Supabase's native
recovery-link mechanism for the token (see above) rather than a bespoke invitation-token
table. `staff_join_requests` scopes a join request to exactly one `business_id` — it cannot
be replayed against a different business. A full generic "business invitation" system
(reusable beyond staff — e.g. inviting a co-owner) is **PLANNED**, not built — the brief's
own §26 says not to build the complete UI unless it already exists, and only the staff case
does.

## Super Admin security (§20 of the brief)

`super_admin` is `otp_enabled = true` **and** `is_locked = true` in `auth_role_policies`
(pre-existing seed data, confirmed) — meaning login OTP cannot be casually disabled for this
role even by another Super Admin via the settings UI. Combined with this project's step-up
enforcement fix, a `super_admin` session cannot call `assertSuperAdmin`-gated functions
(which is effectively every platform-admin server function — verified 100% coverage,
including reads, in this project) without having completed OTP for that specific session.
Passkeys/hardware keys remain **PLANNED** — Supabase Auth supports WebAuthn natively, so
adding it later doesn't require an architecture change, just enablement.

## Rate limiting / abuse prevention

**Pre-existing (Project 00, unchanged):** login brute-force (`check_login_throttle`/
`record_login_attempt`, 5 attempts / 15-min window per email), OTP resend cooldown + max
attempts, business-slug change rate limit.

**Added in Project 02:** a generic, reusable sliding-window limiter
(`check_rate_limit` RPC + `rate_limit_hits` table, `src/lib/rate-limit.server.ts`), wired
into the four previously-unprotected endpoints Project 00 flagged: `checkEmailHasAccount` /
`checkPhoneHasAccount` (20 requests / 10 min per IP — these intentionally still return
`{exists: boolean}`, since revealing existence at signup-duplicate-check time is normal,
expected UX distinct from the password-reset-enumeration risk the brief warns about
specifically; the fix needed was rate limiting the *volume*, not hiding the boolean),
`checkSignupPassword` (60/10min, generous since it's a benign strength check), and
`createGuestBooking` (5/10min, tighter since it writes real data). All fail open (allow the
request) if the rate-limit check itself errors, so an outage in this table degrades abuse
protection rather than taking down signup/booking.

**Verified via Management API, not fixed:** Supabase's own project-level auth rate limits
(`rate_limit_otp`, `rate_limit_email_sent`, `rate_limit_verify`, `rate_limit_token_refresh`,
etc.) are live and readable with the access token this project was given, but none of them
map cleanly onto "brute-forcing `signInWithPassword` directly against Supabase's REST
endpoint, bypassing this app's own `/auth` page code" — the specific bypass Project 00
flagged. CAPTCHA (hCaptcha) is supported by this Supabase project but currently **disabled**
(`security_captcha_enabled: false`). Enabling it needs a real hCaptcha/Turnstile site+secret
key this session doesn't have, and changes a user-facing flow — a product decision, not a
code gap, so it was **not** enabled unilaterally. Recommended as the standard mitigation for
this residual gap.

## Route protection (§27 of the brief)

`/_authenticated` (the whole customer + business + platform-admin route tree) has
`ssr: false` — confirmed in `src/routes/_authenticated/route.tsx`. This matters: it means
`beforeLoad` for every route in this subtree runs in the browser, not on a server rendering
a response, so "block the route server-side before it renders" isn't the applicable
protection model the way it would be for an SSR app. The real, verified protection boundary
is the **server functions and RLS policies** each page's data-fetching calls into — which is
exactly where this project focused its hardening (step-up enforcement, above) rather than
adding a server-side route guard that `ssr: false` would make largely theatrical.

**Verified in this project:** every `createServerFn` in the platform-admin space
(`platform.functions.ts`, `marketplace.functions.ts`, `reference-data.functions.ts`,
`reserved-slugs.functions.ts`) calls `assertSuperAdmin` — including read-only listing/
overview functions, not just mutations, closing the gap where a non-admin could otherwise
call a "read" server function directly and get data even though the UI would never show it
to them. One gap found and fixed: `getBusinessPrivateContact` (reads a business's private
email/phone) had its own duplicated, unauthenticated-by-step-up inline check instead of
using the shared `assertManages` helper — consolidated.

`/_authenticated` itself does have a real `beforeLoad` guard (checks `supabase.auth.
getSession()`, refreshes if needed, redirects to `/auth` if signed out, redirects to
`/verify-otp` if step-up is pending) — this is real, but as its own code comment already
says, it's an "app-level gate, not token-level" given `ssr: false`; the token itself is
already valid the moment it's issued, hence why the server-side step-up fix above was the
priority, not a route-guard rewrite.

## Account status

`ACTIVE` / `SUSPENDED` maps onto Supabase Auth's native `ban_duration` field
(`setUserSuspended` sets `ban_duration: "876000h"` — effectively permanent — or `"none"` to
restore). **Verified, not assumed:** Supabase Auth itself rejects sign-in for a banned user
at the `signInWithPassword` call — this is Supabase's own enforcement, not something this
codebase has to implement or could accidentally bypass. `ACCOUNT_SUSPENDED`/
`ACCOUNT_REACTIVATED`-equivalent events (`user.suspend`/`user.restore`) were already logged
to `admin_audit_log` before this project. `DELETED` maps onto `deletePlatformUser`
(Super Admin, hard delete via `auth.admin.deleteUser`) and the user's own
`deleteMyAccount`. `PENDING_VERIFICATION` / `DISABLED` as distinct states beyond
Supabase's built-in email-confirmation flag are **not** separately modeled — not needed by
anything built so far.

## Security/audit events

`admin_audit_log` (Project 01's audit foundation, extended — not a second audit system) now
receives, in addition to what already logged before this project (`security.email_changed`,
`security.password_changed`, `security.phone_changed`, `user.suspend`/`user.restore`, slug
changes, business approval/verification): `security.otp_requested`, `security.otp_verified`,
`security.otp_failed` (added in this project, `src/lib/otp.functions.ts`).

**Not added, and why:** `LOGIN_SUCCESS`/`LOGIN_FAILED` are not routed through
`admin_audit_log` — they're already captured in the purpose-built `auth_login_attempts`
table (written by `record_login_attempt`, read by `check_login_throttle`), and duplicating
that into a second table would be exactly the "avoid database duplication" the brief warns
against. `LOGOUT`/`SESSION_REVOKED` are not logged anywhere — genuinely not built, low
value relative to the rest of this project's scope, **PLANNED**.

## Accessibility / i18n / low-internet UX

Not audited or changed in this project. Auth strings already route through the existing
`auth`/`validation`/`errors`/`common` i18n namespaces (confirmed active in Project 00's
audit) — no second translation mechanism was introduced. UI-layer accessibility/low-internet
polish (§28–30 of the brief) was out of this project's practical scope given the depth of
the security work above; **PLANNED**, not claimed as done.

## Email trust & disposable email protection

Added as a Project 02 addendum. Database/configuration-driven, not a hardcoded blacklist:
`email_domain_rules` (domain, `email_domain_category` enum — trusted_free_provider /
business_domain / unknown_domain / disposable_email / blocked_domain / high_risk_domain —
active, reason, source, timestamps), Super-Admin-managed at
`/admin/platform/email-domains`. Seeded with common trusted free providers (Gmail, Outlook,
Yahoo, iCloud, Proton, GMX, etc.) and ~25 well-known disposable-inbox domains, explicitly
documented in the migration as a non-exhaustive starting point, not a permanent list.

**Two-layer enforcement, matching this project's established defense-in-depth pattern:**

1. **`checkEmailDomainAllowed`** (`src/lib/email-trust.functions.ts`) — rate-limited (20/10min
   per IP, reusing Project 02's generic limiter), returns only `{allowed: boolean}` — never
   the specific category, so a public response can't be used to map the internal
   classification (§60.14 of the brief). Wired into all three signup entry points
   (`auth.tsx`, `business/signup.tsx`, `staff/signup.tsx`) directly alongside the existing
   `checkSignupPassword` pre-check, same call pattern. Logs
   `security.disposable_email_rejected` to `admin_audit_log` on rejection — this required
   making `admin_audit_log.actor_id` nullable, since no account/actor exists yet at
   pre-signup time; every existing call site already passes a real actor id and is
   unaffected by the widening.
2. **`handle_new_user()` hard block** — the trigger that fires on every `auth.users` insert
   now rejects `disposable_email`/`blocked_domain` classifications by raising inside the
   trigger, which aborts the whole triggering transaction. **Live-tested against the
   database before trusting it** (this is the single riskiest change in this project — the
   trigger has been revised 6 times in this codebase's history and governs every signup):
   confirmed via `auth.admin.createUser()` that a `mailinator.com` address is rejected with
   zero rows created anywhere (no orphaned `auth.users`/`profiles` row), a `gmail.com`
   address still succeeds normally, and Supabase Auth's GoTrue layer does **not** propagate
   the custom exception message cleanly to the client (it surfaces as a generic "Database
   error creating new user") — confirming the client-side pre-check above is the necessary
   primary UX path, with the trigger as a pure security backstop for anyone who bypasses it.

**Customer vs. business policy (§60.4/§60.5):** identical at the enforcement layer — both
reduce to "not disposable, not blocked." The brief's business-specific asks (stronger trust
tiers for sponsored placement/advanced plans, optional domain verification) are modeled as a
**separate, additive** concept: `business_domain_verifications` (business_id, domain,
method — dns_txt/email/website —, status, token, verified_at) exists as schema foundation
only — no verification method is actually implemented. Per §60.7, domain verification
proving control of a domain is deliberately kept distinct from business
ownership/verification (`businesses.is_verified`, the existing "Verified by Dallty"
marketplace badge) — the two are not merged.

**Explicitly not built, matching the brief's own scoping:** risk scoring (§60.11) — no
progressive LOW/MEDIUM/HIGH risk challenge flow exists, it's a binary allow/block; country-
scoped policy (§60.12) — no consumer exists yet for per-country trusted-provider lists, so
no table was pre-built for it (same "don't build ahead of a consumer" discipline as the rest
of this project); external reputation-provider integration (§60.16) — the classification
table is the whole intelligence layer today, no external API call is made per registration.

## What Project 02 explicitly did NOT build

Per the brief's own "do not build" list: booking engine, availability, payments,
subscriptions, marketplace, sponsorship, affiliates, reviews, CMS, SEO, mobile app, AI —
none of these were touched. Also not built, and explicitly flagged above as PLANNED rather
than silently skipped: RLS-layer (not just server-function-layer) step-up enforcement,
a third Super-Admin-only password tier, passkeys/WebAuthn, CAPTCHA enablement,
LOGOUT/SESSION_REVOKED audit events, a generic (non-staff) invitation system, and
accessibility/i18n/low-internet polish on auth screens.
