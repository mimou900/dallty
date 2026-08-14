# Business Slugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UUID-based business URLs (`/business/<uuid>`) with slug-based URLs (`/business/<slug>`), with permanent redirect history, Super-Admin-manageable reserved words, and a reusable slug engine other entities can adopt later.

**Architecture:** Two new tables (`business_slug_redirects`, `reserved_slugs`) plus `businesses.slug`/`slug_source` columns, a generic `src/lib/slug-service.ts` module, a dedicated `updateBusinessSlug` server function with rate-limiting/locking, and a route restructure where the canonical business route resolves slugs (with a `beforeLoad` redirect branch for retired slugs) while a separate legacy route handles old UUID links. All server-side mutations use the existing `adminClient()`/`assertCanManageBusiness`/`assertSuperAdmin` patterns already established in this codebase.

**Tech Stack:** TanStack Start (React, file-based routing, `createServerFn` RPCs), Supabase (Postgres + RLS), TypeScript, Zod.

**Spec:** `docs/superpowers/specs/2026-08-14-business-slugs-design.md` (program context in `docs/superpowers/specs/2026-08-14-localization-program-notes.md`)

## Global Constraints

- Slugs: 3–60 chars, `a-z0-9-` only, no `--`, no leading/trailing `-`.
- No transliteration of non-Latin names — unusable input falls back to `business-<random hex>`.
- Owner slug changes: max 3 per rolling 30 days, plus a 24-hour lock after any change. Both exempt for Super Admin's `admin_correction` path.
- Renaming a business's `name` never changes its `slug` automatically.
- Every retired slug is kept forever in `business_slug_redirects` — never deleted, never reused.
- Redirect resolution always goes `old_slug → business_id → current businesses.slug` (a fresh lookup every time) — never chains through old redirect rows.
- Redirects use `statusCode: 301` (confirmed available on TanStack Router's `redirect()` — see Task 5).
- `beforeLoad`/route-level code runs in the browser bundle too (isomorphic) — never import `supabaseAdmin` (service-role client) there; only the plain `supabase` (anon) client, exactly like `src/lib/post-login.ts`'s existing `resolveLanding` does from `bookings.tsx`'s `beforeLoad`.
- No test framework in this codebase. Verification is `tsc --noEmit` / `eslint .` / direct SQL query / browser walkthrough via the preview tools, matching every prior sub-project.
- Live Supabase DB connection string for verification queries: `postgresql://postgres:6sXrwCwvFt1KLO9n@db.cbacaplvcxytzclpiyir.supabase.co:5432/postgres`. Apply multi-statement migration files via `npx supabase db query -f <file> --db-url "..."` wrapped in a `DO $outer$ BEGIN ... END $outer$;` block for execution (the committed migration file itself stays clean top-level SQL); single statements via `npx supabase db query "<sql>" --db-url "..."`.
- Dev server: Browser pane preview tools, name `dallty-dev`, port 8080.
- Never edit historical migration files — only add new forward-only ones.

---

### Task 1: Migration — schema, RLS, RPC, atomic backfill

**Files:**
- Create: `supabase/migrations/20260814070000_business_slugs.sql`

**Interfaces:**
- Produces: `businesses.slug` (text, NOT NULL, UNIQUE after this migration), `businesses.slug_source` (text, `'auto'|'custom'`), `reserved_slugs` table, `business_slug_redirects` table, `bump_slug_redirect_hit(_old_slug text)` RPC.

- [ ] **Step 1: Write the migration file**

```sql
-- Business Slugs (Project 1 of the Dallty Localization initiative).
-- Replaces UUID-based /business/<uuid> URLs with /business/<slug>, with
-- permanent redirect history and Super-Admin-managed reserved words.

ALTER TABLE public.businesses
  ADD COLUMN slug text,
  ADD COLUMN slug_source text NOT NULL DEFAULT 'auto'
    CHECK (slug_source IN ('auto', 'custom'));

CREATE TABLE public.reserved_slugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reserved_slugs TO service_role;
ALTER TABLE public.reserved_slugs ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: every access goes through server functions
-- using the service-role admin client (matches auth_role_policies' convention).

INSERT INTO public.reserved_slugs (slug, reason) VALUES
  ('admin', 'system route'), ('api', 'reserved namespace'), ('auth', 'system route'),
  ('login', 'system route'), ('logout', 'reserved namespace'), ('signup', 'reserved namespace'),
  ('register', 'reserved namespace'), ('oauth', 'reserved namespace'), ('verify-otp', 'system route'),
  ('reset-password', 'system route'), ('dashboard', 'system route'), ('settings', 'system route'),
  ('help', 'reserved namespace'), ('support', 'reserved namespace'), ('about', 'reserved namespace'),
  ('pricing', 'reserved namespace'), ('blog', 'reserved namespace'), ('book', 'system route'),
  ('search', 'system route'), ('categories', 'system route'), ('business', 'system route'),
  ('business-id', 'system route'), ('legacy', 'reserved namespace'), ('salon', 'legacy terminology'),
  ('staff', 'system route'), ('account', 'system route'), ('availability', 'system route'),
  ('bookings', 'system route'), ('favorites', 'system route'), ('profile', 'system route'),
  ('reschedule', 'system route'), ('appointments', 'system route'), ('calendar', 'system route'),
  ('customers', 'system route'), ('marketplace', 'system route'), ('notifications', 'system route'),
  ('payments', 'system route'), ('reports', 'system route'), ('reviews', 'system route'),
  ('services', 'system route'), ('terms', 'reserved namespace'), ('privacy', 'reserved namespace'),
  ('contact', 'reserved namespace'), ('www', 'reserved namespace'), ('static', 'reserved namespace'),
  ('assets', 'reserved namespace'), ('uploads', 'reserved namespace'), ('images', 'reserved namespace'),
  ('media', 'reserved namespace'), ('cdn', 'reserved namespace'), ('robots.txt', 'reserved namespace'),
  ('favicon.ico', 'reserved namespace'), ('sitemap.xml', 'reserved namespace'), ('feed', 'reserved namespace'),
  ('rss', 'reserved namespace'), ('graphql', 'reserved namespace'), ('health', 'reserved namespace'),
  ('status', 'reserved namespace');

CREATE TABLE public.business_slug_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  old_slug text NOT NULL,
  new_slug text NOT NULL,
  redirect_type text NOT NULL
    CHECK (redirect_type IN ('owner_rename', 'admin_correction', 'collision_resolved')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz
);
CREATE UNIQUE INDEX business_slug_redirects_old_slug_idx ON public.business_slug_redirects (old_slug);
CREATE INDEX business_slug_redirects_business_id_idx ON public.business_slug_redirects (business_id);

-- Anonymous visitors following an old link need to resolve it -- but not see
-- who changed it or why, matching the audit-log-style restriction used
-- elsewhere in this app.
GRANT SELECT (id, business_id, old_slug, new_slug, created_at)
  ON public.business_slug_redirects TO anon, authenticated;
GRANT ALL ON public.business_slug_redirects TO service_role;
ALTER TABLE public.business_slug_redirects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_slug_redirects_select" ON public.business_slug_redirects FOR SELECT USING (true);
-- No insert/update/delete policies: every mutation goes through
-- updateBusinessSlug (service-role admin client) or the
-- bump_slug_redirect_hit RPC below.

-- Cross-table uniqueness: a slug can never be both a live businesses.slug and
-- a retired old_slug at once.
CREATE OR REPLACE FUNCTION public.check_business_slug_not_retired() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.business_slug_redirects WHERE old_slug = NEW.slug
  ) THEN
    RAISE EXCEPTION 'slug "%" is retired and cannot be reused', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER businesses_slug_not_retired
  BEFORE INSERT OR UPDATE OF slug ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.check_business_slug_not_retired();

CREATE OR REPLACE FUNCTION public.check_redirect_slug_not_live() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.businesses WHERE slug = NEW.old_slug) THEN
    RAISE EXCEPTION 'slug "%" is currently live and cannot be retired under a different business', NEW.old_slug;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_slug_redirects_not_live
  BEFORE INSERT ON public.business_slug_redirects
  FOR EACH ROW EXECUTE FUNCTION public.check_redirect_slug_not_live();

-- Narrow, anonymous-callable counter bump for redirect analytics -- the table
-- grants no UPDATE to anon/authenticated, so this SECURITY DEFINER RPC is the
-- only way to record a hit (matches the check_promo_code convention).
CREATE OR REPLACE FUNCTION public.bump_slug_redirect_hit(_old_slug text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.business_slug_redirects
  SET hit_count = hit_count + 1, last_hit_at = now()
  WHERE old_slug = _old_slug;
$$;
REVOKE ALL ON FUNCTION public.bump_slug_redirect_hit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_slug_redirect_hit(text) TO anon, authenticated;

-- Atomic backfill: every existing business gets a slug before the column
-- becomes NOT NULL + UNIQUE below. Mirrors src/lib/slug-service.ts's
-- slugify() algorithm; dropped once the backfill is done -- one-off
-- migration logic doesn't stay as permanent DB surface.
CREATE OR REPLACE FUNCTION public._backfill_business_slug(p_name text, p_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  base text;
  candidate text;
  suffix int := 1;
BEGIN
  base := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  IF base IS NULL OR length(base) < 3 OR base !~ '[a-z]' THEN
    base := 'business-' || substr(p_id::text, 1, 8);
  END IF;
  candidate := base;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.businesses WHERE slug = candidate
    ) AND NOT EXISTS (
      SELECT 1 FROM public.business_slug_redirects WHERE old_slug = candidate
    );
    suffix := suffix + 1;
    candidate := base || '-' || suffix;
  END LOOP;
  RETURN candidate;
END;
$$;

UPDATE public.businesses
SET slug = public._backfill_business_slug(name, id)
WHERE slug IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.businesses WHERE slug IS NULL) > 0 THEN
    RAISE EXCEPTION 'business slug backfill left NULL rows -- aborting migration';
  END IF;
END;
$$;

DROP FUNCTION public._backfill_business_slug(text, uuid);

ALTER TABLE public.businesses
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT businesses_slug_unique UNIQUE (slug);
CREATE UNIQUE INDEX businesses_slug_lower_idx ON public.businesses (lower(slug));
```

- [ ] **Step 2: Apply the migration to the live DB**

Wrap the file in a `DO $outer$ BEGIN ... END $outer$;` block (required because `supabase db query -f` only supports single statements) and apply:

```bash
node -e "
const fs = require('fs');
const sql = fs.readFileSync('supabase/migrations/20260814070000_business_slugs.sql', 'utf8');
fs.writeFileSync('/tmp/wrapped_business_slugs.sql', 'DO \$outer\$ BEGIN\n' + sql + '\nEND \$outer\$;');
"
npx supabase db query -f /tmp/wrapped_business_slugs.sql --db-url "postgresql://postgres:6sXrwCwvFt1KLO9n@db.cbacaplvcxytzclpiyir.supabase.co:5432/postgres"
```

Expected: no errors. If the `DO` block fails, fix the migration file (not the wrapped copy) and retry.

- [ ] **Step 3: Verify against the live DB**

```bash
npx supabase db query "select id, name, slug, slug_source from businesses order by created_at;" --db-url "postgresql://postgres:6sXrwCwvFt1KLO9n@db.cbacaplvcxytzclpiyir.supabase.co:5432/postgres"
```
Expected: all 5 seed businesses have a non-null, unique `slug` and `slug_source = 'auto'`. "thorbarber" → `thorbarber`, "The Gentleman Room" → `the-gentleman-room`, "Rosé Nail Studio" → `rose-nail-studio`, "Amber Spa & Wellness" → `amber-spa-wellness`, "Maison Vert" → `maison-vert`.

```bash
npx supabase db query "select count(*) from reserved_slugs where active = true;" --db-url "postgresql://postgres:6sXrwCwvFt1KLO9n@db.cbacaplvcxytzclpiyir.supabase.co:5432/postgres"
```
Expected: 58.

```bash
npx supabase db query "select proname from pg_proc where proname = '_backfill_business_slug';" --db-url "postgresql://postgres:6sXrwCwvFt1KLO9n@db.cbacaplvcxytzclpiyir.supabase.co:5432/postgres"
```
Expected: zero rows (the temporary helper was dropped).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814070000_business_slugs.sql
git commit -m "feat: add business slugs schema, redirect history, reserved words"
```

---

### Task 2: Generic slug service module

**Files:**
- Create: `src/lib/slug-service.ts`

**Interfaces:**
- Consumes: `Database` type from `@/integrations/supabase/types` (regenerated/hand-patched in Task 3).
- Produces: `slugify(name: string): { value: string; usable: boolean }`, `validateSlugFormat(slug: string): { valid: boolean; error?: SlugValidationError }`, `isReservedSlug(supabase, slug): Promise<boolean>`, `resolveUniqueSlug(params): Promise<string>` — all consumed by Task 3 (`registerBusiness`) and Task 4 (`updateBusinessSlug`).

- [ ] **Step 1: Write the module**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/**
 * Turns a name into a URL slug. Latin names slugify directly; non-Latin
 * names (e.g. Arabic-only) are deliberately NOT transliterated -- there is
 * no universally correct transliteration, so `usable: false` signals the
 * caller to fall back to a random identifier instead of guessing.
 */
export function slugify(name: string): { value: string; usable: boolean } {
  const stripped = name
    .normalize("NFC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC");
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { value: slug, usable: slug.length >= 3 && slug.length <= 60 && /[a-z]/.test(slug) };
}

export type SlugValidationError =
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "consecutive_hyphens"
  | "leading_or_trailing_hyphen";

/** Format rules only -- does not check reservation or uniqueness. */
export function validateSlugFormat(slug: string): { valid: boolean; error?: SlugValidationError } {
  if (slug.length < 3) return { valid: false, error: "too_short" };
  if (slug.length > 60) return { valid: false, error: "too_long" };
  if (!/^[a-z0-9-]+$/.test(slug)) return { valid: false, error: "invalid_characters" };
  if (slug.includes("--")) return { valid: false, error: "consecutive_hyphens" };
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return { valid: false, error: "leading_or_trailing_hyphen" };
  }
  return { valid: true };
}

/** Checks the Super-Admin-managed reserved word list. Case-insensitive. */
export async function isReservedSlug(supabase: AnySupabase, slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("reserved_slugs")
    .select("id")
    .eq("active", true)
    .ilike("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Finds a free slug starting from `base`, appending -2, -3, ... on collision.
 * Checks both the live table and its redirect-history table so a retired
 * slug is never reissued. Parameterized over table names so a future entity
 * (categories, specialists, cities) can reuse this without a rewrite --
 * businesses is the only caller today.
 */
export async function resolveUniqueSlug(params: {
  supabase: AnySupabase;
  table: "businesses";
  redirectTable: "business_slug_redirects";
  redirectColumn: "old_slug";
  base: string;
}): Promise<string> {
  const { supabase, table, redirectTable, redirectColumn, base } = params;
  let candidate = base;
  let suffix = 1;
  for (;;) {
    const [{ data: liveHit }, { data: retiredHit }] = await Promise.all([
      supabase.from(table).select("id").ilike("slug", candidate).maybeSingle(),
      supabase.from(redirectTable).select("id").ilike(redirectColumn, candidate).maybeSingle(),
    ]);
    if (!liveHit && !retiredHit) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the `Database` type won't yet know about `reserved_slugs`/`business_slug_redirects` until Task 3 hand-patches `types.ts` — if errors appear here referencing those tables, that's expected and resolved by Task 3; re-run this check again at the end of Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/lib/slug-service.ts
git commit -m "feat: add generic slug-service module (slugify, validation, uniqueness)"
```

---

### Task 3: Hand-patch types.ts, wire slug generation into registerBusiness

**Files:**
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/lib/business.functions.ts`

**Interfaces:**
- Consumes: `slugify`, `resolveUniqueSlug` from Task 2.
- Produces: `businesses` inserts now include `slug`/`slug_source`; `Database` type includes `reserved_slugs`/`business_slug_redirects` tables and the `businesses` table's `slug`/`slug_source` columns, consumed by every later task's Supabase calls.

- [ ] **Step 1: Hand-patch `types.ts`**

No Docker available for `supabase gen types` in this environment (established constraint from prior sub-projects this session). Add to the `businesses` table's `Row`/`Insert`/`Update` types: `slug: string` (Row), `slug?: string` (Insert, optional since server-generates it), `slug?: string` (Update); `slug_source: string` (Row), `slug_source?: string` (Insert/Update). Add two new table entries to the `Tables` object, following the exact shape of neighboring tables (e.g. `admin_audit_log`):

```ts
reserved_slugs: {
  Row: { id: string; slug: string; reason: string | null; active: boolean; created_at: string };
  Insert: {
    id?: string;
    slug: string;
    reason?: string | null;
    active?: boolean;
    created_at?: string;
  };
  Update: {
    id?: string;
    slug?: string;
    reason?: string | null;
    active?: boolean;
    created_at?: string;
  };
  Relationships: [];
};
business_slug_redirects: {
  Row: {
    id: string;
    business_id: string;
    old_slug: string;
    new_slug: string;
    redirect_type: string;
    created_by: string | null;
    created_at: string;
    hit_count: number;
    last_hit_at: string | null;
  };
  Insert: {
    id?: string;
    business_id: string;
    old_slug: string;
    new_slug: string;
    redirect_type: string;
    created_by?: string | null;
    created_at?: string;
    hit_count?: number;
    last_hit_at?: string | null;
  };
  Update: {
    id?: string;
    business_id?: string;
    old_slug?: string;
    new_slug?: string;
    redirect_type?: string;
    created_by?: string | null;
    created_at?: string;
    hit_count?: number;
    last_hit_at?: string | null;
  };
  Relationships: [
    {
      foreignKeyName: "business_slug_redirects_business_id_fkey";
      columns: ["business_id"];
      isOneToOne: false;
      referencedRelation: "businesses";
      referencedColumns: ["id"];
    },
  ];
};
```

Also add to the `Functions` block: `bump_slug_redirect_hit: { Args: { _old_slug: string }; Returns: undefined };`

- [ ] **Step 2: Wire slug generation into `registerBusiness`**

Read the current handler in `src/lib/business.functions.ts` (the `businesses` insert block). Add the import at the top of the file:

```ts
import { slugify, resolveUniqueSlug } from "@/lib/slug-service";
```

Immediately before the `const { data: business, error } = await supabaseAdmin.from("businesses").insert({...})` call, insert:

```ts
    const { value: rawSlug, usable } = slugify(b.name);
    const slugBase = usable
      ? rawSlug
      : `business-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const slug = await resolveUniqueSlug({
      supabase: supabaseAdmin,
      table: "businesses",
      redirectTable: "business_slug_redirects",
      redirectColumn: "old_slug",
      base: slugBase,
    });
```

Add `slug, slug_source: "auto",` to the `.insert({...})` object (alongside `owner_id`, `name`, etc.). `crypto.randomUUID()` is a Node/browser global, no import needed. Note: the fallback uses a fresh random hex, not the business's own `id`, because `id` doesn't exist yet at this point in the handler (it's assigned by Postgres's `gen_random_uuid()` default on insert) — this differs slightly from the migration's backfill helper (Task 1), which correctly uses the *existing* row's `id` since those rows already exist.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors (this also resolves any lingering errors flagged at the end of Task 2 once `types.ts` recognizes the new tables/columns).

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts src/lib/business.functions.ts
git commit -m "feat: generate a unique slug for every new business at signup"
```

---

### Task 4: `updateBusinessSlug` server function

**Files:**
- Create: `src/lib/business-slug.functions.ts`

**Interfaces:**
- Consumes: `validateSlugFormat`, `isReservedSlug` (Task 2); `assertCanManageBusiness` from `src/lib/business-crm.server.ts` (existing, signature `(supabase, userId, businessId) => Promise<void>`, throws on forbidden); `assertSuperAdmin`, `adminClient`, `logAdminAction` from `src/lib/platform.server.ts` (existing).
- Produces: `updateBusinessSlug({ data: { businessId, newSlug, redirectType } }): Promise<{ ok: true; slug: string }>`, consumed by Task 9 (Settings UI) and Task 10 (Super Admin correction).

- [ ] **Step 1: Write the server function**

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateSlugFormat, isReservedSlug } from "@/lib/slug-service";

const RESERVED_ERROR = "That URL is reserved and can't be used.";

const updateSlugInput = z.object({
  businessId: z.string().uuid(),
  newSlug: z.string().trim().toLowerCase(),
  redirectType: z.enum(["owner_rename", "admin_correction"]),
});

/** Owner (or Super Admin correcting) changes a business's public URL slug. */
export const updateBusinessSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSlugInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    const supabaseAdmin = await adminClient();

    const isSuperAdminCaller = data.redirectType === "admin_correction";
    if (isSuperAdminCaller) {
      await assertSuperAdmin(context.supabase, context.userId);
    } else {
      await assertCanManageBusiness(context.supabase, context.userId, data.businessId);
    }

    const format = validateSlugFormat(data.newSlug);
    if (!format.valid) throw new Error(`That URL isn't valid (${format.error}).`);
    if (await isReservedSlug(supabaseAdmin, data.newSlug)) throw new Error(RESERVED_ERROR);

    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("id, slug")
      .eq("id", data.businessId)
      .single();
    if (businessError) throw new Error(businessError.message);

    if (business.slug.toLowerCase() === data.newSlug) {
      throw new Error("That's already your current URL.");
    }

    if (!isSuperAdminCaller) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("business_slug_redirects")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .gte("created_at", since);
      if ((count ?? 0) >= 3) {
        throw new Error("You've reached the limit of 3 URL changes in 30 days. Try again later.");
      }

      const { data: lastChange } = await supabaseAdmin
        .from("business_slug_redirects")
        .select("created_at")
        .eq("business_id", data.businessId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastChange) {
        const hoursSince =
          (Date.now() - new Date(lastChange.created_at).getTime()) / (60 * 60 * 1000);
        if (hoursSince < 24) {
          const hoursLeft = Math.ceil(24 - hoursSince);
          throw new Error(`You can change your URL again in ${hoursLeft} hour(s).`);
        }
      }
    }

    const [{ data: liveHit }, { data: retiredHit }] = await Promise.all([
      supabaseAdmin
        .from("businesses")
        .select("id")
        .neq("id", data.businessId)
        .ilike("slug", data.newSlug)
        .maybeSingle(),
      supabaseAdmin
        .from("business_slug_redirects")
        .select("id")
        .ilike("old_slug", data.newSlug)
        .maybeSingle(),
    ]);
    if (liveHit || retiredHit) throw new Error("That URL is already taken.");

    const { error: redirectError } = await supabaseAdmin.from("business_slug_redirects").insert({
      business_id: data.businessId,
      old_slug: business.slug,
      new_slug: data.newSlug,
      redirect_type: data.redirectType,
      created_by: context.userId,
    });
    if (redirectError) throw new Error(redirectError.message);

    const { error: updateError } = await supabaseAdmin
      .from("businesses")
      .update({ slug: data.newSlug, slug_source: "custom" })
      .eq("id", data.businessId);
    if (updateError) throw new Error(updateError.message);

    if (isSuperAdminCaller) {
      await logAdminAction(
        supabaseAdmin,
        context.userId,
        "business.slug_correction",
        "business",
        data.businessId,
        { old_slug: business.slug, new_slug: data.newSlug },
      );
    }

    return { ok: true, slug: data.newSlug };
  });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/business-slug.functions.ts
