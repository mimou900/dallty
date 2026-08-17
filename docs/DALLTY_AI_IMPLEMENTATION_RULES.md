# Dallty — AI Implementation Rules

**Status:** Binding contract for every future implementation prompt/session on this codebase.
**Produced by:** Project 00.

Every future AI implementation prompt on this codebase must follow these rules. They exist
because this is a real, incrementally-built production codebase with a documented history of
careful, additive changes (see `docs/superpowers/specs/` for precedent) — not a greenfield
sandbox that can be freely rewritten.

1. **Read `DALLTY_MASTER_ARCHITECTURE.md`, `DALLTY_DATABASE_ARCHITECTURE.md` (once it
   exists), and `DALLTY_IMPLEMENTATION_ROADMAP.md` first**, every session, before proposing
   or making any change.
2. **Inspect the existing implementation before changing code.** Read the actual current
   file/table/function, not a summary of it from memory or from an older doc. Docs decay;
   the code and the live migrations are the ground truth when they disagree with a doc —
   update the doc, don't trust the stale version.
3. **Identify reusable components/services before building new ones.** Grep first. This
   codebase already has, and you must reuse rather than duplicate: the i18n runtime
   (`src/lib/i18n/`), the slug service (`src/lib/slug-service.ts`), the auth/session layer
   (`src/hooks/use-auth.tsx`, `src/integrations/supabase/auth-middleware.ts`), the storage
   upload helper (`src/lib/storage.ts`), the reference-data hooks
   (`src/lib/reference-data.tsx`), the `assertCanManageBusiness`/`assertSuperAdmin`
   authorization helpers, and the shared `AdminShell` dashboard shell. Also (Project 03): the
   generic rate limiter (`src/lib/rate-limit.server.ts`'s `assertRateLimit`), risk-scored
   security-event logging (`src/lib/security-event.server.ts`'s `logSecurityEvent` — writes
   to `admin_audit_log`, never a second audit table), the idempotency helper
   (`src/lib/idempotency.server.ts`'s `withIdempotency`, for any future booking/payment/
   coupon/refund mutation that must not execute twice), the bot-challenge resolver
   (`src/lib/bot-challenge.server.ts`), and the DB-error sanitizer
   (`src/lib/db-error.server.ts`'s `sanitizeDbError` — use this instead of
   `throw new Error(error.message)` in any new customer/anonymous-facing server function).
4. **Never duplicate existing functionality.** Do not create a second auth system, a second
   i18n system, a second country/currency list, a second permission system, a second
   notification system, a second business model, a second loading/skeleton component, a
   second modal system, or a second server-function/API abstraction. If something looks
   duplicated already (e.g. `assertCanManageBusiness` vs `assertManagesSalon` — flagged in
   the Project 00 audit as parallel, structurally-identical helpers), consolidate it rather
   than adding a third copy.
5. **Never silently change established architecture.** If a change to this document's
   decisions is genuinely needed, say so explicitly and update the doc in the same change —
   don't let code and doc drift apart.
6. **Never introduce country-specific hardcoding when configuration is possible.** No
   `if (country === "DZ")`/`if (lang === "ar")`-style conditionals for anything that varies
   by country or language. The current codebase is clean of the former and has exactly 5
   known instances of the latter (all tied to retiring `dallty-content.ts` — see the master
   architecture doc §K); don't add a sixth.
7. **Never weaken security for convenience.** Do not relax an RLS policy, remove a
   server-side ownership check, or move an authorization decision to the client to make a
   feature ship faster.
8. **Never implement authorization only on the frontend.** Every mutation needs a
   server-side check — a `createServerFn` calling `assertCanManageBusiness`/
   `assertSuperAdmin` or equivalent, or an RLS policy that independently re-derives the same
   check. `hasRole()` client-side is for routing/UI only, never the only gate.
9. **Never create SEO pages without the SEO eligibility system** once that system exists
   (it doesn't yet — see the master doc §L). Until then, don't hand-roll one-off indexable
   pages that bypass the eventual eligibility/recalculation mechanism.
10. **Never create a second translation mechanism.** All UI copy goes through
    `useTranslation(namespace)` and the namespace registry in `src/lib/i18n/namespaces.ts`.
    Adding a new namespace requires a real, immediate consumer — don't pre-create empty
    namespace files "for later" (the `emails`/`metadata` reserved-namespace pattern is the
    correct way to note a future need without building it prematurely).
11. **Never create competing design-system components.** Colors are oklch tokens in
    `src/styles.css` — never hardcode a color in a component. Use the existing shadcn
    primitives in `src/components/ui/` and the composed `src/components/dallty/` components
    before writing a new one. Use CSS logical properties (`start-`/`end-`/`ms-`/`me-`/`ps-`/
    `pe-`), never hardcoded `left-`/`right-` — the business-dashboard code (`admin/staff.tsx`,
    `admin/services.tsx`, `specialist-wizard.tsx`, `admin-shell.tsx`) currently has 6+
    confirmed violations of this rule; fix them opportunistically when touching those files,
    don't add more.
12. **Never modify unrelated working functionality.** A scoped change stays scoped. Don't
    "improve" an adjacent file while implementing something else — flag it instead (as this
    audit did) and let a human decide whether it's worth a separate pass.
13. **Update documentation when architecture changes.** Any change to a table, RLS policy,
    role, permission, or route structure gets reflected in the relevant doc in the same
    change, not as a follow-up someone might forget.
14. **Clearly list files changed** at the end of every implementation session.
15. **Clearly list migrations created** — file name, purpose, and whether it's additive-only
    or includes a backfill.
16. **Clearly list routes added/changed.**
17. **Clearly list permissions added/changed** (once the permission system from
    `DALLTY_DATABASE_ARCHITECTURE.md`/Project 01 exists — until then, list role/RLS-policy
    changes instead).
18. **Clearly list security implications** — new RLS policies, new server functions and what
    they authorize, any change to the auth/session/OTP flow.
19. **Verify the implementation after changes** — `tsc --noEmit`, `eslint .`, a build, and
    (for anything user-visible) an actual browser pass. This codebase has no automated test
    suite (`package.json` has no `test` script) — browser verification is not optional, it's
    the only verification that exists for UI-facing work until a real test suite is added.
20. **Report anything that could not be completed rather than pretending it was completed.**
    Distinguish IMPLEMENTED from PLANNED explicitly in every final report, the way Project
    00 and Project 01 are required to.

## Standing facts every future session should already know

(To avoid re-discovering these from scratch every time — see the master architecture doc for
full detail and citations.)

- The backend entity is `Business`, never `Salon` — the salon→business rename is complete in
  both schema and code (verified, no stale `salon`/`salons` references remain in `src/` or
  live table names), **except** three trigger functions that were missed by that rename and
  reference dropped `salons`/`salon_id` — this is a known, unfixed, live bug (see the master
  doc §E and the Project 00 final report). Fix it, don't rediscover it.
- Ownership is currently a single `businesses.owner_id` column — multi-owner support does
  not exist yet and requires the membership-table work (Project 01).
- Booking has no hold/lock concept and only a narrow (exact-timestamp) double-booking
  guard — treat any booking-adjacent work as touching a known-incomplete concurrency story,
  not a solved one.
- The i18n runtime is real and active; `dallty-content.ts` is legacy and mid-retirement, not
  a system to build on top of.
- Deployment is Lovable Cloud; there is no CI. Don't assume a CI pipeline will catch
  regressions — verify locally before calling something done.
