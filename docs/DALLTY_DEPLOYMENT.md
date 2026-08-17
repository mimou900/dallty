# Dallty — Deployment & Release Foundation

**Status:** Living document. First written 2026-08-17, updated 2026-08-18 after the Lovable
removal project — see [`DALLTY_VENDOR_INDEPENDENCE.md`](DALLTY_VENDOR_INDEPENDENCE.md) for the
full detail on what changed in the build/deploy pipeline itself.

## 1. Architecture (target, per the deployment brief)

```
Claude Code (local dev)
   │
   ▼
feature/*  →  PR  →  CI  →  Vercel Preview  →  human review
   │
   ▼
develop  →  staging  →  human approval
   │
   ▼
main  →  Vercel Production  →  Cloudflare  →  https://dallty.com
```

`main` = production, `develop` = staging/integration, `feature/*` = individual work,
`hotfix/*` = urgent production fixes. Cloudflare stays the authoritative DNS/CDN/WAF layer
in front of Vercel — nameservers are never moved to Vercel.

## 2. Current state (verified 2026-08-18)

- **Git**: real GitHub repository, `git@github.com:mimou900/dallty.git`, `main` branch,
  pushed and up to date. No `develop` branch yet (§3 is still target-state, not built).
- **Supabase**: linked, `supabase/config.toml` has a real `project_id`; migrations in sync
  with the remote database.
- **`.env` hygiene**: real credentials exist in a local, gitignored `.env`, confirmed never
  tracked and absent from git history. `.env.example` holds names only, kept in sync with
  the real key list (see `DALLTY_VENDOR_INDEPENDENCE.md` §5 for the full current inventory).
- **Vercel**: project `dallty` is connected to the GitHub repo via Vercel's native GitHub
  integration and auto-deploys on push to `main`. Build now targets Vercel directly (Nitro's
  `vercel` preset, Build Output API v3) — no more silent Cloudflare-Workers default; see
  `DALLTY_VENDOR_INDEPENDENCE.md` §6. **No environment variables are configured on the Vercel
  project as of this writing** — see §7.
- **Cloudflare**: `dallty.com` zone active, `dallty.com`/`www.dallty.com` DNS records present
  (apex proxied). DNS was not changed as part of this project.
- **CI**: still none — no `.github/workflows` directory. Unchanged gap, tracked in the
  roadmap.
- **Build**: `npm run build` succeeds with **zero** `LOVABLE_*` variables present anywhere
  (confirmed by explicitly unsetting them in the shell and rebuilding) — see
  `DALLTY_VENDOR_INDEPENDENCE.md` for the full verification.
- **Secrets scan**: no committed secret found in the working tree or git history for any
  `.env*` file.

## 3. Branch strategy (target)

| Branch | Purpose | Protection (target) |
|---|---|---|
| `main` | Production — deploys to `https://dallty.com` | Protected, PR required, CI required, no force-push, no deletion |
| `develop` | Staging/integration | CI required, PR preferred |
| `feature/*` | Individual work | None — freely rebased/force-pushed by its author |
| `hotfix/*` | Urgent production fixes | Same protection posture as `main` once merged |

**Not yet created locally** — the repository is still on `master` with no `develop` branch.
Renaming `master` → `main` and creating `develop` are both real, git-history-preserving,
low-risk operations, but were not performed in this pass — see §7 for why.

## 4. Local development

```bash
npm install
npm run dev        # vite dev
npm run build       # production build
npm run lint         # eslint .
npx tsc --noEmit     # type-check (no dedicated script exists; run directly)
```

Supabase is already linked (`supabase/config.toml`); apply new migrations with:

```bash
npx supabase db push --linked
```

Never point local `.env` at a production Supabase project for anything other than the
already-established read/verify workflow this session has used — there is currently only one
Supabase project in play (no separate staging database exists yet, see §6).

## 5. "Publish this version to production" — the procedure

This is the procedure Claude Code will follow when explicitly told to publish to production.
It is **documentation of the process**, not a script — each numbered step is a real action
taken in sequence, with a hard stop at the first failure.