git commit -m "feat: add updateBusinessSlug server function with rate-limit and lock"
```

---

### Task 5: Rename the canonical business route to resolve by slug

**Files:**
- Rename (git mv): `src/routes/business.$businessId.tsx` → `src/routes/business.$businessSlug.tsx`

**Interfaces:**
- Consumes: `businesses.slug` (Task 1), `business_slug_redirects` (Task 1).
- Produces: route path `/business/$businessSlug`, consumed by Task 6 (legacy UUID redirect target), Task 7 (salon shim target), Task 8 (every business-list call site).

- [ ] **Step 1: Rename the file**

```bash
git mv src/routes/business.\$businessId.tsx src/routes/business.\$businessSlug.tsx
```

- [ ] **Step 2: Update the route path and add a `beforeLoad` redirect branch**

Change `createFileRoute("/business/$businessId")` to `createFileRoute("/business/$businessSlug")`. Add a `beforeLoad` to the route config (this is a NEW addition — the route currently has no `beforeLoad`/`loader`, only client-side `useQuery`; this addition is what makes the retired-slug redirect a real server-issued 301, not just client-rendered):

```ts
export const Route = createFileRoute("/business/$businessSlug")({
  beforeLoad: async ({ params }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: live } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", params.businessSlug)
      .maybeSingle();
    if (live) return;

    const { data: retired } = await supabase
      .from("business_slug_redirects")
      .select("business_id")
      .eq("old_slug", params.businessSlug)
      .maybeSingle();
    if (!retired) return; // Let the component's own 404 handling take over.

    const { data: current } = await supabase
      .from("businesses")
      .select("slug")
      .eq("id", retired.business_id)
      .maybeSingle();
    if (!current) return;

    await supabase.rpc("bump_slug_redirect_hit", { _old_slug: params.businessSlug });

    const { redirect } = await import("@tanstack/react-router");
    throw redirect({
      to: "/business/$businessSlug",
      params: { businessSlug: current.slug },
      statusCode: 301,
    });
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { book?: boolean; tab?: "overview" | "book" | "reviews" } => ({
    book: search.book === true || search.book === "true" ? true : undefined,
    tab:
      search.tab === "overview" || search.tab === "book" || search.tab === "reviews"
        ? search.tab
        : undefined,
  }),
  errorComponent: () => <BusinessProblem title="We couldn't load this shop" />,
  notFoundComponent: () => <BusinessProblem title="This shop is no longer available" />,
  head: () => ({
    // ...unchanged, existing meta block...
  }),
  component: BookingFlow,
});
```

Keep the existing `validateSearch`/`errorComponent`/`notFoundComponent`/`head`/`component` fields exactly as they are today — only `createFileRoute`'s path argument and the new `beforeLoad` field change.

- [ ] **Step 3: Update the component to fetch by slug and use the renamed param**

In `BookingFlow`, change:
```ts
const { businessId } = Route.useParams();
```
to:
```ts
const { businessSlug } = Route.useParams();
```

Change the `businessQuery`'s `.eq("id", businessId)` to `.eq("slug", businessSlug)`, and its `queryKey` from `["business", businessId]` to `["business", businessSlug]`.

Every remaining use of the local `businessId` variable in this file now needs the fetched row's `id` instead (for child queries — services, staff, reviews — which filter by `business_id` foreign key, unaffected by this change) or `businessSlug` (for anything about the URL itself). Concretely:
- `readPendingBooking(businessId)` (pending-booking cache key) → `readPendingBooking(businessSlug)`. `stashBooking()`'s `businessId: businessId` in the `savePendingBooking(...)` call → `businessId: businessSlug` (the `PendingBooking` type's field is named `businessId` but its value has always just been "whatever this route's own param was" used as an opaque cache key, not necessarily the raw UUID — using `businessSlug` here is consistent, since `readPendingBooking`/`takePendingBooking` compare it against this same route's own param on the return trip; no other file reads this field's contents as an actual database ID).
- The 4 internal `navigate({ to: "/business/$businessId", params: { businessId }, ... })` self-references (originally at lines 127, 1413, 1454, 1485) → `navigate({ to: "/business/$businessSlug", params: { businessSlug }, ... })`.
- Every place the file uses `business.id` (the fetched row's own id field, e.g. for `BusinessReviews businessId={business.id}` or RPC calls like `owns_business`/`get_business_public_staff` that take `_salon_id: businessId`) — these already reference `business.id` from the fetched row, not the route param, so they're unaffected. Read the file to confirm each `businessId` identifier's origin (route param vs. `business.id`) before changing it — only the route-param usages listed above change.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. TanStack Router's generated route types will surface a compile error at any remaining `businessId` param usage tied to this route — fix each one.

- [ ] **Step 5: Verify TanStack Start's redirect `statusCode` actually produces a 301**

With the dev server running (`dallty-dev`, port 8080), use the Browser pane's `read_network_requests` after navigating to a URL that should hit the retired-slug branch (create a throwaway test: temporarily rename a seed business's slug via direct SQL insert into `business_slug_redirects` + `businesses.slug` update, or defer this specific check to Task 12's full walkthrough once Task 9's Settings UI can trigger a real rename). Confirm the response status is `301`, not `307` or a client-side-only navigation. If TanStack Start's SSR doesn't surface a real 301 for this app's deployment/dev setup, document the actual observed behavior in a plan correction note here rather than silently accepting a downgrade — this is the one item flagged as needing empirical confirmation in the design spec.

- [ ] **Step 6: Commit**

```bash
git add src/routes/business.\$businessSlug.tsx
git rm src/routes/business.\$businessId.tsx 2>/dev/null || true
git commit -m "feat: resolve the business detail route by slug, redirect retired slugs"
```

---

### Task 6: Legacy UUID route

**Files:**
- Create: `src/routes/business-id.$businessId.tsx`

**Interfaces:**
- Consumes: `businesses.id`/`businesses.slug` (Task 1).
- Produces: route `/business-id/$businessId`, a permanent home for any pre-existing link that still uses the raw UUID.

- [ ] **Step 1: Write the route**

```tsx
// Compatibility route for pre-slug links: /business-id/<uuid> -> permanent
// redirect to the business's current slug. Keeps the canonical
// /business/$businessSlug route free of UUID-detection branching.
import { createFileRoute, redirect } from "@tanstack/react-router";

