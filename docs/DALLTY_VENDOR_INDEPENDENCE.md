# Dallty — Vendor Independence (Lovable Removal)

**Status:** Living document. Produced by the Lovable-removal project, 2026-08-18.
**Read this first:** this project was originally scaffolded and, until this change, partly
run through Lovable's platform (`lovable.dev`). This document records every real Lovable
runtime/build dependency found, what replaced it, and what remains manual/deferred. Nothing
here was guessed — every claim was verified by reading code, running the build, or hitting a
real endpoint.

## 1. Dependencies discovered (full audit)

| # | Dependency | Category | Real or cosmetic? |
|---|---|---|---|
| 1 | `@lovable.dev/email-js` (`createAuthEmailHandler`) in `src/routes/lovable/email/auth/webhook.ts` | A — Runtime | **Real, and the production crash's root cause.** Threw synchronously at module load if `LOVABLE_API_KEY` was unset; TanStack Start loads all route modules for every request, so this crashed the whole app. |
| 2 | `@lovable.dev/email-js` (`sendLovableEmail`) in `src/lib/email-templates/send-email.ts` | A — Runtime | Real. Used by the notification engine (booking/payment emails) and business-status emails — live code path, not dead. |
| 3 | `@lovable.dev/cloud-auth-js` in `src/integrations/lovable/index.ts` | A — Runtime | Real but dormant: only reachable from a Google OAuth button gated behind `SHOW_OAUTH_BUTTONS = false`. |
| 4 | `connector-gateway.lovable.dev` (Google Routes API proxy) in `src/lib/geo.functions.ts` | A — Runtime | Real. Live server function (`getTravelTimes`), called from the customer-facing "near me" travel-time feature. |
| 5 | `/__l5e/assets-v1/...` logo asset path (`src/assets/*.png.asset.json`) | I — Third-party service via Lovable | **Real and previously invisible.** The logo `<img>` tags pointed at a Lovable-managed R2-backed asset CDN path. It only "worked" because `dallty.com`'s DNS still resolves to Lovable's hosting today — on Vercel this path would 404 (nothing serves it). Not part of the original 5 categories in the brief; found by reading the built bundle, not assumed. |
| 6 | `@lovable.dev/vite-tanstack-config` in `vite.config.ts` | B — Build dependency | Real. Also silently defaulted Nitro's build target to `cloudflare-module` outside Lovable's own sandbox — the wrong target for Vercel, independent of the crash. |
| 7 | `@lovable.dev/webhooks-js` | B — Build dependency (transitive) | Real npm dependency, but its only use was inside `email-js`'s webhook verification; never imported directly. |
| 8 | `window.__lovableEvents` / `window.__lovableReportRuntimeError` in `src/lib/lovable-error-reporting.ts` | D — UI/dev artifact | Real but silently no-op outside Lovable's editor preview — meant client errors were never observed in real production at all. |
| 9 | `.lovable.app` entry in `safeOrigin()`'s `ALLOWED_HOSTS` (`src/lib/staff-access.server.ts`) | D — UI/dev artifact | Real but low-impact: widened a redirect-target allowlist to include Lovable's own preview domain. |
| 10 | `LOVABLE_API_KEY`, `LOVABLE_SEND_URL` env vars | E — Environment variable | Real, consumed by #1–#3 above. |
| 11 | `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`, `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID` | E — Environment variable (naming only) | Cosmetic — held a real, already-direct Google Maps browser key; Maps JS API was always loaded straight from `maps.googleapis.com`, never through Lovable. Renamed only. |
| 12 | `"Connect Supabase in Lovable Cloud"` string in 3 Supabase client files | F — Documentation/cosmetic | Cosmetic error-message text; zero functional coupling. |
| 13 | `AGENTS.md`'s Lovable git-sync warning | F — Documentation | **Left in place.** Governs *this assistant's* git behavior in a repo that may still have Lovable's git-sync connected; not app runtime, out of scope for removal. |
| 14 | Historical mentions in `docs/DALLTY_DATABASE_ARCHITECTURE.md`, `docs/superpowers/plans/...` | F — Documentation (historical) | Left as-is — genuine past-tense facts about how this project was built, not current-state claims. |
| 15 | `bunfig.toml`'s `minimumReleaseAgeExcludes` list | G — Dead/unused config | Real but inert once the packages were removed from `package.json`. Cleaned up. |
| 16 | `.lovable/` directory (`project.json` scaffold stamp + `plan.md` feature-planning doc), tracked in git at repo root | D — UI/dev artifact (Lovable editor's own local state) | Real, previously missed by name-only greps because it's a dot-directory. Not read by any app/build code — confirmed by grepping `src/`, `vite.config.ts`, and every script for `.lovable/` (zero hits) before removing it. `project.json` was a pure template/revision stamp (deleted); `plan.md` documented a real, already-shipped feature (site header/bottom-nav restructuring) and was preserved at `docs/archive/lovable-site-header-plan.md` with a HISTORICAL marker rather than deleted outright. |
| 17 | `bun.lock` (tracked in git) | B — Build dependency (lockfile) | **Real and more than cosmetic.** Still listed all 4 `@lovable.dev/*` packages, and — more significantly — resolved dozens of *unrelated* packages (e.g. `@react-email/*`) through Lovable's own private npm registry mirror (`europe-west4-npm.pkg.dev/lovable-core-prod/...`), which isn't reachable or credentialed outside Lovable's infrastructure. `package-lock.json` (npm) is the lockfile actually used by every verified build in this project (local and Vercel) and was already clean. `bun` isn't installed in this environment, so `bun.lock` couldn't be safely regenerated — it was deleted rather than left stale and wrong. If bun support is wanted going forward, someone with `bun` installed should run `bun install` fresh against the current `package.json` to produce a clean lockfile. |

## 2. Why each existed

Lovable's platform provides, for projects built inside its editor: a hosted transactional-email
send API + branded auth-email templates wired via a webhook (#1, #2), an OAuth proxy that hands
back Supabase-compatible tokens (#3), a server-side proxy in front of Google's Routes API so a
Google Cloud key never has to live in the app's own env (#4), an R2-backed asset CDN for
uploaded images so users don't need their own storage bucket (#5), a Vite config wrapper that
wires up TanStack Start + Nitro + sandbox-preview plumbing in one call (#6, #7), and dev-only
error-reporting hooks that surface runtime errors inside the Lovable editor's UI (#8). None of
this is malicious or unusual — it's exactly what a "batteries-included" builder platform
provides. The problem is architectural: business logic called these directly, so the app
could not run — at all — anywhere Lovable's own infrastructure wasn't present.

## 3 & 4. Replacement + provider abstraction

Business logic now depends only on small Dallty-owned interfaces; concrete vendors are
implementation details behind them:

| Concern | Dallty abstraction | Concrete implementation today |
|---|---|---|
| Transactional email | `EmailProvider` (`src/lib/email/email-provider.ts`) | `ResendEmailProvider` if `RESEND_API_KEY` is set, else `NullEmailProvider` (logs + records failure, never crashes or fakes success) |
| Supabase auth email hook | Standard Webhooks verification (`src/lib/webhooks/standard-webhook.ts`, generic HMAC-SHA256, no vendor SDK) + `EmailProvider` | `src/routes/auth/email-hook.ts` |
| OAuth sign-in | Supabase Auth's own `signInWithOAuth` | Called directly in `src/routes/auth.tsx`; no intermediary |
| Maps (browser) | — (no abstraction needed) | Direct `maps.googleapis.com` load, unchanged (`src/lib/maps-loader.ts`) |
| Maps (travel time) | — (no abstraction needed) | Direct call to Google's real Routes API (`routes.googleapis.com`), `src/lib/geo.functions.ts` |
| Logo/brand assets | — (no abstraction needed) | Real bundled files, `src/assets/dallty-mark.png` / `dallty-wordmark.png` |
| Client error reporting | `reportClientError` (`src/lib/client-error-reporting.ts`) | Structured `console.error` (no tracking service exists yet — see §13) |

Swapping any provider later (e.g. Resend → Postmark, or adding Sentry) means writing one new
file behind the existing interface — no caller changes.

## 5. Environment variables

**Server-only (never exposed to the browser):**

| Variable | Purpose | Status |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN` | Supabase server access | Unchanged |
| `OTP_HMAC_SECRET` | OTP step-up hashing | Unchanged |
| `RESEND_API_KEY` | Email provider | **New.** Not set in this environment — `NullEmailProvider` is active until it is. |
| `SUPABASE_AUTH_EMAIL_HOOK_SECRET` | Standard Webhooks secret for `/auth/email-hook` | **New.** Not set — the hook isn't enabled in Supabase yet (see §12). |
| `GOOGLE_MAPS_API_KEY` | Server-side Google Routes API key | Renamed from a var that never actually existed in `.env` (confirmed absent before this change too — `getTravelTimes` already threw "not connected" either way). Not a regression. |

**Browser-safe (`VITE_`-prefixed):**

| Variable | Purpose | Status |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase client access | Unchanged |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Maps JS API key | Renamed from `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` — **same value**, purely a naming fix |
| `VITE_GOOGLE_MAPS_TRACKING_ID` | Maps usage-tracking channel | Renamed from `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID` — same value |

**Removed (zero remaining consumers, confirmed by repo-wide grep before deletion):**
`LOVABLE_API_KEY`, `LOVABLE_SEND_URL`.

`.env.example` and the real local `.env` were both updated to match; no secret **values** are
committed anywhere (`.env` stays gitignored, `.env.example` holds names only).

## 6. Vercel architecture

`vite.config.ts` no longer wraps `@lovable.dev/vite-tanstack-config`. It calls Vite's own
`defineConfig` directly with: `@tailwindcss/vite`, `vite-tsconfig-paths`,
`@tanstack/react-start`'s `tanstackStart()` plugin (with the same `importProtection` rule the
wrapper set — `**/server/**` and the `server-only` package can never reach the client bundle),
`@vitejs/plugin-react`, and — **build-only** — Nitro's own `vercel` preset. That preset emits
Vercel's Build Output API v3 directly (`.vercel/output/config.json`, `.vercel/output/functions/
__server.func/...`, `.vercel/output/static/...`), which Vercel's platform consumes without
needing a hand-written `vercel.json`. Confirmed by a real build: this used to also emit an
unused `wrangler.json`/`.wrangler/` (the wrapper's silent Cloudflare-Workers default outside
Lovable's own sandbox) — that's gone now.

The Nitro plugin is deliberately **build-only** (`command === "build"`): adding it during
`vite dev` breaks the dev server (`NitroViteError: Vite environment "nitro" is unavailable`,
confirmed by testing) — the original wrapper gated it the same way, for the same reason.

## 7. Supabase architecture

Unchanged in shape, confirmed still the sole backend: Postgres + Auth + Storage + Realtime,
accessed directly via `SUPABASE_URL`/keys, no intermediary. The Supabase Auth "Send Email"
hook config was inspected live via the Management API and confirmed `hook_send_email_enabled:
false` — meaning real users currently receive Supabase's own default (unbranded) auth emails,
and the new `/auth/email-hook` route (§12) has zero live traffic today, by design.

## 8. Cloudflare architecture

Unchanged: Cloudflare remains the DNS/CDN/security layer in front of Vercel. Flow:
`Browser → Cloudflare → Vercel → Dallty → Supabase / Resend / Google`. No DNS records were
touched by this project.

## 9. Email architecture

Two independent email surfaces, both now Dallty-owned:

1. **Transactional/notification email** (`src/lib/email-templates/send-email.ts`, used by the
   booking/payment notification engine and business-status emails): renders a React-Email
   template, then calls `getEmailProvider().send()`. Real code path, live today, using
   whichever provider is configured (currently `NullEmailProvider` — see §5).
2. **Supabase auth emails** (signup/recovery/magic-link/invite/email-change/reauthentication):
   `src/routes/auth/email-hook.ts` — a Supabase-native "Send Email" hook, Standard Webhooks
   HMAC-verified, rendering the same pre-existing React-Email templates
   (`src/lib/email-templates/{signup,recovery,magic-link,invite,email-change,reauthentication}.tsx`).
   **Not live** — see §12.

Both paths fail soft: an unconfigured or failing provider logs a structured error and returns
a normal `{ sent: false, reason }` result; nothing throws, nothing crashes a booking or auth
transaction.

## 10. Maps architecture

Unchanged for the browser (Maps JS API loads directly from `maps.googleapis.com`, business
location picker/GPS/geolocation/address search all untouched). The one real backend change:
`getTravelTimes` (`src/lib/geo.functions.ts`) now calls Google's real Routes API
(`routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`) directly with a single
`X-Goog-Api-Key` header, instead of Lovable's connector-gateway proxy (which required both a
Lovable API key and a separate connector key). Functionally identical request/response shape;
one fewer credential needed.

## 11. Deployment architecture

`main` → GitHub → Vercel (auto-deploy, Nitro `vercel` preset) → Cloudflare → `dallty.com`.
No Lovable step anywhere in that chain. `AGENTS.md`'s warning about Lovable git-sync was
deliberately left in place (§1, row 13) since it governs this assistant's own git behavior,
not the app.

## 12. Rollback

- **Application:** redeploy a previous Vercel deployment, as always — nothing about this
  change affects that mechanism.
- **This specific change**, if something is found wrong post-deploy: `git revert` the commit(s)
  from this work restores `@lovable.dev/*`, but note the *crash* (an unset `LOVABLE_API_KEY`
  breaking every request via eager module-load) would return with it — reverting is a real
  regression, not a safe fallback, given the original bug this work fixes.
- **Auth email hook:** never auto-enabled. If `/auth/email-hook` ever misbehaves after being
  turned on in Supabase's dashboard, disable `hook_send_email_enabled` there — Supabase falls
  straight back to its own default mailer, exactly like today.

## 13. Future provider-replacement strategy

Because callers depend only on `EmailProvider`/Standard Webhooks/direct Google APIs — never a
vendor SDK — swapping any of them is a one-file change:

- **Email provider:** implement `EmailProvider` (`send()` returning the same
  `SendEmailResult` union) in a new class, point `getEmailProvider()` at it.
- **Error tracking:** `reportClientError` is the single call site; wiring in a real service
  (Sentry, etc. — none exists today, see `DALLTY_IMPLEMENTATION_ROADMAP.md` phase 22) means
  editing one function body, not touching any of its ~1 caller.
- **Payments/Storage/Analytics:** none of these were ever routed through Lovable in this
  codebase (confirmed by the audit in §1) — `PaymentProvider` already exists as an
  interface-only abstraction from the Financial Architecture project; no Lovable coupling to
  remove there.

## What this document is not

Not a feature redesign. Booking, marketplace, payments, localization, SEO, and the business
dashboard are byte-for-byte unchanged except where removing a Lovable dependency required it
(the auth-email send mechanism, the OAuth call, the Maps travel-time call, the logo asset
source, and the build config). No new abstraction was added beyond what direct provider
replacement required.
