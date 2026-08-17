# Dallty — Deployment & Release Foundation

**Status:** Living document. First written during the production deployment infrastructure
task, 2026-08-17. Reflects what was **verified** in this environment, not what the target
infrastructure is assumed to look like — several sections are marked BLOCKED because this
environment has no working credentials for GitHub's API, Vercel, or Cloudflare (see §7).

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

## 2. Current state (verified in this environment, 2026-08-17)

- **Git**: a real, local repository (`.git` present, real commit history — 100+ commits).
  Current branch: **`master`**, not `main`. `git remote -v` returns **empty** — no remote is
  configured on this machine at all, despite the brief's description of an existing GitHub
  repository. No tags exist.
- **Working tree**: substantial uncommitted work across many files and ~19 untracked
  migration files, spanning multiple completed feature projects done in this environment
  this session. Nothing has been committed to git during any of that work.
- **Supabase**: correctly linked — `supabase/config.toml` contains a real `project_id`
  matching the project this session has been applying migrations to directly via
  `supabase db push --linked`. All migrations present locally are confirmed in sync with the
  remote database (`supabase migration list --linked` shows zero mismatches as of the last
  check).
- **`.env` hygiene**: real credentials exist in a local, gitignored `.env` (confirmed never
  tracked, confirmed absent from git history via `git log --all --full-history -- .env`).
  `.gitignore` correctly excludes `.env`, `.env.*`, with an explicit `!.env.example`
  carve-out. **`.env.example` did not exist before this task — created** (variable names
  only, matching the real `.env`'s key list; no values).
- **Vercel**: **no local link** — no `.vercel/` directory, no `vercel.json`. This is not
  necessarily a problem (Vercel's GitHub-App integration doesn't require a local link file),
  but it means nothing in this environment can independently confirm the Vercel project's
  existence, its settings, or that it's actually connected to this repository.
- **Cloudflare**: no local configuration exists to inspect (Cloudflare has no local project
  file analogous to `supabase/config.toml` — its configuration lives entirely in the
  dashboard/API).
- **CI**: no `.github/workflows` directory — no CI configured today.
- **Build**: `npm run build` (`vite build`) succeeds cleanly in this environment. No `engines`
  field is declared in `package.json` (Node 22.23.2 was used locally; Vercel's default Node
  version should be pinned explicitly once the project is confirmed reachable — see §7).
- **Secrets scan**: no committed secret was found in the working tree or in git history for
  any `.env*` file. No hardcoded API keys, tokens, or credentials were found via source
  review during this and prior sessions' work.

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

## 7. BLOCKED — requires the developer's own access

This environment has **no working credentials** for GitHub's API, Vercel, or Cloudflare:

- No `gh` CLI installed, no `GITHUB_TOKEN`/`VERCEL_TOKEN`/`CLOUDFLARE_API_TOKEN` in the
  environment.
- A local SSH key (`~/.ssh/id_ed25519`) is registered with GitHub and authenticates
  successfully — but as a **different** account than the repository owner named in the
  brief. Read-only `git ls-remote git@github.com:mimou900/dallty.git` fails with
  `ERROR: Repository not found` using that key — meaning either the repository doesn't exist
  at that exact path, or the authenticated account has no access to it (GitHub returns the
  same generic error for both cases on a private repo, by design).
- Opening `vercel.com` and `dash.cloudflare.com` in the browser available to this session
  shows sign-in pages — no authenticated session for either.

**This is a real, hard blocker for sections 2, 3 (branch protection/CI on GitHub), 12
(Vercel), 13–16 (Cloudflare/DNS/domain), 19–21 (CI/CD, Vercel previews) of the brief — none
of that can be safely inspected or configured without one of:**

1. A GitHub personal access token (repo scope) for the account that actually owns/has access
   to the private `dallty` repository, so `gh`/API calls can inspect and configure branch
   protection, Actions, secrets.
2. A Vercel token (or the developer driving an authenticated browser session) to inspect the
   existing project's settings, environment variables, and domain configuration.
3. A Cloudflare API token (or an authenticated dashboard session) scoped to the `dallty.com`
   zone, to safely inspect existing DNS records before touching any of them (per the brief's
   own §15/§28 — DNS must never be guessed).

**Nothing was pushed, force-pushed, or otherwise mutated toward GitHub/Vercel/Cloudflare in
this session, precisely because none of it could be done safely without real visibility into
the current state first** — this matches the brief's own §28 STOP conditions (DNS
ambiguity, a domain possibly belonging to another account, deployment configuration that
can't be verified) more than it matches a simple missing-value gap.

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