function LegacyBusinessNotFound() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-lg place-items-center px-6 text-center">
      <div className="rounded-3xl glass p-8">
        <h1 className="text-xl font-extrabold">This shop is no longer available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be out of date, or the shop is not listed right now.
        </p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/business-id/$businessId")({
  beforeLoad: async ({ params }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("businesses")
      .select("slug")
      .eq("id", params.businessId)
      .maybeSingle();
    if (!data) return;
    throw redirect({
      to: "/business/$businessSlug",
      params: { businessSlug: data.slug },
      statusCode: 301,
    });
  },
  notFoundComponent: LegacyBusinessNotFound,
  component: LegacyBusinessNotFound,
});
```

The `component`/`notFoundComponent` both render the same not-found screen since the only successful outcome of this route is a redirect thrown from `beforeLoad` — the component only ever renders when the lookup found nothing.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. TanStack Router's route-tree codegen (`routeTree.gen.ts`) regenerates automatically from the dev server / build — confirm `/business-id/$businessId` appears there after the dev server picks up the new file.

- [ ] **Step 3: Commit**

```bash
git add src/routes/business-id.\$businessId.tsx
git commit -m "feat: add legacy UUID compatibility route for business links"
```

---

### Task 7: Update the `/salon/:id` shim to resolve directly to the current slug

**Files:**
- Modify: `src/routes/salon.$salonId.tsx`

**Interfaces:**
- Consumes: `businesses.slug` (Task 1).

- [ ] **Step 1: Rewrite the shim**

Current content redirects `/salon/$salonId` straight to `/business/$businessId` using the raw id (no DB lookup needed, since id was the canonical identifier before this project). Replace with a direct-to-slug, single-hop redirect:

```tsx
// Permanent redirect for the old /salon/$salonId URL. Kept as a thin shim
// (not a code back-compat layer -- the business rename dropped every other
// old name outright) purely so an already-shared or bookmarked link doesn't
// 404. Resolves straight to the business's current slug in one hop, rather
// than bouncing through the /business-id/<uuid> compatibility route.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/salon/$salonId")({
  beforeLoad: async ({ params, location }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("businesses")
      .select("slug")
      .eq("id", params.salonId)
      .maybeSingle();
    const target = data?.slug;
    if (!target) return; // No known business -- fall through to a 404 elsewhere.
    throw redirect({
      to: "/business/$businessSlug",
      params: { businessSlug: target },
      search: location.search,
      statusCode: 301,
    });
  },
});
```

Note: `params.salonId` is still a raw UUID at this old URL shape — this route's whole purpose is translating that legacy UUID-shaped param into the new slug-shaped target, same as Task 6's route, just under the older `/salon/...` path instead of a new `/business-id/...` path.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/salon.\$salonId.tsx
git commit -m "feat: resolve the /salon legacy shim directly to the current slug"
```