1. `git status` — confirm the working tree.
2. Confirm current branch and exact commit (`git rev-parse HEAD`).
3. List uncommitted changes; **if any are unrelated to the intended release, stop and ask**
   rather than silently including them.
4. Show the exact diff/commit list that would be published.
5. `npx tsc --noEmit` — must pass.
6. `npm run lint` — must pass.
7. `npm run build` — must pass.
8. Run any existing test suite (none exists in this repo today — `package.json` has no
   `test` script; flagged, not fabricated).
9. Re-confirm no secrets are tracked (`git ls-files | grep -i env`, plus a working-tree
   secret-pattern scan).
10. `npx supabase migration list --linked` — confirm local/remote migration history matches,
    and that any new migration was already reviewed for RLS/index/locking impact per §11 of
    the brief.
11. Commit only if there's something real and reviewed to commit — never an automatic
    catch-all `git add -A`.
12. Push to the branch that feeds production (`main`) — only after everything above passed.
13. Confirm the production branch on the hosting side points at the pushed commit.
14. Verify the resulting deployment (status, then a real health check per §8 below).
15. Report the exact deployed commit SHA.

**Nothing in this procedure force-pushes, resets `--hard`, or bypasses hooks.** A failure at
any step stops the whole sequence — no partial/best-effort publish.

## 6. Environments

| Environment | Status |
|---|---|
| Local | Real, working (`npm run dev`, linked to the single existing Supabase project) |
| Preview | Target: Vercel PR previews. **Unconfirmed** — no verified Vercel project access this session (§7) |
| Staging | **Does not exist yet.** No separate `develop`-deployed environment, no separate Supabase project. Documented here as the honest next infrastructure step, not invented as a shortcut, per the brief's own §22 instruction |
| Production | Target: `https://dallty.com` via Vercel + Cloudflare. **Unconfirmed** — no verified access this session (§7) |

Only one Supabase project exists in this environment and is used for all current
development/verification work. There is no database-level separation between "local
development" and "production" today — this is a real, honestly-documented gap, not a
security control this task silently assumed away.

## 7. Remaining blocker — Vercel environment variables

GitHub, Vercel, and Cloudflare access were all established in a prior session (native
dashboard/browser-driven access, not API tokens) — the hard credential blocker that used to
live in this section is resolved. The one real blocker left:

**No environment variables are configured on the Vercel project.** This assistant can name
the required variables (see `DALLTY_VENDOR_INDEPENDENCE.md` §5 for the full current list —
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OTP_HMAC_SECRET`,
`VITE_SUPABASE_*`, `VITE_GOOGLE_MAPS_*`, and optionally `RESEND_API_KEY`/
`SUPABASE_AUTH_EMAIL_HOOK_SECRET`/`GOOGLE_MAPS_API_KEY` for the features that need them) but
cannot type secret values into Vercel's dashboard — that is deliberately left to the
developer. Until they're set, the Vercel deployment cannot serve real Supabase-backed
requests, independent of the Lovable removal (the removal fixes the *crash*; it doesn't
supply credentials that were never in this environment to begin with).

## 8. Health check (once production access exists)

`/`, sign-in/registration, a public business page, `/search`, the booking flow (view-only —
never create a real booking/payment against production data), customer dashboard, business
dashboard, `/admin`, localized routes (en/fr/ar, RTL rendering), `robots.txt`, sitemap,
canonical URL, HTTPS, Supabase connectivity, and absence of 5xx responses on the pages above.
Not performed this session — no deployed production URL was reachable/confirmed.

## 9. Rollback (documented, not yet exercised)

Application rollback: redeploy a previously known-good commit/Vercel deployment — never
`git reset --hard` + force-push as the normal mechanism. Database rollback is a separate
operation from application rollback and is never automatic — a migration is never
auto-reversed as part of an application rollback.

## 10. Security posture carried into this task (unchanged)

RLS, server-side authorization, rate limiting, anti-bot/anti-scraping, and booking-concurrency
protections are all implemented at the application/database layer (Projects 01–08) and are
untouched by this task — this was infrastructure/deployment work only, no application logic
was modified, per the brief's own §26 instruction.