---

### Task 8: Update every business-list call site (bookings, favorites, business cards, homepage)

**Files:**
- Modify: `src/lib/dallty-content.ts`
- Modify: `src/hooks/use-live-businesses.ts`
- Modify: `src/routes/index.tsx`
- Modify: `src/components/dallty/business-card.tsx`
- Modify: `src/routes/_authenticated/bookings.tsx`
- Modify: `src/routes/_authenticated/favorites.tsx`

**Interfaces:**
- Consumes: `businesses.slug` (Task 1), the renamed route `/business/$businessSlug` (Task 5).

- [ ] **Step 1: `dallty-content.ts` — add `slug` to the `Business` type and the 4 static fallback rows**

```ts
export type Business = {
  id: string;
  slug: string;
  image: string;
  en: { name: string; area: string; tags: string };
  ar: { name: string; area: string; tags: string };
  rating: number;
  reviews: number;
  distanceKm: number;
  price: string;
  open: boolean;
  instant: boolean;
};

export const businesses: Business[] = [
  {
    id: "1",
    slug: "maison-vert",
    image: hair,
    en: { name: "Maison Vert", area: "Al Olaya", tags: "Hair · Color · Keratin" },
    ar: { name: "ميزون فير", area: "العليا", tags: "شعر · صبغة · كيراتين" },
    rating: 4.9,
    reviews: 812,
    distanceKm: 1.2,
    price: "$$",
    open: true,
    instant: true,
  },
  {
    id: "2",
    slug: "the-gentleman-room",
    image: barber,
    en: { name: "The Gentleman Room", area: "Jumeirah", tags: "Barber · Fade · Beard" },
    ar: { name: "غرفة الأناقة", area: "جميرا", tags: "حلاقة · تدرج · لحية" },
    rating: 4.8,
    reviews: 1240,
    distanceKm: 2.4,
    price: "$",
    open: true,
    instant: true,
  },
  {
    id: "3",
    slug: "rose-nail-studio",
    image: nails,
    en: { name: "Rosé Nail Studio", area: "City Walk", tags: "Nails · Gel · Nail Art" },
    ar: { name: "استوديو روزيه", area: "سيتي ووك", tags: "أظافر · جل · رسم" },
    rating: 4.7,
    reviews: 430,
    distanceKm: 3.1,
    price: "$$",
    open: false,
    instant: false,
  },
  {
    id: "4",
    slug: "amber-spa-wellness",
    image: spa,
    en: { name: "Amber Spa & Wellness", area: "Corniche", tags: "Massage · Facial" },
    ar: { name: "أمبر سبا", area: "الكورنيش", tags: "مساج · عناية بالبشرة" },
    rating: 5.0,
    reviews: 296,
    distanceKm: 4.6,
    price: "$$$",
    open: true,
    instant: true,
  },
];
```
(Only `id`/`slug` lines are new; every other field is unchanged from the current file — copy the rest of each object and the rest of the file, including `copy`, verbatim.)

- [ ] **Step 2: `use-live-businesses.ts` — select and map `slug`**

Add `slug` to `BUSINESS_COLUMNS`:
```ts
const BUSINESS_COLUMNS =
  "id, slug, owner_id, name, name_ar, description, description_ar, area, area_ar, city, image_url, rating, review_count, price_range, distance_km, opens_at, closes_at, instant_booking, is_active, created_at, address, status, business_type, country, country_code, district, logo_url, cover_url, is_listed, latitude, longitude";
```
Add `slug: b.slug,` to the mapped object (alongside `id: b.id,`).

- [ ] **Step 3: `index.tsx` — same fix for its own separately-inlined query**

This file duplicates `use-live-businesses.ts`'s query rather than importing the shared hook. Add `slug` to its own `.select(...)` call (same column list as Step 2, plus `slug`) and `slug: s.slug,` to its own mapped object (around the existing `id: s.id,` line in its `queryFn`).

- [ ] **Step 4: `business-card.tsx` — route on slug**

Change all 3 occurrences of:
```tsx
to="/business/$businessId"
params={{ businessId: business.id }}
```
to:
```tsx
to="/business/$businessSlug"
params={{ businessSlug: business.slug }}
```
(Lines with this pattern: the name/area link, the "Details" link, the "Book" link.)

- [ ] **Step 5: `bookings.tsx` — route on slug**

Find `<Link to="/business/$businessId" params={{ businessId: nextUp.business_id }}>` — this file's query already selects an embedded `businesses(name, area, currency, timezone, address, city, maps_url, phone)` relation; add `slug` to that embedded select list (`businesses(slug, name, area, currency, timezone, address, city, maps_url, phone)`), then change the `Link` to `to="/business/$businessSlug" params={{ businessSlug: nextUp.businesses?.slug }}` — read the surrounding code first to match the exact null-handling style already used for `nextUp.businesses` elsewhere in the same file (e.g. how `mapsHref(nextUp.businesses)` guards against a null embed).

- [ ] **Step 6: `favorites.tsx` — route on slug (3 sections)**

Add `slug` to the `businessesQuery`'s `.select("id, name, area, city, image_url, rating, review_count, price_range")` (→ `.select("id, slug, name, ...")`), the `staffQuery`'s embedded relation isn't used for the business link (staff link uses `member.business_id` directly, which isn't a slug — see note below), and the `recentQuery`'s embedded `businesses(id, name, area, image_url, rating)` (→ `businesses(id, slug, name, area, image_url, rating)`).

Update the 4 `<Link to="/business/$businessId" params={{ businessId: ... }}>` occurrences:
- Businesses section (`business.id` → needs `business.slug`): `params={{ businessSlug: business.slug }}`.
- Specialists section links to `member.business_id` — the `staffQuery` only selects `business_id` (a raw FK, no slug). Add `slug` to a joined `businesses(slug)` embed in `staffQuery`'s select (`.select("id, full_name, title, business_id, businesses(slug)")`) and use `params={{ businessSlug: member.businesses?.slug ?? "" }}` — read the current file to confirm the exact null-safety pattern already used for similar embeds elsewhere in this same file (e.g. `recentQuery`'s `row.businesses as {...} | null` cast) and match it.
- Services section links to `service.business_id` — same fix: add `businesses(slug)` to `servicesQuery`'s select (it already embeds `businesses(currency)` — extend to `businesses(currency, slug)`), use `service.businesses?.slug`.
- Recently-viewed section already embeds `businesses(...)` per Step 6 above — use `business.slug` (the local `business` variable in that block, which now includes `slug`).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 8: Browser spot-check**

Using the preview tools against `dallty-dev`: load `/`, confirm a business card's "Details"/"Book" links point to `/business/<slug>` (not a UUID) via `read_page`; load `/favorites` (signed in as a test account with at least one saved business) and confirm the same.

- [ ] **Step 9: Commit**

```bash
git add src/lib/dallty-content.ts src/hooks/use-live-businesses.ts src/routes/index.tsx src/components/dallty/business-card.tsx src/routes/_authenticated/bookings.tsx src/routes/_authenticated/favorites.tsx
git commit -m "feat: route every business-list link through its slug instead of its id"
```

---

### Task 9: Settings UI — slug editor with preview dialog

**Files:**
- Create: `src/components/dallty/slug-edit-dialog.tsx`
- Modify: `src/routes/_authenticated/admin/settings.tsx`
- Modify: `src/lib/business-settings.functions.ts`

**Interfaces:**
- Consumes: `updateBusinessSlug` (Task 4).
- Produces: `<SlugEditDialog>` component, consumed here and by Task 10 (Super Admin correction).

- [ ] **Step 1: Add `slug`/`slug_source` to the settings read path**

In `src/lib/business-settings.functions.ts`, add `"slug"` and `"slug_source"` to the `SETTINGS_COLUMNS` array (around line 38, alongside `"name"`, `"name_ar"`, etc.).

- [ ] **Step 2: Write the shared dialog component**

Reuses this codebase's existing `AlertDialog` primitives (already used in `src/routes/_authenticated/bookings.tsx` for a confirm-before-destructive-action flow — same pattern here for confirm-before-slug-change). Fetches this business's own recent-change history directly (via the plain client — `business_slug_redirects` grants `SELECT` on `id, business_id, old_slug, new_slug, created_at` to `anon`/`authenticated`, per Task 1, so no server function is needed just to read it) to show the remaining-changes count and lock countdown *before* the owner attempts a change, not just as an error after the fact.

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { validateSlugFormat } from "@/lib/slug-service";
import { updateBusinessSlug } from "@/lib/business-slug.functions";

export function SlugEditDialog({
  open,
  onOpenChange,
  businessId,
  currentSlug,
  redirectType,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  currentSlug: string;
  redirectType: "owner_rename" | "admin_correction";
  onUpdated: (newSlug: string) => void;
}) {
  const [value, setValue] = useState(currentSlug);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = useServerFn(updateBusinessSlug);
  const isSuperAdminCaller = redirectType === "admin_correction";

  const history = useQuery({
    queryKey: ["business-slug-history", businessId],
    enabled: open && !isSuperAdminCaller,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_slug_redirects")
        .select("created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentCount = (history.data ?? []).filter(
    (r) => new Date(r.created_at).getTime() > since,
  ).length;
  const remaining = Math.max(0, 3 - recentCount);
  const lastChangeAt = history.data?.[0]?.created_at;
  const hoursSinceLast = lastChangeAt
    ? (Date.now() - new Date(lastChangeAt).getTime()) / (60 * 60 * 1000)
    : Infinity;
  const lockedHoursLeft = hoursSinceLast < 24 ? Math.ceil(24 - hoursSinceLast) : 0;
  const blocked = !isSuperAdminCaller && (remaining <= 0 || lockedHoursLeft > 0);

  const format = validateSlugFormat(value);
  const changed = value !== currentSlug;

  async function confirm() {
    setBusy(true);
    try {
      const result = await submit({ data: { businessId, newSlug: value, redirectType } });
      toast.success("URL updated");
      onUpdated(result.slug);
      onOpenChange(false);
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update URL");
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {!confirming ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit your URL</AlertDialogTitle>
              <AlertDialogDescription>
                dallty.com/business/
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value.toLowerCase())}
                  disabled={blocked}
                  className="mt-2 block w-full rounded-2xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground outline-none disabled:opacity-60"
                />
                {!format.valid && value !== currentSlug ? (
                  <span className="mt-1 block text-xs text-destructive">
                    3-60 characters, lowercase letters/numbers/hyphens only.
                  </span>
                ) : null}
                {!isSuperAdminCaller && lockedHoursLeft > 0 ? (
                  <span className="mt-1 block text-xs text-destructive">
                    You can change your URL again in {lockedHoursLeft} hour(s).
                  </span>
                ) : !isSuperAdminCaller ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {remaining} of 3 changes left this month.
                  </span>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => onOpenChange(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={!changed || !format.valid || blocked}
                onClick={(e) => {
                  e.preventDefault();
                  setConfirming(true);
                }}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm your new URL</AlertDialogTitle>
              <AlertDialogDescription>
                Old: dallty.com/business/{currentSlug}
                <br />
                New: dallty.com/business/{value}
                <br />
                This takes effect immediately and the old link will keep redirecting here.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirming(false)} disabled={busy}>
                Back
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  void confirm();
                }}
              >
                {busy && <Loader2 className="me-2 inline size-4 animate-spin" />}
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3: Wire it into the Business Settings General tab**

In `src/routes/_authenticated/admin/settings.tsx`, add the import:
```ts
import { SlugEditDialog } from "@/components/dallty/slug-edit-dialog";
```

Add local state near the top of `SettingsPage`:
```ts
const [slugDialogOpen, setSlugDialogOpen] = useState(false);
```

Immediately after the existing `{tab === "general" && (<Section title="General" ...>...</Section>)}` block, add a new sibling section (still gated on `tab === "general"`):

```tsx
{tab === "general" && businessId && (
  <Section title="Public URL" description="Where clients find your business online.">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
        dallty.com/business/<span className="font-bold text-foreground">{form.slug ?? ""}</span>
      </p>
      <button
        type="button"
        onClick={() => setSlugDialogOpen(true)}
        className="press min-h-10 shrink-0 rounded-2xl border border-border/70 px-4 text-sm font-bold"
      >
        Edit
      </button>
    </div>
    {form.slug_source === "auto" ? (
      <p className="mt-2 text-xs text-muted-foreground">
        This URL was generated automatically from your business name.
      </p>
    ) : null}
    <SlugEditDialog
      open={slugDialogOpen}
      onOpenChange={setSlugDialogOpen}
      businessId={businessId}
      currentSlug={form.slug ?? ""}
      redirectType="owner_rename"
      onUpdated={(newSlug) => {
        set("slug", newSlug);
        set("slug_source", "custom");
      }}
    />
  </Section>
)}
```

`form.slug`/`form.slug_source` populate automatically from the existing `useEffect` that spreads `settings.data?.business` into `form`, **but only once `getBusinessSettings` actually returns those columns.** `src/lib/business-settings.functions.ts` selects via an explicit `SETTINGS_COLUMNS` array (not `select("*")`), currently starting `["id", "name", "name_ar", "description", ...]` (around line 38) — add `"slug"` and `"slug_source"` to this array (anywhere in the list; order doesn't matter).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Browser verification**

Sign in as the test `business_owner` account (established technique: Admin API `generate_link` → extract `email_otp` → verify via in-page `fetch()` → write session via `client.auth.setSession()`, as used throughout this session). Navigate to `/admin/settings`, confirm the "Public URL" section renders with the current slug. Click Edit, confirm the "N of 3 changes left this month" hint shows before typing anything. Type an invalid slug (e.g. `ab`), confirm the Continue button stays disabled with the format error shown. Type a valid new slug, click Continue, confirm the preview dialog shows old/new URLs, click Confirm, confirm the success toast and that the displayed URL updates. Reload `/business/<old-slug>` and confirm it 301s to `/business/<new-slug>`. Open the dialog again immediately and confirm it now shows the 24-hour lock countdown with the input disabled.

- [ ] **Step 6: Commit**

```bash
git add src/components/dallty/slug-edit-dialog.tsx src/routes/_authenticated/admin/settings.tsx src/lib/business-settings.functions.ts
git commit -m "feat: add Public URL slug editor to Business Settings"
```

---

### Task 10: Super Admin slug correction + `slug` in the platform businesses list

**Files:**
- Modify: `src/lib/platform.functions.ts`
- Modify: `src/routes/_authenticated/admin/platform/businesses.tsx`

**Interfaces:**
- Consumes: `updateBusinessSlug` (Task 4), `SlugEditDialog` (Task 9).

- [ ] **Step 1: Add `slug` to `listPlatformBusinesses`**

In `src/lib/platform.functions.ts`, change:
```ts
.select(
  "id, name, status, plan, city, country, business_email, business_phone, employee_count, branch_count, trial_ends_at, created_at, owner_id",
)
```
to:
```ts
.select(
  "id, name, slug, status, plan, city, country, business_email, business_phone, employee_count, branch_count, trial_ends_at, created_at, owner_id",
)
```

- [ ] **Step 2: Add the correction action**

In `src/routes/_authenticated/admin/platform/businesses.tsx`, add the import:
```ts
import { SlugEditDialog } from "@/components/dallty/slug-edit-dialog";
```

Add local state for which business's dialog is open:
```ts
const [slugEditingId, setSlugEditingId] = useState<string | null>(null);
```

In the per-business `<article>` block (inside the `rows.map((b) => ...)` render), add a new button alongside the existing status-change buttons:

```tsx
<button
  type="button"
  onClick={() => setSlugEditingId(b.id)}
  className="press flex min-h-10 items-center gap-2 rounded-2xl px-4 text-sm font-bold capitalize glass-soft"
>
  Edit URL
</button>
{slugEditingId === b.id && (
  <SlugEditDialog
    open
    onOpenChange={(open) => !open && setSlugEditingId(null)}
    businessId={b.id}
    currentSlug={b.slug}
    redirectType="admin_correction"
    onUpdated={() => {
      setSlugEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["platform-businesses"] });
    }}
  />
)}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Browser verification**

Sign in as the test `super_admin` account. Navigate to `/admin/platform/businesses`, click "Edit URL" on a business, change its slug, confirm no rate-limit/lock error occurs (Super Admin is exempt) and the change applies immediately.

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform.functions.ts src/routes/_authenticated/admin/platform/businesses.tsx
git commit -m "feat: let Super Admin correct a business's URL slug, exempt from limits"
```

---

### Task 11: Reserved Slugs Super Admin CRUD page

**Files:**
- Create: `src/lib/reserved-slugs.functions.ts`
- Create: `src/routes/_authenticated/admin/platform/reserved-slugs.tsx`
- Modify: `src/components/admin/admin-shell.tsx`

**Interfaces:**
- Produces: `listReservedSlugsAdmin(): Promise<ReservedSlug[]>`, `upsertReservedSlug({ data }): Promise<{ ok: true }>`, consumed only by the new page.

- [ ] **Step 1: Server functions**

Following the exact pattern of `listCategoriesAdmin`/`upsertCategory` in `src/lib/reference-data.functions.ts`:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const reservedSlugInput = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  reason: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().default(true),
});

/** Lists every reserved slug, active or not. Super Admin only. */
export const listReservedSlugsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin
      .from("reserved_slugs")
      .select("*")
      .order("slug");
    if (error) throw new Error(error.message);
    return data;
  });

/** Creates or updates a reserved slug. Super Admin only. */
export const upsertReservedSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reservedSlugInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin.from("reserved_slugs").upsert(data as never);
    if (error) throw new Error(error.message);
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "reserved_slug.upsert",
      "reserved_slug",
      data.id ?? null,
      data,
    );
    return { ok: true };
  });
```

- [ ] **Step 2: The admin page**

```tsx
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Loader2, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { listReservedSlugsAdmin, upsertReservedSlug } from "@/lib/reserved-slugs.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/reserved-slugs")({
  head: () => ({
    meta: [
      { title: "Reserved URLs — Dallty Platform" },
      {
        name: "description",
        content: "Manage the words that can never be used as a business's public URL.",
      },
    ],
  }),
  component: ReservedSlugsAdminPage,
});

function ReservedSlugsAdminPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const list = useServerFn(listReservedSlugsAdmin);
  const upsert = useServerFn(upsertReservedSlug);

  const reserved = useQuery({
    queryKey: ["admin-reserved-slugs"],
    enabled: isSuper,
    queryFn: () => list(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      const row = reserved.data?.find((r) => r.id === id);
      if (!row) return;
      await upsert({ data: { ...row, active } });
      await queryClient.invalidateQueries({ queryKey: ["admin-reserved-slugs"] });
      toast.success(active ? "Reactivated" : "Deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  async function addNew() {
    if (!newSlug.trim()) return;
    setAdding(true);
    try {
      await upsert({ data: { slug: newSlug.trim(), reason: newReason.trim() || null, active: true } });
      await queryClient.invalidateQueries({ queryKey: ["admin-reserved-slugs"] });
      setNewSlug("");
      setNewReason("");
      toast.success("Reserved word added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!isSuper) {
    return (
      <div className="rounded-3xl glass p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-destructive" />
        <h2 className="mt-3 text-lg font-extrabold">Super Admin only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This area is reserved for the Dallty platform team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold">
        <Link2 className="size-5" /> Reserved URLs
      </h1>
      <p className="text-sm text-muted-foreground">
        Words that can never become a business's public URL slug.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl glass p-4">
        <label className="min-w-0 flex-1 text-xs font-bold uppercase text-muted-foreground">
          New word
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
            className="mt-1 block w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground"
          />
        </label>
        <label className="min-w-0 flex-1 text-xs font-bold uppercase text-muted-foreground">
          Reason (optional)
          <input
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={adding || !newSlug.trim()}
          onClick={addNew}
          className="press flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {adding && <Loader2 className="size-3.5 animate-spin" />}
          Add
        </button>
      </div>

      {reserved.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {(reserved.data ?? []).map((r) => (
            <div
              key={r.id}
              className="flex w-full items-center justify-between gap-3 rounded-2xl glass p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.slug}</p>
                <p className="truncate text-xs text-muted-foreground">{r.reason || "No reason given"}</p>
              </div>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => toggleActive(r.id, !r.active)}
                className={`press flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-60 ${
                  r.active ? "glass-soft" : "bg-primary text-primary-foreground"
                }`}
              >
                {busyId === r.id && <Loader2 className="size-3.5 animate-spin" />}
                {r.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Register the page in the admin nav**

In `src/components/admin/admin-shell.tsx`, add `Link2` to the `lucide-react` import list, and add an entry to `PLATFORM_NAV` (after the `categories` entry):

```ts
{
  to: "/admin/platform/reserved-slugs",
  label: "Reserved URLs",
  labelAr: "الروابط المحجوزة",
  icon: Link2,
},
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Browser verification**

Sign in as the test `super_admin` account. Navigate to `/admin/platform/reserved-slugs`, confirm the seeded 58 reserved words list. Add a new word, confirm it appears. Deactivate it, confirm the button flips to "Activate". Attempt to use that deactivated word as a business slug via `/admin/settings` (should now succeed, since `active = false` words are no longer blocked) — this also incidentally proves `isReservedSlug`'s `active = true` filter (Task 2) works correctly.

- [ ] **Step 6: Commit**

```bash
git add src/lib/reserved-slugs.functions.ts src/routes/_authenticated/admin/platform/reserved-slugs.tsx src/components/admin/admin-shell.tsx
git commit -m "feat: add Super Admin Reserved URLs management page"
```

---

### Task 12: Final verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck and lint**

Run: `npx tsc --noEmit` — expected zero errors.
Run: `npx eslint .` — expected zero *new* errors (this codebase has pre-existing prettier-formatting lint debt unrelated to this work, established in every prior sub-project this session; run `npx eslint --fix` on only the files this plan touched if any formatting errors appear in them specifically).

- [ ] **Step 2: DB-side final confirmation**

```bash
npx supabase db query "select slug, count(*) from businesses group by slug having count(*) > 1;" --db-url "postgresql://postgres:6sXrwCwvFt1KLO9n@db.cbacaplvcxytzclpiyir.supabase.co:5432/postgres"
```
Expected: zero rows (no duplicate slugs).

```bash
npx supabase db query "select b.slug from businesses b join business_slug_redirects r on r.old_slug = b.slug;" --db-url "postgresql://postgres:6sXrwCwvFt1KLO9n@db.cbacaplvcxytzclpiyir.supabase.co:5432/postgres"
```
Expected: zero rows (no slug is simultaneously live and retired — proves the cross-table triggers are holding).

- [ ] **Step 3: Browser walkthrough — public flow**

Using the preview tools against `dallty-dev` (port 8080):
1. Navigate to `/` — confirm business cards render and their links point at `/business/<slug>`.
2. Click through to a business detail page, confirm the URL bar shows `/business/<slug>`, no console errors (`read_console_messages`, `onlyErrors: true`).
3. Navigate directly to `/business-id/<a-real-uuid>` — confirm a 301 to `/business/<slug>`.
4. Navigate directly to `/salon/<same-uuid>` — confirm a direct 301 to `/business/<slug>` (one hop, not through `/business-id/...`).
5. Navigate to `/business/<a-nonexistent-slug>` — confirm the existing "shop is no longer available" screen renders (not a blank page or crash).

- [ ] **Step 4: Browser walkthrough — owner and Super Admin flows**

Sign in as the test `business_owner` account: confirm `/admin/settings`'s Public URL section, a full rename (format-reject → preview → confirm), and that the old slug 301s afterward (already covered in Task 9's own verification — re-run briefly to confirm nothing regressed after later tasks).

Sign in as the test `super_admin` account: confirm `/admin/platform/businesses`'s Edit URL action works and bypasses the rate limit (already covered in Task 10 — re-run briefly), and `/admin/platform/reserved-slugs` CRUD works (already covered in Task 11 — re-run briefly).

- [ ] **Step 5: Final commit (only if this sweep surfaced fixes)**

If Steps 1-4 found anything to fix, fix it, then:
```bash
git add -A
git commit -m "fix: address issues found during business-slugs final verification sweep"
```
If nothing needed fixing, there is nothing to commit here — the plan is done as of Task 11's commit.
