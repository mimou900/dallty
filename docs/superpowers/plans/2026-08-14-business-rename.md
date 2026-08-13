# Business/Salon Terminology Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "salon" concept to "business" throughout Dallty's schema and code — table `salons`→`businesses` (+ 2 satellite tables, 10 FK columns, 2 enum values, ~13 RPC functions, a Storage bucket, and 66 TypeScript/React files) — so the platform reads as a generic beauty/wellness business directory instead of being hard-coded to salons, while keeping aggregate marketing copy beauty-flavored per the spec.

**Architecture:** Four small, ordered Postgres migrations exploit a verified-on-this-DB fact: `ALTER TABLE ... RENAME TO/RENAME COLUMN`, `ALTER FUNCTION ... RENAME TO`, and `ALTER TYPE ... RENAME VALUE` all auto-propagate into every dependent RLS policy's stored `qual`/`with_check` expression (Postgres stores these as compiled trees keyed by OID/attnum, not text) and preserve grants and trigger bindings. Only raw function bodies (stored as text) need manual rewriting. This means the ~25-policy rewrite the spec anticipated collapses to zero manual `DROP POLICY`/`CREATE POLICY` statements — a pure rename migration plus one cosmetic `ALTER POLICY RENAME` pass is sufficient and lower-risk than hand-rewriting policy bodies. The Storage bucket move is a real data migration (buckets are rows, not renameable schema objects) done via a Node script using the Storage API. The TypeScript side is a mechanical multi-file rename executed file-by-file against an exhaustive, pre-verified file:line inventory gathered via grep before this plan was written.

**Tech Stack:** TanStack Start / React 19 / TanStack Query, Supabase Postgres. No test framework (confirmed, matches every prior sub-project this session). Verification is `npx tsc --noEmit`, `npx eslint .`, direct SQL via `npx supabase db query -f <file> --db-url "$DB_URL"` (multi-statement files) or `npx supabase db query "<sql>" --db-url "$DB_URL"` (single-statement), and browser verification via the preview tools.

**Spec:** `docs/superpowers/specs/2026-08-13-business-rename-design.md`

## Global Constraints

- **Never edit a historical migration file.** Only add new forward-only files under `supabase/migrations/`.
- **DB naming convention:** snake_case in Postgres matches snake_case in TypeScript exactly wherever the code reads raw Supabase rows (e.g. `owner_id`, `business_type`) — camelCase only in the app's own local types/props (e.g. `salonId` → `businessId`).
- **Verified Postgres behavior this plan relies on** (empirically tested on the live DB before writing this plan, then rolled back): renaming a table, a column, a function, or an enum value via `ALTER ... RENAME` auto-updates every RLS policy `qual`/`with_check` that references it — including policies that reference the renamed object through a JOIN/subquery in a *different* table's policy. Function **bodies** are NOT auto-updated (they're stored as raw text) — those need `CREATE OR REPLACE` with the body text rewritten. `ALTER FUNCTION ... RENAME TO` preserves the function's OID, so it keeps its grants and any triggers bound to it without needing to re-`GRANT` or recreate triggers.
- **Function-signature/RPC-name renames create a brief internal breaking window.** Task 3 renames RPC parameter names (e.g. `owns_salon(_user_id, _salon_id)` → `owns_business(_user_id, _business_id)`); every `.rpc("owns_salon", {...})`-style call site (11 total, listed in Task 14) breaks until updated. This is expected, self-contained mid-plan breakage in a dev environment — not a rollback trigger — but Task 3 and Task 14 must both land (and the app re-verified end-to-end) before calling the plan done.
- **No back-compat shims.** This is a pre-launch app with no external API consumers (confirmed in the spec) — old table/column/function/type names are dropped outright, not kept as aliases.
- **Public URL breakage gets a redirect, not a shim.** `/salon/$salonId` becomes `/business/$businessId`; a thin permanent-redirect route stays at the old path (Task 9) so any already-shared link doesn't 404.
- **Aggregate copy stays beauty-flavored; per-business copy becomes category-driven.** Marketing strings like "Nearby salons" are untouched (spec decision #4); a business's own descriptive noun (badge, page title) comes from its `categories` row via a new `businessCategoryLabel()` helper (Task 15).
- Every SQL step's expected output is stated exactly — if a step doesn't match, stop and investigate before continuing to the next step (later steps assume earlier ones landed cleanly).

---

### Task 1: Migration 1 — structural renames (tables, columns, constraints, indexes)

**Files:**
- Create: `supabase/migrations/20260814010000_business_rename_schema.sql`

**Interfaces:**
- Produces: tables `public.businesses`, `public.business_gallery`, `public.business_hours`; column `business_id` (replacing `salon_id`) on `services`, `staff`, `bookings`, `reviews`, `business_gallery`, `business_hours`, `recently_viewed`, `waitlist_entries`, `promotions`, `staff_join_requests`.
- Consumes: nothing (first migration in the sequence).

- [ ] **Step 1: Write the migration**

```sql
-- Business/Salon Terminology Rename, migration 1 of 4: table, column,
-- constraint, and index renames.
--
-- Postgres auto-propagates ALTER TABLE RENAME TO / RENAME COLUMN into every
-- dependent RLS policy's stored qual/with_check (policies are compiled
-- expression trees keyed by relid/attnum, not text) and into every
-- dependent index/constraint expression. Verified empirically against this
-- database before writing this migration: a scratch table+policy+function
-- was renamed and pg_policies showed the new names with no DROP/CREATE
-- POLICY needed. Only raw function bodies (stored as text) need a manual
-- rewrite — that happens in migration 3.
--
-- Order matters for the later migrations in this set, not this one: this
-- file must land before migration 3 (function body rewrites reference the
-- new table/column names) and before migration 4 (cosmetic policy renames
-- read the post-rename catalog).

ALTER TABLE public.salons RENAME TO businesses;
ALTER TABLE public.salon_gallery RENAME TO business_gallery;
ALTER TABLE public.salon_hours RENAME TO business_hours;

ALTER TABLE public.services RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.staff RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.bookings RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.reviews RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.business_gallery RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.business_hours RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.recently_viewed RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.waitlist_entries RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.promotions RENAME COLUMN salon_id TO business_id;
ALTER TABLE public.staff_join_requests RENAME COLUMN salon_id TO business_id;

-- Constraints (cosmetic from here down — the renames above already made
-- every policy/index functionally correct; this just keeps \d+ output and
-- error messages readable for whoever reads the schema next). Renaming a
-- PRIMARY KEY/UNIQUE/FOREIGN KEY constraint also renames its backing index
-- in the same statement.
ALTER TABLE public.businesses RENAME CONSTRAINT salons_pkey TO businesses_pkey;
ALTER TABLE public.business_gallery RENAME CONSTRAINT salon_gallery_pkey TO business_gallery_pkey;
ALTER TABLE public.business_hours RENAME CONSTRAINT salon_hours_pkey TO business_hours_pkey;
ALTER TABLE public.bookings RENAME CONSTRAINT bookings_salon_id_fkey TO bookings_business_id_fkey;
ALTER TABLE public.promotions RENAME CONSTRAINT promotions_salon_id_fkey TO promotions_business_id_fkey;
ALTER TABLE public.recently_viewed RENAME CONSTRAINT recently_viewed_salon_id_fkey TO recently_viewed_business_id_fkey;
ALTER TABLE public.recently_viewed RENAME CONSTRAINT recently_viewed_user_id_salon_id_key TO recently_viewed_user_id_business_id_key;
ALTER TABLE public.reviews RENAME CONSTRAINT reviews_salon_id_fkey TO reviews_business_id_fkey;
ALTER TABLE public.business_gallery RENAME CONSTRAINT salon_gallery_salon_id_fkey TO business_gallery_business_id_fkey;
ALTER TABLE public.business_hours RENAME CONSTRAINT salon_hours_salon_id_fkey TO business_hours_business_id_fkey;
ALTER TABLE public.business_hours RENAME CONSTRAINT salon_hours_salon_id_weekday_key TO business_hours_business_id_weekday_key;
ALTER TABLE public.services RENAME CONSTRAINT services_salon_id_fkey TO services_business_id_fkey;
ALTER TABLE public.staff RENAME CONSTRAINT staff_salon_id_fkey TO staff_business_id_fkey;
ALTER TABLE public.staff_join_requests RENAME CONSTRAINT staff_join_requests_salon_id_fkey TO staff_join_requests_business_id_fkey;
ALTER TABLE public.waitlist_entries RENAME CONSTRAINT waitlist_entries_salon_id_fkey TO waitlist_entries_business_id_fkey;

-- Bare indexes (not backed by a table constraint, so they need their own
-- ALTER INDEX rather than being covered by a constraint rename above).
ALTER INDEX public.idx_reviews_salon RENAME TO idx_reviews_business;
ALTER INDEX public.idx_salon_gallery_salon RENAME TO idx_business_gallery_business;
ALTER INDEX public.promotions_salon_code_key RENAME TO promotions_business_code_key;
ALTER INDEX public.staff_join_requests_salon_idx RENAME TO staff_join_requests_business_idx;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db query -f supabase/migrations/20260814010000_business_rename_schema.sql --db-url "$DB_URL"`
Expected: a sequence of `ALTER TABLE` / `ALTER INDEX` results, no errors.

- [ ] **Step 3: Verify the rename landed and every policy auto-updated**

Run:
```
npx supabase db query "select table_name from information_schema.tables where table_schema='public' and table_name in ('businesses','business_gallery','business_hours') order by table_name;" --db-url "$DB_URL"
```
Expected: all 3 names returned (confirms the table rename).

Run:
```
npx supabase db query "select tablename, policyname, qual, with_check from pg_policies where schemaname='public' and (qual ilike '%salon%' or with_check ilike '%salon%');" --db-url "$DB_URL"
```
Expected: **zero rows**. If any row comes back, that policy's logic references something this migration didn't rename (stop and investigate — do not proceed to Task 2 until this is empty).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814010000_business_rename_schema.sql
git commit -m "feat: rename salons table family to businesses (schema)"
```

---

### Task 2: Migration 2 — enum renames

**Files:**
- Create: `supabase/migrations/20260814020000_business_rename_enums.sql`

**Interfaces:**
- Produces: `app_role` enum value `business_owner` (replacing `salon_owner`); `favorite_kind` enum value `business` (replacing `salon`).
- Consumes: nothing new (independent of Task 1's table renames, but must land before Task 3, since `handle_new_user`'s rewritten body compares against the new enum label text).

- [ ] **Step 1: Write the migration**

```sql
-- Business/Salon Terminology Rename, migration 2 of 4: enum value renames.
-- Same ALTER ... RENAME VALUE pattern already proven safe in this project's
-- earlier customer->client / staff->specialist role rename: preserves every
-- existing row's value (no backfill), and — per the same empirical check
-- run for migration 1 — auto-propagates into any policy that compares
-- against the literal (e.g. has_role(auth.uid(), 'salon_owner'::app_role)).

ALTER TYPE public.app_role RENAME VALUE 'salon_owner' TO 'business_owner';
ALTER TYPE public.favorite_kind RENAME VALUE 'salon' TO 'business';
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db query -f supabase/migrations/20260814020000_business_rename_enums.sql --db-url "$DB_URL"`
Expected: two `ALTER TYPE` results, no errors.

- [ ] **Step 3: Verify**

Run:
```
npx supabase db query "select typname, enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typname in ('app_role','favorite_kind') order by typname, e.enumsortorder;" --db-url "$DB_URL"
```
Expected: `app_role` rows are `client, business_owner, specialist, admin, super_admin`; `favorite_kind` rows are `business, staff, service`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814020000_business_rename_enums.sql
git commit -m "feat: rename app_role.salon_owner and favorite_kind.salon to business_*"
```

---

### Task 3: Migration 3 — function renames + body rewrites

**Files:**
- Create: `supabase/migrations/20260814030000_business_rename_functions.sql`

**Interfaces:**
- Produces: functions `owns_business(_user_id uuid, _business_id uuid)`, `is_business_staff(_user_id uuid, _staff_id uuid)`, `get_business_availability_summary(_business_id uuid, _days integer)`, `get_business_public_staff(_business_id uuid)`, `submit_business_for_review(_business_id uuid)`, `recompute_business_listing(_business_id uuid)`, `tg_recompute_listing_from_business_row()`, `guard_business_marketplace()`, `refresh_business_rating()` — all renamed from their `*_salon*` originals. Bodies of `check_promo_code`, `get_marketplace_readiness`, `get_available_slots`, `tg_recompute_listing_from_link`, `handle_new_user` rewritten in place (same name, new internal references).
- Consumes: `public.businesses` (Task 1), `app_role.business_owner` (Task 2).

**Note on approach:** every function below uses `ALTER FUNCTION ... RENAME TO` first (preserves the function's OID, so existing grants and the triggers listed below keep working with zero extra statements), then `CREATE OR REPLACE FUNCTION` under the new name to rewrite the body. This order matters — renaming first means the `CREATE OR REPLACE` is modifying the function that already has the right name, not creating a second one.

Six triggers are bound to five of these functions and do **not** need to be touched — a trigger binds to a function's OID, not its name, so `ALTER FUNCTION RENAME` carries them along automatically (verified for the general table/column case in Task 1; function OID binding is separately well-established Postgres behavior, not something this plan re-derives). For reference, the affected triggers are: `reviews_refresh_rating` (`refresh_salon_rating`), `salons_guard_marketplace` (`guard_salon_marketplace`), `trg_services_listing` + `trg_staff_listing` (`tg_recompute_listing_from_salon_row`), `trg_staff_services_listing` (`tg_recompute_listing_from_link`), `on_auth_user_created` (`handle_new_user`).

- [ ] **Step 1: Write the migration**

```sql
-- Business/Salon Terminology Rename, migration 3 of 4: function renames and
-- body rewrites.
--
-- ALTER FUNCTION RENAME preserves OID, so it carries grants and trigger
-- bindings automatically — no re-GRANT, no trigger recreation needed.
-- CREATE OR REPLACE FUNCTION on the (now new-named) function updates its
-- body text, which is NOT auto-rewritten by the table/column renames in
-- migration 1 (function bodies are stored as raw text, re-parsed per call —
-- unlike policies, which are stored as compiled expression trees).

-- owns_salon -> owns_business
ALTER FUNCTION public.owns_salon(uuid, uuid) RENAME TO owns_business;
CREATE OR REPLACE FUNCTION public.owns_business(_user_id uuid, _business_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.businesses WHERE id = _business_id AND owner_id = _user_id)
$function$;

-- is_salon_staff -> is_business_staff (body has no salon/salon_id references
-- to rewrite — it only queries public.staff by id/user_id — but the
-- parameter is renamed for consistency with every other function here).
ALTER FUNCTION public.is_salon_staff(uuid, uuid) RENAME TO is_business_staff;
CREATE OR REPLACE FUNCTION public.is_business_staff(_user_id uuid, _staff_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.staff WHERE id = _staff_id AND user_id = _user_id)
$function$;

-- get_salon_availability_summary -> get_business_availability_summary
ALTER FUNCTION public.get_salon_availability_summary(uuid, integer) RENAME TO get_business_availability_summary;
CREATE OR REPLACE FUNCTION public.get_business_availability_summary(_business_id uuid, _days integer DEFAULT 14)
 RETURNS TABLE(staff_id uuid, service_id uuid, has_schedule boolean, open_slots integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  d date;
  cnt integer;
  span integer := LEAST(GREATEST(COALESCE(_days, 14), 1), 30);
  tz text;
  today date;
BEGIN
  SELECT COALESCE(b.timezone, 'UTC') INTO tz FROM public.businesses b WHERE b.id = _business_id;
  tz := COALESCE(tz, 'UTC');
  today := (now() AT TIME ZONE tz)::date;

  FOR r IN
    SELECT st.id AS sid, sv.id AS svid
    FROM public.staff st
    JOIN public.staff_services ss ON ss.staff_id = st.id
    JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active AND sv.business_id = _business_id
    WHERE st.business_id = _business_id AND st.is_active
  LOOP
    cnt := 0;
    d := today;
    WHILE d < today + span LOOP
      cnt := cnt + (
        SELECT count(*) FROM public.get_available_slots(r.sid, r.svid, d) g WHERE g.available
      );
      d := d + 1;
    END LOOP;

    staff_id := r.sid;
    service_id := r.svid;
    has_schedule := EXISTS (SELECT 1 FROM public.staff_schedules x WHERE x.staff_id = r.sid)
      OR EXISTS (
        SELECT 1 FROM public.staff_day_hours dh
        WHERE dh.staff_id = r.sid AND dh.day >= today AND dh.day < today + span
      );
    open_slots := cnt;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- get_salon_public_staff -> get_business_public_staff
ALTER FUNCTION public.get_salon_public_staff(uuid) RENAME TO get_business_public_staff;
CREATE OR REPLACE FUNCTION public.get_business_public_staff(_business_id uuid)
 RETURNS TABLE(id uuid, business_id uuid, user_id uuid, full_name text, full_name_ar text, title text, title_ar text, avatar_url text, is_active boolean, created_at timestamp with time zone, service_ids uuid[])
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT st.id, st.business_id, st.user_id, st.full_name, st.full_name_ar, st.title,
         st.title_ar, st.avatar_url, st.is_active, st.created_at,
         COALESCE(ARRAY(
           SELECT ss.service_id
           FROM public.staff_services ss
           JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active
           WHERE ss.staff_id = st.id
         ), '{}'::uuid[])
  FROM public.staff st
  WHERE st.business_id = _business_id AND st.is_active
  ORDER BY st.created_at;
$function$;

-- submit_salon_for_review -> submit_business_for_review
ALTER FUNCTION public.submit_salon_for_review(uuid) RENAME TO submit_business_for_review;
CREATE OR REPLACE FUNCTION public.submit_business_for_review(_business_id uuid)
 RETURNS TABLE(ok boolean, reason text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  cur public.marketplace_status;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = _business_id
      AND (b.owner_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  ) THEN
    RETURN QUERY SELECT false, 'forbidden'; RETURN;
  END IF;

  SELECT marketplace_status INTO cur FROM public.businesses WHERE id = _business_id;
  IF cur IN ('pending_review', 'approved') THEN
    RETURN QUERY SELECT false, 'already_submitted'; RETURN;
  END IF;

  SELECT * INTO r FROM public.get_marketplace_readiness(_business_id);
  IF r IS NULL THEN RETURN QUERY SELECT false, 'not_found'; RETURN; END IF;

  IF NOT (r.profile_complete AND r.logo_uploaded AND r.location_set AND r.hours_set
          AND r.has_service AND r.has_specialist AND r.service_assigned
          AND r.working_hours_set AND r.future_availability) THEN
    RETURN QUERY SELECT false, 'incomplete'; RETURN;
  END IF;

  UPDATE public.businesses
  SET marketplace_status = 'pending_review',
      marketplace_note = NULL,
      submitted_at = now()
  WHERE id = _business_id;

  RETURN QUERY SELECT true, 'ok';
END; $function$;

-- recompute_salon_listing -> recompute_business_listing
ALTER FUNCTION public.recompute_salon_listing(uuid) RENAME TO recompute_business_listing;
CREATE OR REPLACE FUNCTION public.recompute_business_listing(_business_id uuid)
 RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE public.businesses b
  SET is_listed = EXISTS (
    SELECT 1
    FROM public.staff_services ss
    JOIN public.staff st ON st.id = ss.staff_id AND st.is_active AND st.business_id = b.id
    JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active AND sv.business_id = b.id
  )
  WHERE b.id = _business_id;
$function$;

-- tg_recompute_listing_from_salon_row -> tg_recompute_listing_from_business_row
ALTER FUNCTION public.tg_recompute_listing_from_salon_row() RENAME TO tg_recompute_listing_from_business_row;
CREATE OR REPLACE FUNCTION public.tg_recompute_listing_from_business_row()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.recompute_business_listing(COALESCE(NEW.business_id, OLD.business_id));
  RETURN NULL;
END;
$function$;

-- guard_salon_marketplace -> guard_business_marketplace (also reword the
-- user-facing RAISE EXCEPTION text, per the spec).
ALTER FUNCTION public.guard_salon_marketplace() RENAME TO guard_business_marketplace;
CREATE OR REPLACE FUNCTION public.guard_business_marketplace()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_platform_admin(auth.uid()) OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
    RAISE EXCEPTION 'Only the Dallty team can change verification';
  END IF;

  IF NEW.marketplace_status IS DISTINCT FROM OLD.marketplace_status
     AND NEW.marketplace_status NOT IN ('draft','pending_review','hidden') THEN
    RAISE EXCEPTION 'Only the Dallty team can approve or reject a business';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only the Dallty team can change the business status';
  END IF;

  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.marketplace_note IS DISTINCT FROM OLD.marketplace_note THEN
    RAISE EXCEPTION 'Only the Dallty team can change review decisions';
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
    RAISE EXCEPTION 'Only the Dallty team can change the subscription plan';
  END IF;

  -- is_listed is computed by platform triggers only (nested trigger depth > 1)
  IF NEW.is_listed IS DISTINCT FROM OLD.is_listed AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Marketplace listing is computed automatically';
  END IF;

  RETURN NEW;
END; $function$;

-- refresh_salon_rating -> refresh_business_rating
ALTER FUNCTION public.refresh_salon_rating() RENAME TO refresh_business_rating;
CREATE OR REPLACE FUNCTION public.refresh_business_rating()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  bid uuid := COALESCE(NEW.business_id, OLD.business_id);
BEGIN
  UPDATE public.businesses b
  SET rating = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM public.reviews r WHERE r.business_id = bid AND NOT r.is_hidden), 5.0),
      review_count = (SELECT COUNT(*) FROM public.reviews r WHERE r.business_id = bid AND NOT r.is_hidden)
  WHERE b.id = bid;
  RETURN NULL;
END;
$function$;

-- check_promo_code: same name, body rewritten (param renamed for consistency
-- with the RPC callers this plan also updates in Task 14).
CREATE OR REPLACE FUNCTION public.check_promo_code(_business_id uuid, _code text, _amount numeric)
 RETURNS TABLE(promotion_id uuid, valid boolean, reason text, discount numeric, final_price numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p record; d numeric := 0;
BEGIN
  SELECT * INTO p FROM public.promotions
  WHERE business_id = _business_id AND upper(code) = upper(trim(_code));

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, false, 'not_found', 0::numeric, _amount; RETURN;
  END IF;
  IF NOT p.is_active
     OR (p.starts_at IS NOT NULL AND now() < p.starts_at)
     OR (p.ends_at IS NOT NULL AND now() > p.ends_at) THEN
    RETURN QUERY SELECT NULL::uuid, false, 'expired', 0::numeric, _amount; RETURN;
  END IF;
  IF p.max_uses IS NOT NULL AND p.used_count >= p.max_uses THEN
    RETURN QUERY SELECT NULL::uuid, false, 'used_up', 0::numeric, _amount; RETURN;
  END IF;
  IF _amount < p.min_amount THEN
    RETURN QUERY SELECT NULL::uuid, false, 'min_amount', 0::numeric, _amount; RETURN;
  END IF;

  d := CASE WHEN p.discount_type = 'percent'
            THEN round(_amount * p.discount_value / 100.0, 2)
            ELSE p.discount_value END;
  d := LEAST(GREATEST(d, 0), _amount);

  RETURN QUERY SELECT p.id, true, 'ok', d, _amount - d;
END; $function$;

-- get_marketplace_readiness: same name, body rewritten.
CREATE OR REPLACE FUNCTION public.get_marketplace_readiness(_business_id uuid)
 RETURNS TABLE(profile_complete boolean, logo_uploaded boolean, location_set boolean, hours_set boolean, has_service boolean, has_specialist boolean, service_assigned boolean, working_hours_set boolean, future_availability boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    (b.name <> '' AND b.city <> '' AND COALESCE(b.business_phone, b.phone) IS NOT NULL
      AND b.business_email IS NOT NULL AND cardinality(b.categories) > 0),
    b.logo_url IS NOT NULL,
    (b.latitude IS NOT NULL AND b.longitude IS NOT NULL AND b.address IS NOT NULL),
    (b.opens_at IS NOT NULL AND b.closes_at IS NOT NULL),
    EXISTS (SELECT 1 FROM services sv WHERE sv.business_id = b.id AND sv.is_active),
    EXISTS (SELECT 1 FROM staff st WHERE st.business_id = b.id AND st.is_active),
    EXISTS (SELECT 1 FROM staff_services ss
            JOIN staff st ON st.id = ss.staff_id AND st.business_id = b.id AND st.is_active),
    EXISTS (SELECT 1 FROM staff_schedules sc
            JOIN staff st ON st.id = sc.staff_id AND st.business_id = b.id AND st.is_active),
    EXISTS (SELECT 1 FROM get_business_availability_summary(b.id, 14) g WHERE g.open_slots > 0)
  FROM businesses b
  WHERE b.id = _business_id
    AND (b.owner_id = auth.uid() OR is_platform_admin(auth.uid()));
$function$;

-- get_available_slots: same name, body rewritten (joins staff -> businesses
-- for timezone).
CREATE OR REPLACE FUNCTION public.get_available_slots(_staff_id uuid, _service_id uuid, _day date)
 RETURNS TABLE(slot timestamp with time zone, available boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  dur integer;
  win_start time;
  win_end time;
  cur timestamptz;
  win_end_ts timestamptz;
  tz text;
BEGIN
  SELECT duration_minutes INTO dur FROM public.services WHERE id = _service_id;
  IF dur IS NULL THEN RETURN; END IF;

  SELECT b.timezone INTO tz
  FROM public.staff st JOIN public.businesses b ON b.id = st.business_id
  WHERE st.id = _staff_id;
  tz := COALESCE(tz, 'UTC');

  IF EXISTS (SELECT 1 FROM public.staff_time_off t WHERE t.staff_id = _staff_id AND t.day = _day) THEN
    RETURN;
  END IF;

  SELECT dh.starts_at, dh.ends_at INTO win_start, win_end
  FROM public.staff_day_hours dh
  WHERE dh.staff_id = _staff_id AND dh.day = _day;

  IF win_start IS NULL THEN
    SELECT ss.starts_at, ss.ends_at INTO win_start, win_end
    FROM public.staff_schedules ss
    WHERE ss.staff_id = _staff_id AND ss.weekday = EXTRACT(dow FROM _day)::smallint;
  END IF;

  IF win_start IS NULL THEN RETURN; END IF;

  cur := (_day + win_start) AT TIME ZONE tz;
  win_end_ts := (_day + win_end) AT TIME ZONE tz;

  WHILE cur + make_interval(mins => dur) <= win_end_ts LOOP
    slot := cur;
    available := cur > now()
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.staff_id = _staff_id
          AND b.status IN ('pending', 'confirmed')
          AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(cur, cur + make_interval(mins => dur), '[)')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_breaks br
        WHERE br.staff_id = _staff_id
          AND br.weekday = EXTRACT(dow FROM _day)::smallint
          AND tstzrange((_day + br.starts_at) AT TIME ZONE tz, (_day + br.ends_at) AT TIME ZONE tz, '[)')
              && tstzrange(cur, cur + make_interval(mins => dur), '[)')
      );
    RETURN NEXT;
    cur := cur + interval '30 minutes';
  END LOOP;
END;
$function$;

-- tg_recompute_listing_from_link: same name, body rewritten.
CREATE OR REPLACE FUNCTION public.tg_recompute_listing_from_link()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE bid uuid;
BEGIN
  SELECT business_id INTO bid FROM public.staff WHERE id = COALESCE(NEW.staff_id, OLD.staff_id);
  IF bid IS NOT NULL THEN PERFORM public.recompute_business_listing(bid); END IF;
  RETURN NULL;
END;
$function$;

-- handle_new_user: same name, body rewritten. This is the one function that
-- compares the incoming signup role as PLAIN TEXT before casting to
-- app_role (per the same snag flagged in the earlier customer/staff role
-- rename) — the client-side signup forms sending role:"salon_owner" in
-- user_metadata are updated to "business_owner" in Task 11.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  requested text := COALESCE(NEW.raw_user_meta_data ->> 'role', 'client');
  assigned public.app_role;
BEGIN
  IF lower(NEW.email) = 'mimou@devlly.net' THEN
    assigned := 'super_admin';
  ELSIF requested IN ('client', 'business_owner', 'specialist') THEN
    assigned := requested::public.app_role;
  ELSE
    assigned := 'client';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, locale, country_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    COALESCE(NEW.raw_user_meta_data ->> 'locale', 'en'),
    NEW.raw_user_meta_data ->> 'country_code'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Link any guest bookings placed under this email before the account existed.
  IF NEW.email IS NOT NULL THEN
    UPDATE public.bookings
    SET customer_id = NEW.id, updated_at = now()
    WHERE customer_id IS NULL
      AND customer_email IS NOT NULL
      AND lower(customer_email) = lower(NEW.email);
  END IF;

  RETURN NEW;
END;
$function$;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db query -f supabase/migrations/20260814030000_business_rename_functions.sql --db-url "$DB_URL"`
Expected: alternating `ALTER FUNCTION` / `CREATE FUNCTION` results, no errors.

- [ ] **Step 3: Verify function names, grants, and trigger bindings survived**

Run:
```
npx supabase db query "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like '%salon%';" --db-url "$DB_URL"
```
Expected: **zero rows** (no function name still contains "salon").

Run:
```
npx supabase db query "select c.relname as table_name, t.tgname as trigger_name, p.proname as function_name from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal and p.proname in ('refresh_business_rating','guard_business_marketplace','tg_recompute_listing_from_business_row','tg_recompute_listing_from_link','handle_new_user') order by c.relname;" --db-url "$DB_URL"
```
Expected: 6 rows — `reviews_refresh_rating`/`refresh_business_rating`, `businesses_guard_marketplace`-or-still-`salons_guard_marketplace`-named-trigger/`guard_business_marketplace` (trigger *name* is untouched by this migration, only confirm the function column), `trg_services_listing` and `trg_staff_listing`/`tg_recompute_listing_from_business_row`, `trg_staff_services_listing`/`tg_recompute_listing_from_link`, `on_auth_user_created`/`handle_new_user`. Confirms every trigger followed its function through the rename.

Run:
```
npx supabase db query "select p.proname, array_to_string(array_agg(distinct r.rolname order by r.rolname), ',') as grantees from pg_proc p join pg_namespace n on n.oid=p.pronamespace join aclexplode(p.proacl) a on true join pg_roles r on r.oid=a.grantee where n.nspname='public' and p.proname='owns_business' group by p.proname;" --db-url "$DB_URL"
```
Expected: one row, `grantees` = `anon,authenticated,postgres,service_role` (matches the pre-rename grants on `owns_salon` — confirms the rename preserved them without a manual re-`GRANT`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814030000_business_rename_functions.sql
git commit -m "feat: rename salon-prefixed RPC functions to business-prefixed, rewrite bodies"
```

---

### Task 4: Migration 4 — cosmetic policy renames + full schema verification

**Files:**
- Create: `supabase/migrations/20260814040000_business_rename_policies.sql`

**Interfaces:**
- Consumes: the fully-renamed schema from Tasks 1–3.
- Produces: no functional change — `ALTER POLICY ... RENAME TO` only changes the policy's display name in `pg_policies`, never its `qual`/`with_check` (already correct since Task 1).

- [ ] **Step 1: Write the migration**

```sql
-- Business/Salon Terminology Rename, migration 4 of 4: cosmetic policy
-- renames. Every policy below is already functionally correct after
-- migration 1 (verified in Task 1 Step 3) — this only renames the policy
-- itself so `\d+ businesses` and friends don't show a stale "salon" name to
-- the next person reading the schema.

ALTER POLICY "Customers create own bookings" ON public.bookings RENAME TO "Customers create own bookings";
ALTER POLICY "Read own or managed bookings" ON public.bookings RENAME TO "Read own or managed bookings";
ALTER POLICY "Staff and owners create bookings for their salon" ON public.bookings RENAME TO "Staff and owners create bookings for their business";
ALTER POLICY "Update own or managed bookings" ON public.bookings RENAME TO "Update own or managed bookings";

ALTER POLICY "Owners manage promotions" ON public.promotions RENAME TO "Owners manage promotions";

ALTER POLICY "Anyone reads visible reviews" ON public.reviews RENAME TO "Anyone reads visible reviews";
ALTER POLICY "Customers delete own reviews" ON public.reviews RENAME TO "Customers delete own reviews";
ALTER POLICY "Customers edit own reviews" ON public.reviews RENAME TO "Customers edit own reviews";
ALTER POLICY "Customers write own reviews" ON public.reviews RENAME TO "Customers write own reviews";
ALTER POLICY "Owners moderate reviews" ON public.reviews RENAME TO "Owners moderate reviews";

ALTER POLICY "Anyone reads gallery of active salons" ON public.business_gallery RENAME TO "Anyone reads gallery of active businesses";
ALTER POLICY "Owners manage gallery" ON public.business_gallery RENAME TO "Owners manage gallery";

ALTER POLICY "Anyone reads salon hours" ON public.business_hours RENAME TO "Anyone reads business hours";
ALTER POLICY "Owners manage salon hours" ON public.business_hours RENAME TO "Owners manage business hours";

ALTER POLICY "Owners delete salons" ON public.businesses RENAME TO "Owners delete businesses";
ALTER POLICY "Owners insert salons" ON public.businesses RENAME TO "Owners insert businesses";
ALTER POLICY "Owners update salons" ON public.businesses RENAME TO "Owners update businesses";
ALTER POLICY "Public reads approved salons" ON public.businesses RENAME TO "Public reads approved businesses";

ALTER POLICY "Anyone reads services" ON public.services RENAME TO "Anyone reads services";
ALTER POLICY "Owners manage services" ON public.services RENAME TO "Owners manage services";

ALTER POLICY "Anyone reads staff" ON public.staff RENAME TO "Anyone reads staff";
ALTER POLICY "Owners manage staff" ON public.staff RENAME TO "Owners manage staff";

ALTER POLICY "Requester and salon managers read requests" ON public.staff_join_requests RENAME TO "Requester and business managers read requests";
ALTER POLICY "Salon managers review requests" ON public.staff_join_requests RENAME TO "Business managers review requests";
ALTER POLICY "Users cancel their pending request" ON public.staff_join_requests RENAME TO "Users cancel their pending request";
ALTER POLICY "Users create their own request" ON public.staff_join_requests RENAME TO "Users create their own request";

ALTER POLICY "Customers create own waitlist" ON public.waitlist_entries RENAME TO "Customers create own waitlist";
ALTER POLICY "Delete own waitlist" ON public.waitlist_entries RENAME TO "Delete own waitlist";
ALTER POLICY "Read own or managed waitlist" ON public.waitlist_entries RENAME TO "Read own or managed waitlist";
ALTER POLICY "Update own or managed waitlist" ON public.waitlist_entries RENAME TO "Update own or managed waitlist";
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db query -f supabase/migrations/20260814040000_business_rename_policies.sql --db-url "$DB_URL"`
Expected: a run of `ALTER POLICY` results, no errors.

- [ ] **Step 3: Full DB-side verification sweep**

Run:
```
npx supabase db query "select 'table' as kind, table_name as name from information_schema.tables where table_schema='public' and table_name ilike '%salon%' union all select 'column', table_name||'.'||column_name from information_schema.columns where table_schema='public' and column_name ilike '%salon%' union all select 'function', proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname ilike '%salon%' union all select 'policy', tablename||'.'||policyname from pg_policies where schemaname='public' and (policyname ilike '%salon%' or qual ilike '%salon%' or with_check ilike '%salon%');" --db-url "$DB_URL"
```
Expected: **zero rows** — nothing named or referencing "salon" remains anywhere in the `public` schema (tables, columns, functions, or policies).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260814040000_business_rename_policies.sql
git commit -m "chore: cosmetic RLS policy renames to match the business rename"
```

---

### Task 5: Hand-patch `src/integrations/supabase/types.ts`

**Files:**
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Consumes: the final DB schema from Tasks 1–4.
- Produces: TypeScript types matching the new schema, consumed by every file in Tasks 9–16.

Docker isn't available in this environment for `supabase gen types`, matching every prior schema change this session — this file is hand-edited to mirror the DB exactly.

- [ ] **Step 1: Rename the `salons` / `salon_gallery` / `salon_hours` table blocks**

In the `Tables` object: rename the `salons` key to `businesses`, `salon_gallery` to `business_gallery`, `salon_hours` to `business_hours`. Within each block's `Row`/`Insert`/`Update`/`Relationships`, rename every `salon_id` field to `business_id`. In `businesses.Row`/`Insert`/`Update`, no field is itself named after the table, so no further change there.

- [ ] **Step 2: Rename `salon_id`/`Relationships` entries on the 10 referencing tables**

For each of `services`, `staff`, `bookings`, `reviews`, `business_gallery`, `business_hours`, `recently_viewed`, `waitlist_entries`, `promotions`, `staff_join_requests`: rename the `salon_id` field (in `Row`/`Insert`/`Update`) to `business_id`, and in that table's `Relationships` array, rename the entry with `columns: ["salon_id"]` and `referencedRelation: "salons"` to `columns: ["business_id"]` and `referencedRelation: "businesses"`.

- [ ] **Step 3: Update the `Functions` block**

Rename these `Functions` entries (key name, and every `Args`/`Returns` field named `salon_id` → `business_id` within them): `owns_salon` → `owns_business`, `is_salon_staff` → `is_business_staff`, `get_salon_availability_summary` → `get_business_availability_summary`, `get_salon_public_staff` → `get_business_public_staff`, `submit_salon_for_review` → `submit_business_for_review`, `recompute_salon_listing` → `recompute_business_listing`, `guard_salon_marketplace` → `guard_business_marketplace` (no args to rename), `refresh_salon_rating` → `refresh_business_rating` (no args), `tg_recompute_listing_from_salon_row` → `tg_recompute_listing_from_business_row` (no args). Update `Args`/`Returns` field names on `check_promo_code` (`_salon_id`→`_business_id`), `get_marketplace_readiness` (`_salon_id`→`_business_id`), `get_available_slots` (no salon-named args — unaffected).

- [ ] **Step 4: Update the `Enums` block**

`app_role`: `"salon_owner"` → `"business_owner"` (keep the same union position). `favorite_kind`: `"salon"` → `"business"`.

- [ ] **Step 5: Typecheck to surface every now-broken consumer**

Run: `npx tsc --noEmit`
Expected: a long list of errors across the ~66 files this plan still needs to touch — this is the mechanical to-do list for Tasks 9–16, confirming Step 1–4 actually match the DB. Do not fix any of them yet; just confirm the error set makes sense (every error should point at a `.from("salons")`, `salon_id`, `"salon_owner"`, or `Salon`/`LiveSalon` type reference) before moving on.

- [ ] **Step 6: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: hand-patch generated Supabase types for the business rename"
```

---

### Task 6: Storage — create `business-media` bucket, copy objects, rewrite stored URLs

**Files:**
- Create: `scripts/migrate-salon-media-bucket.mjs`
- Create: `supabase/migrations/20260814050000_business_media_bucket.sql`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` from the environment (same pattern as every other one-off script in this project's `scripts/` directory using the service-role key).
- Produces: bucket `business-media` (private, mirroring `salon-media`) with 4 objects copied over at identical paths, plus every DB row's stored signed URL rewritten to point at the new bucket with a freshly generated signature.

**Why this needs a real script, not just SQL:** `salon-media` is a **private** bucket — every URL currently stored in `businesses.image_url`/`logo_url`/`cover_url` and `business_gallery.url` is a **long-lived signed URL** (`.../storage/v1/object/sign/salon-media/<path>?token=<HMAC over bucket+path>`), generated at upload time by `uploadAndSign()` (`src/lib/storage.ts:38-45`). A signed URL's token is cryptographically bound to its bucket+path — a text find-replace of `salon-media` → `business-media` inside the URL string would produce a syntactically valid but **cryptographically invalid** URL (wrong signature for the new path). New signed URLs must be generated via the Storage API against the new bucket after the object is actually copied there.

Confirmed via live query before writing this plan: only **1 of 5 seed businesses** has real `salon-media` URLs (`image_url`, `logo_url`, `cover_url` — 1 row each); the other 4 use static `/salons/*.jpg` app-asset paths, untouched by this migration. The bucket holds exactly **4 objects** (2 per owner, 2 owners), ~326 KB total — small enough to copy synchronously in one script run.

- [ ] **Step 1: Create the bucket + RLS policies in a migration**

```sql
-- Business/Salon Terminology Rename: business-media Storage bucket.
-- The old salon-media bucket was created outside migration tracking
-- (confirmed: no CREATE/INSERT for it exists anywhere in supabase/migrations)
-- — creating the replacement via a tracked migration is a small improvement,
-- not just parity. Policies mirror the current salon-media ones exactly
-- (read-public-with-ownership-and-approval, owner-write), swapped to the new
-- bucket_id and to the businesses table.

INSERT INTO storage.buckets (id, name, public)
VALUES ('business-media', 'business-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Read business media"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'business-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM businesses b
      WHERE (b.owner_id)::text = (storage.foldername(objects.name))[1]
        AND b.marketplace_status = 'approved'
        AND b.is_active
    )
  )
);

CREATE POLICY "Owners upload business media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'business-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners update business media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'business-media' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'business-media' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owners delete business media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'business-media' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db query -f supabase/migrations/20260814050000_business_media_bucket.sql --db-url "$DB_URL"`
Expected: `INSERT 0 1` (or `INSERT 0 0` if already run once), then 4 `CREATE POLICY` results.

- [ ] **Step 3: Write the copy + URL-rewrite script**

```js
// scripts/migrate-salon-media-bucket.mjs
//
// One-off: copies every object from the old private `salon-media` bucket to
// the new `business-media` bucket at the same path, then rewrites every
// stored image_url/logo_url/cover_url/business_gallery.url that points at
// the old bucket to a freshly-signed URL against the new one. Signed URLs
// can't be produced by text substitution (see Task 6's design note) — this
// downloads+reuploads bytes and calls createSignedUrl() for real.
//
// Usage: node scripts/migrate-salon-media-bucket.mjs
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const admin = createClient(url, key);

const OLD_BUCKET = "salon-media";
const NEW_BUCKET = "business-media";
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

async function listAllPaths(bucket) {
  const paths = [];
  async function walk(prefix) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw new Error(`list(${prefix}) failed: ${error.message}`);
    for (const entry of data ?? []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) await walk(full); // folder marker
      else paths.push(full);
    }
  }
  await walk("");
  return paths;
}

async function main() {
  const paths = await listAllPaths(OLD_BUCKET);
  console.log(`Found ${paths.length} objects in ${OLD_BUCKET}.`);

  const rewrites = []; // { oldUrlPrefix, newSignedUrl }

  for (const path of paths) {
    const { data: file, error: dlError } = await admin.storage.from(OLD_BUCKET).download(path);
    if (dlError) throw new Error(`download(${path}) failed: ${dlError.message}`);

    const { error: upError } = await admin.storage
      .from(NEW_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (upError) throw new Error(`upload(${path}) failed: ${upError.message}`);

    const { data: signed, error: signError } = await admin.storage
      .from(NEW_BUCKET)
      .createSignedUrl(path, FIVE_YEARS);
    if (signError || !signed?.signedUrl) {
      throw new Error(`createSignedUrl(${path}) failed: ${signError?.message}`);
    }

    // Old stored URLs look like:
    //   https://<host>/storage/v1/object/sign/salon-media/<path>?token=...
    // Matching on "/salon-media/<path>?" is specific enough to identify the
    // row without touching the /salons/hair.jpg-style static asset paths
    // (those never contain "/storage/v1/object/sign/").
    rewrites.push({ path, oldUrlSubstring: `/sign/${OLD_BUCKET}/${path}?`, newSignedUrl: signed.signedUrl });
    console.log(`Copied ${path}`);
  }

  let updated = 0;
  for (const col of ["image_url", "logo_url", "cover_url"]) {
    for (const r of rewrites) {
      const { data: rows, error: selError } = await admin
        .from("businesses")
        .select(`id, ${col}`)
        .like(col, `%${r.oldUrlSubstring}%`);
      if (selError) throw new Error(`select businesses.${col} failed: ${selError.message}`);
      for (const row of rows ?? []) {
        const { error: updError } = await admin
          .from("businesses")
          .update({ [col]: r.newSignedUrl })
          .eq("id", row.id);
        if (updError) throw new Error(`update businesses.${row.id}.${col} failed: ${updError.message}`);
        updated++;
        console.log(`Rewrote businesses.${row.id}.${col}`);
      }
    }
  }
  for (const r of rewrites) {
    const { data: rows, error: selError } = await admin
      .from("business_gallery")
      .select("id, url")
      .like("url", `%${r.oldUrlSubstring}%`);
    if (selError) throw new Error(`select business_gallery.url failed: ${selError.message}`);
    for (const row of rows ?? []) {
      const { error: updError } = await admin
        .from("business_gallery")
        .update({ url: r.newSignedUrl })
        .eq("id", row.id);
      if (updError) throw new Error(`update business_gallery.${row.id}.url failed: ${updError.message}`);
      updated++;
      console.log(`Rewrote business_gallery.${row.id}.url`);
    }
  }

  console.log(`Done. Copied ${paths.length} objects, rewrote ${updated} stored URL(s).`);
  console.log("Old bucket left in place — verify, then remove it in Task 7.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script**

Run: `node scripts/migrate-salon-media-bucket.mjs` (with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in the shell environment — do not hardcode the service-role key in the script or commit it).
Expected: `Found 4 objects in salon-media.`, 4 `Copied ...` lines, at least 1 `Rewrote businesses....` line (the one seed row with real `salon-media` URLs), `Done. Copied 4 objects, rewrote N stored URL(s).`

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-salon-media-bucket.mjs supabase/migrations/20260814050000_business_media_bucket.sql
git commit -m "feat: add business-media bucket and salon-media copy/rewrite script"
```

---

### Task 7: Verify the storage migration, then remove the old bucket

**Files:**
- Create: `supabase/migrations/20260814060000_drop_salon_media_bucket.sql`

**Interfaces:**
- Consumes: the copied objects and rewritten URLs from Task 6.

This is a deliberately separate, explicit step — not bundled into Task 6's script — so the copy is verified before anything old is deleted.

- [ ] **Step 1: Verify object counts match**

Run:
```
npx supabase db query "select bucket_id, count(*) from storage.objects where bucket_id in ('salon-media','business-media') group by bucket_id;" --db-url "$DB_URL"
```
Expected: both buckets show `count = 4`.

- [ ] **Step 2: Spot-check a rewritten URL actually resolves**

Run:
```
npx supabase db query "select id, image_url, logo_url, cover_url from public.businesses where image_url like '%business-media%' or logo_url like '%business-media%' or cover_url like '%business-media%';" --db-url "$DB_URL"
```
Expected: at least 1 row, and none of the returned URLs contain the substring `salon-media`.

Run:
```
npx supabase db query "select count(*) from public.businesses where image_url like '%salon-media%' or logo_url like '%salon-media%' or cover_url like '%salon-media%';" --db-url "$DB_URL"
```
Expected: `0` — no row still points at the old bucket.

- [ ] **Step 3: Write and apply the bucket-removal migration**

```sql
-- Business/Salon Terminology Rename: remove the old salon-media bucket now
-- that Task 7's verification confirmed every object was copied and every
-- stored URL rewritten to point at business-media.

DELETE FROM storage.objects WHERE bucket_id = 'salon-media';
DELETE FROM storage.buckets WHERE id = 'salon-media';
DROP POLICY IF EXISTS "Read salon media" ON storage.objects;
DROP POLICY IF EXISTS "Owners upload salon media" ON storage.objects;
DROP POLICY IF EXISTS "Owners update salon media" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete salon media" ON storage.objects;
```

Run: `npx supabase db query -f supabase/migrations/20260814060000_drop_salon_media_bucket.sql --db-url "$DB_URL"`
Expected: `DELETE 4`, `DELETE 1`, then 4 `DROP POLICY` results.

- [ ] **Step 4: Final verify**

Run:
```
npx supabase db query "select count(*) from storage.buckets where id='salon-media';" --db-url "$DB_URL"
```
Expected: `0`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814060000_drop_salon_media_bucket.sql
git commit -m "chore: remove old salon-media bucket after verified copy to business-media"
```

---

### Task 8: Re-point the 8 upload call sites at `business-media`

**Files:**
- Modify: `src/routes/business/signup.tsx:450,451,453`
- Modify: `src/components/admin/specialist-wizard.tsx:145,169`
- Modify: `src/routes/_authenticated/admin/services.tsx:179`
- Modify: `src/routes/_authenticated/admin/settings.tsx:300,302`

**Interfaces:**
- Consumes: `uploadAndSign(bucket, userId, file)` from `src/lib/storage.ts` (unchanged signature — only the bucket-name argument changes at each call site).

- [ ] **Step 1: Replace the bucket literal at all 8 call sites**

In each of the 4 files listed above, every occurrence of the string literal `"salon-media"` passed as the first argument to `uploadAndSign(...)` becomes `"business-media"`. There are no other uses of the string `"salon-media"` in `src/` after Task 6/7 land (verified: the only other occurrences were the storage policy bodies, already handled in the DB migrations).

- [ ] **Step 2: Confirm no stray references remain**

Run (PowerShell): `Select-String -Path src\**\*.ts,src\**\*.tsx -Pattern "salon-media" -Recurse`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/routes/business/signup.tsx src/components/admin/specialist-wizard.tsx src/routes/_authenticated/admin/services.tsx src/routes/_authenticated/admin/settings.tsx
git commit -m "chore: point upload call sites at the business-media bucket"
```

---

### Task 9: Route file rename — `/salon/$salonId` → `/business/$businessId`

**Files:**
- Rename: `src/routes/salon.$salonId.tsx` → `src/routes/business.$businessId.tsx`
- Create: new `src/routes/salon.$salonId.tsx` (thin redirect shim)
- Modify: `src/routeTree.gen.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: route `/business/$businessId`, param `businessId` (replacing `salonId`).
- Consumes: `businesses`/`business_gallery`/`business_hours` tables and the renamed RPCs from Tasks 1–5; `Business`/`LiveBusiness` types from Task 10 (this task can proceed with the old `Salon`/`LiveSalon` names still in scope and let Task 10 catch up the imports — see Step 4).

This is the single largest file in the rename (1,554 lines; 36 occurrences of `salonId`, 10 of `salon_id`, 106 of "salon" case-insensitive total, confirmed via direct grep against the file before this plan was written). Given the file's size, this task is a mechanical find-and-replace pass rather than a full reprint — the replacements are unambiguous because `salonId`/`salon_id` never collide with an unrelated identifier anywhere in this file (confirmed by the same grep).

- [ ] **Step 1: Rename the file**

```bash
git mv src/routes/salon.$salonId.tsx src/routes/business.$businessId.tsx
```

- [ ] **Step 2: Mechanical rename inside the renamed file**

Within `src/routes/business.$businessId.tsx`, apply these substitutions throughout (every occurrence, case-sensitive):
- `salonId` → `businessId` (route param name, `Route.useParams()` destructuring, every local variable/prop named `salonId`, every `navigate({ to: "/salon/$salonId", params: { salonId } })` call — the route path string itself also changes, see next bullet)
- The literal route path string `"/salon/$salonId"` → `"/business/$businessId"` (used in every internal `navigate(...)` call in this file)
- `salon_id` → `business_id` (every raw Supabase filter/column reference, e.g. `.eq("salon_id", ...)`, RPC arg keys `_salon_id` → `_business_id`)
- `.from("salons")` → `.from("businesses")`, `.from("salon_gallery")` → `.from("business_gallery")`, `.from("salon_hours")` → `.from("business_hours")`
- `.rpc("get_salon_public_staff", ...)` → `.rpc("get_business_public_staff", ...)`, `.rpc("get_salon_availability_summary", ...)` → `.rpc("get_business_availability_summary", ...)`, `.rpc("submit_salon_for_review", ...)` → `.rpc("submit_business_for_review", ...)` (this one lives in `admin/marketplace.tsx`, not this file — listed here only as a reminder it's part of the same RPC-rename family covered in Task 14), `.rpc("check_promo_code", { _salon_id: ... })` → `.rpc("check_promo_code", { _business_id: ... })`
- `kind="salon"` (the `<FavoriteButton>` call at line 791) → `kind="business"`
- The local variable/prop named `salon` (the fetched row) may stay named `salon` or be renamed to `business` — **rename it to `business`** for consistency with every other renamed file in this plan (`SalonAbout`/`SalonOverview`/`SalonReviews` all take a `business` prop after Task 13); update every `salon.` member access in the file accordingly.
- Import `import { SalonAbout } from "@/components/dallty/salon-about"` → `import { BusinessAbout } from "@/components/dallty/business-about"` (and its usage `<SalonAbout salon={...} />` → `<BusinessAbout business={...} />`); same pattern for `SalonOverview` → `BusinessOverview` and `SalonReviews` → `BusinessReviews` (imports land once Task 13 renames those files — if this task runs before Task 13, leave these three imports pointing at the old paths/names for now and note it as a follow-up; if Task 13 already ran, use the new names directly).

- [ ] **Step 2: Create the redirect shim at the old path**

```tsx
// src/routes/salon.$salonId.tsx
//
// Permanent redirect for the old /salon/$salonId URL. Kept as a thin shim
// (not a code back-compat layer — the business rename dropped every other
// old name outright) purely so an already-shared or bookmarked link doesn't
// 404. Preserves the search string (e.g. ?book=true) across the redirect.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/salon/$salonId")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/business/$businessId",
      params: { businessId: params.salonId },
      search: location.search,
      replace: true,
    });
  },
});
```

- [ ] **Step 3: Regenerate the route tree**

Run: `npx tsc --noEmit` once with the dev server NOT running first to confirm the route files themselves compile; then start the dev server (`npx vite` or the project's existing `npm run dev`, whichever `.claude/launch.json`'s `dallty-dev` config uses) — TanStack Router's Vite plugin regenerates `src/routeTree.gen.ts` automatically on file-route changes. Do not hand-edit `routeTree.gen.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/business.\$businessId.tsx src/routes/salon.\$salonId.tsx src/routeTree.gen.ts
git commit -m "feat: rename /salon/:salonId route to /business/:businessId, add redirect shim"
```

---

### Task 10: Shared types `Salon`→`Business`, `LiveSalon`→`LiveBusiness`, and their consumer files

**Files:**
- Modify: `src/lib/dallty-content.ts`
- Rename: `src/hooks/use-live-salons.ts` → `src/hooks/use-live-businesses.ts`
- Rename: `src/components/dallty/salon-card.tsx` → `src/components/dallty/business-card.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/search.tsx`

**Interfaces:**
- Produces: `Business` type (`src/lib/dallty-content.ts`), `LiveBusiness` type + `useLiveBusinesses()` hook (`src/hooks/use-live-businesses.ts`), `BusinessCard` component (`src/components/dallty/business-card.tsx`).
- Consumes: `businesses` table (Task 1), `business.$businessId` route (Task 9).

Two naming collisions were found during the pre-plan audit and are called out explicitly so the rename doesn't conflate them: `dallty-content.ts`'s `Salon` (static/mock content shape — `id`, `image`, nested `en`/`ar`, `rating`, etc.) is unrelated to `salon-about.tsx`'s local, non-exported `Salon` (a DB-row shape — handled separately in Task 13). Similarly `use-live-salons.ts`'s exported `LiveSalon` and `index.tsx`'s local non-exported `LiveSalon` are two different-but-similarly-named types — both rename to `LiveBusiness`, and since one is non-exported there's no compile collision.

- [ ] **Step 1: Rename the `Salon` type and `salons` array in `dallty-content.ts`**

In `src/lib/dallty-content.ts`: rename `export type Salon = {...}` (lines 17-28) to `export type Business`, and rename `export const salons: Salon[] = [...]` (line 30) to `export const businesses: Business[] = [...]` (keep every field and every seed entry unchanged — only the type/const names change). Update the `stats` copy entry `["10,000+", "Salons"]` (line 95) — **leave this one alone**, it's aggregate marketing copy in scope of the spec's "stays beauty-flavored" decision, not a type reference.

- [ ] **Step 2: Rename and update `use-live-salons.ts`**

```bash
git mv src/hooks/use-live-salons.ts src/hooks/use-live-businesses.ts
```

Rewrite its contents:

```ts
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { provinceOfCity } from "@/lib/arab-cities";
import type { Business } from "@/lib/dallty-content";

export type LiveBusiness = Business & {
  countryCode: string;
  state: string;
  city: string;
  businessType: string;
  lat: number | null;
  lng: number | null;
};

const BUSINESS_COLUMNS =
  "id, owner_id, name, name_ar, description, description_ar, area, area_ar, city, image_url, rating, review_count, price_range, distance_km, opens_at, closes_at, instant_booking, is_active, created_at, address, status, business_type, country, country_code, district, logo_url, cover_url, is_listed, latitude, longitude";

export function useLiveBusinesses() {
  return useQuery({
    queryKey: ["businesses"],
    queryFn: async (): Promise<LiveBusiness[]> => {
      const { data, error } = await supabase
        .from("businesses")
        .select(BUSINESS_COLUMNS)
        .eq("is_active", true)
        .eq("is_listed", true)
        .order("rating", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((b) => ({
        id: b.id,
        image: b.image_url ?? "/salons/hair.jpg",
        en: { name: b.name, area: b.area, tags: `${b.area} · ${b.city}` },
        ar: { name: b.name_ar ?? b.name, area: b.area_ar ?? b.area, tags: b.area_ar ?? b.area },
        rating: Number(b.rating),
        reviews: b.review_count ?? 0,
        distanceKm: Number(b.distance_km ?? 0),
        price: b.price_range ?? "$$",
        open: b.is_active,
        instant: Boolean(b.instant_booking),
        countryCode: (b.country_code ?? "").toUpperCase(),
        state: b.district ?? provinceOfCity((b.country_code ?? "").toUpperCase(), b.city ?? ""),
        city: b.city ?? "",
        businessType: b.business_type ?? "",
        lat: b.latitude === null || b.latitude === undefined ? null : Number(b.latitude),
        lng: b.longitude === null || b.longitude === undefined ? null : Number(b.longitude),
      }));
    },
  });
}
```

Note: `/salons/hair.jpg` is a static app-asset fallback path under `public/salons/` — out of scope for this rename (it's a bundled placeholder image path, not a DB or API name; the spec's blast-radius audit covers TS/React source and the DB, not public asset directory names).

- [ ] **Step 3: Rename and update `salon-card.tsx`**

```bash
git mv src/components/dallty/salon-card.tsx src/components/dallty/business-card.tsx
```

In the renamed file: `import type { Lang, Salon } from "@/lib/dallty-content"` → `import type { Lang, Business } from "@/lib/dallty-content"`; `export function SalonCard({ salon, lang, travel }: { salon: Salon; ... })` → `export function BusinessCard({ business, lang, travel }: { business: Business; ... })`; every `salon.` member access → `business.`; the two `to="/salon/$salonId"` / `params={{ salonId: salon.id }}` pairs (lines 60-62, 103-105, 110-112) → `to="/business/$businessId"` / `params={{ businessId: business.id }}`.

- [ ] **Step 4: Update consumers of the renamed exports**

In `src/routes/index.tsx`: `import { categories, salons, type Salon } from "@/lib/dallty-content"` → `import { categories, businesses, type Business } from "@/lib/dallty-content"`; the local `type LiveSalon = Salon & {...}` → `type LiveBusiness = Business & {...}`; every use of `salons`/`Salon`/`LiveSalon`/`SalonCard` in the rest of the file → `businesses`/`Business`/`LiveBusiness`/`BusinessCard`; import `SalonCard` from `"@/components/dallty/salon-card"` → `BusinessCard` from `"@/components/dallty/business-card"`; `.from("salons")` (line 97) → `.from("businesses")`.

In `src/routes/search.tsx`: `import { useLiveSalons, type LiveSalon } from "@/hooks/use-live-salons"` (or equivalent) → `import { useLiveBusinesses, type LiveBusiness } from "@/hooks/use-live-businesses"`; every call-site use of `useLiveSalons()`/`LiveSalon` → `useLiveBusinesses()`/`LiveBusiness`; the `"Nearby salons"` string on line 483 stays untouched (aggregate copy, spec decision #4).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors remaining only in files not yet touched by this plan (Tasks 11–16) — no error should reference `dallty-content.ts`, `use-live-businesses.ts`, `business-card.tsx`, `index.tsx`, or `search.tsx` anymore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dallty-content.ts src/hooks/use-live-businesses.ts src/hooks/use-live-salons.ts src/components/dallty/business-card.tsx src/components/dallty/salon-card.tsx src/routes/index.tsx src/routes/search.tsx
git commit -m "feat: rename Salon/LiveSalon shared types and their card/hook to Business/LiveBusiness"
```

---

### Task 11: `AppRole` + every `hasRole`/role-literal call site

**Files:**
- Modify: `src/hooks/use-auth.tsx:6,29`
- Modify: `src/lib/admin.ts:63,125`
- Modify: `src/routes/business/signup.tsx:360`
- Modify: `src/lib/password-policy.ts:25`
- Modify: `src/lib/platform.functions.ts:341`
- Modify: `src/lib/post-login.ts:12,26,41`
- Modify: `src/routes/_authenticated/dashboard.tsx:80`
- Modify: `src/routes/_authenticated/bookings.tsx:53,112`
- Modify: `src/routes/_authenticated/admin/route.tsx:33,44`
- Modify: `src/routes/_authenticated/admin/platform/auth-policies.tsx:32`

**Interfaces:**
- Produces: `AppRole = "client" | "business_owner" | "specialist" | "admin" | "super_admin"`.
- Consumes: `app_role.business_owner` (Task 2).

- [ ] **Step 1: `use-auth.tsx` — the type definition**

```ts
export type AppRole = "client" | "business_owner" | "specialist" | "admin" | "super_admin";
```
and
```ts
const PRIORITY: AppRole[] = ["super_admin", "admin", "business_owner", "specialist", "client"];
```

- [ ] **Step 2: `admin.ts` — the two `hasRole` guards**

Line 63: `hasRole("salon_owner") || hasRole("specialist") || hasRole("admin") || hasRole("super_admin");` → `hasRole("business_owner") || hasRole("specialist") || hasRole("admin") || hasRole("super_admin");`
Line 125: `!hasRole("salon_owner") &&` → `!hasRole("business_owner") &&`

- [ ] **Step 3: `business/signup.tsx` — the signup metadata**

Line 360: `role: "salon_owner",` → `role: "business_owner",` (this is the `user_metadata.role` sent to Supabase signup, consumed as plain text by `handle_new_user()` — Task 3 already updated that function's comparison to `'business_owner'`, so this and that must both be correct or new signups get silently defaulted to `client`).

- [ ] **Step 4: `password-policy.ts` — the role list entry**

Line 25: `"salon_owner",` → `"business_owner",` (a plain array literal — confirm its surrounding context still reads correctly by viewing a few lines around it before editing).

- [ ] **Step 5: `platform.functions.ts` — the hand-written Zod schema**

Line 341: `role: z.enum(["client", "specialist", "salon_owner", "admin", "super_admin"]),` → `role: z.enum(["client", "specialist", "business_owner", "admin", "super_admin"]),` (this schema is a separate, hand-maintained mirror of `AppRole` — not derived from the type — so it needs its own edit, not just relying on Step 1).

- [ ] **Step 6: `post-login.ts` — landing-page resolution**

```ts
/** Does this user already own at least one business? */
export async function hasOwnedBusiness(userId: string): Promise<boolean> {
  const { data } = await supabase.from("businesses").select("id").eq("owner_id", userId).limit(1);
  return Boolean(data?.length);
}
```
(rename `hasOwnedSalon` → `hasOwnedBusiness` and update its one call site inside this same file). Line 26: `if (roles.includes("salon_owner")) return (await hasOwnedSalon(userId)) ? "/admin" : "/business/signup";` → `if (roles.includes("business_owner")) return (await hasOwnedBusiness(userId)) ? "/admin" : "/business/signup";`. Line 41: `if (roles.includes("salon_owner")) return "/admin";` → `if (roles.includes("business_owner")) return "/admin";`.

- [ ] **Step 7: `dashboard.tsx` — the owner check**

Line 80: `const isOwner = hasRole("salon_owner") || hasRole("admin");` → `const isOwner = hasRole("business_owner") || hasRole("admin");`

- [ ] **Step 8: `bookings.tsx` — label map and role check**

Line 53: `salon_owner: "Salon owner",` → `business_owner: "Business owner",` (this is both a role-literal key rename and a copy update — do both in the same edit). Line 112: `if (primaryRole === "salon_owner") {` → `if (primaryRole === "business_owner") {`

- [ ] **Step 9: `admin/route.tsx` — the guard**

Line 33: `hasRole("salon_owner") || hasRole("specialist") || hasRole("admin") || hasRole("super_admin");` → `hasRole("business_owner") || hasRole("specialist") || hasRole("admin") || hasRole("super_admin");`. Line 44: read the exact current text before editing (the pre-plan audit flagged uncertainty over whether this line negates the check or not — confirm with the surrounding `if`/`return` before changing `hasRole("salon_owner")` to `hasRole("business_owner")` so the polarity is preserved exactly).

- [ ] **Step 10: `auth-policies.tsx` — the Super Admin label map**

Line 32: `salon_owner: "Salon owner",` → `business_owner: "Business owner",`

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: no more errors referencing `"salon_owner"`, `AppRole`, or `hasOwnedSalon` anywhere.

- [ ] **Step 12: Commit**

```bash
git add src/hooks/use-auth.tsx src/lib/admin.ts src/routes/business/signup.tsx src/lib/password-policy.ts src/lib/platform.functions.ts src/lib/post-login.ts src/routes/_authenticated/dashboard.tsx src/routes/_authenticated/bookings.tsx src/routes/_authenticated/admin/route.tsx src/routes/_authenticated/admin/platform/auth-policies.tsx
git commit -m "feat: rename AppRole salon_owner to business_owner across every call site"
```

---

### Task 12: `FavoriteKind` rename (`"salon"` → `"business"`)

**Files:**
- Modify: `src/components/dallty/favorite-button.tsx:8`
- Modify: `src/routes/business.$businessId.tsx` (already covered by Task 9's `kind="salon"` → `kind="business"` substitution — this task confirms it, doesn't redo it)
- Modify: `src/routes/_authenticated/favorites.tsx:37,144`

**Interfaces:**
- Produces: `FavoriteKind = "business" | "staff" | "service"`.
- Consumes: `favorite_kind.business` (Task 2).

- [ ] **Step 1: `favorite-button.tsx`**

```ts
export type FavoriteKind = "business" | "staff" | "service";
```
(line 8 — the rest of the file, `useFavorites`/`FavoriteButton`, is generic over `kind` and needs no other change).

- [ ] **Step 2: `favorites.tsx`**

Line 37: `const salonIds = rows.filter((r) => r.kind === "salon").map((r) => r.target_id);` → `const businessIds = rows.filter((r) => r.kind === "business").map((r) => r.target_id);` (rename the variable too, and update every later reference to `salonIds` in this file to `businessIds`). Line 144: `<FavoriteButton kind="salon" targetId={salon.id} label={salon.name} />` → `<FavoriteButton kind="business" targetId={business.id} label={business.name} />` (this line's `salon`/`business` local-variable name depends on how Task 14 renames this file's fetched-row variable — keep them consistent within this file).

- [ ] **Step 3: Confirm no stray `category: "salon"` got caught by the same find-replace**

`src/lib/business.functions.ts:116` has an unrelated `category: "salon"` field (a `business_gallery` row's image-category tag, not a favorite-kind) — confirm this line is untouched by this task (it changes in Task 14 as part of `business.functions.ts`'s broader `.from("salon_gallery")` rewrite, where `category: "salon"` should become `category: "interior"` or another real gallery category — **not** `category: "business"`, since gallery categories are a separate free-text vocabulary from favorite kinds; check `business_gallery`'s `category` default value, `'interior'`, confirmed via the DB schema in Task 1, and use that or leave the literal string as a deliberate, still-valid category tag rather than renaming it to match the unrelated favorite-kind enum).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no more errors referencing `FavoriteKind`, `kind === "salon"`, or `kind="salon"`.

- [ ] **Step 5: Commit**

```bash
git add src/components/dallty/favorite-button.tsx src/routes/_authenticated/favorites.tsx
git commit -m "feat: rename FavoriteKind salon to business"
```

---

### Task 13: Server-function and component file renames

**Files:**
- Rename: `src/lib/salon-settings.functions.ts` → `src/lib/business-settings.functions.ts`
- Rename: `src/lib/salon-crm.functions.ts` → `src/lib/business-crm.functions.ts`
- Rename: `src/lib/salon-crm.server.ts` → `src/lib/business-crm.server.ts`
- Rename: `src/components/dallty/salon-about.tsx` → `src/components/dallty/business-about.tsx`
- Rename: `src/components/dallty/salon-overview.tsx` → `src/components/dallty/business-overview.tsx`
- Rename: `src/components/dallty/salon-reviews.tsx` → `src/components/dallty/business-reviews.tsx`
- Modify: every importer of the six files above

**Interfaces:**
- Produces: `getBusinessPrivateContact`, `BusinessSettingsPatch`, `getBusinessSettings`, `saveBusinessSettings` (from `business-settings.functions.ts`); `listBusinessCustomers` (from `business-crm.functions.ts`); `assertCanManageBusiness` (from `business-crm.server.ts`); `BusinessAbout({ business })`, `BusinessOverview({ business, services, staffCount, onBook })`, `BusinessReviews({ businessId, isOwner })`.
- Consumes: `businesses`/`business_hours` tables, `owns_business` RPC (Tasks 1–5); `Business` type (Task 10).

- [ ] **Step 1: Rename and rewrite `salon-settings.functions.ts`**

```bash
git mv src/lib/salon-settings.functions.ts src/lib/business-settings.functions.ts
```

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Private contact details of a business (business email / private business
 * phone). These columns are not readable by the Data API roles, so only the
 * verified owner or a platform admin can read them through this function.
 */
export const getBusinessPrivateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (roleError) throw new Error(roleError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: business, error } = await supabaseAdmin
      .from("businesses")
      .select("id, owner_id, business_email, business_phone")
      .eq("id", data.businessId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!business) throw new Error("Business not found");
    if (!allowed && business.owner_id !== context.userId) {
      throw new Error("You do not manage this business");
    }

    return {
      businessEmail: business.business_email ?? "",
      businessPhone: business.business_phone ?? "",
    };
  });

const SETTINGS_COLUMNS = [
  "id",
  "name",
  "name_ar",
  "description",
  "description_ar",
  "business_type",
  "categories",
  "phone",
  "business_email",
  "business_phone",
  "website_url",
  "instagram_url",
  "facebook_url",
  "tiktok_url",
  "address",
  "country",
  "country_code",
  "city",
  "district",
  "area",
  "postal_code",
  "latitude",
  "longitude",
  "maps_url",
  "timezone",
  "currency",
  "opens_at",
  "closes_at",
  "logo_url",
  "cover_url",
  "image_url",
  "instant_booking",
  "booking_confirmation",
  "buffer_minutes",
  "cancellation_hours",
  "max_booking_days",
  "slot_interval_minutes",
  "min_notice_hours",
  "allow_waitlist",
  "cancellation_policy",
  "cancellation_policy_ar",
  "house_rules",
  "house_rules_ar",
  "owner_story",
  "notify_new_booking",
  "notify_cancellation",
  "notify_review",
  "notify_daily_summary",
  "notify_email_address",
  "accept_cash",
  "accept_card",
  "accept_online",
  "require_deposit",
  "deposit_percent",
  "tax_rate",
  "seo_title",
  "seo_description",
  "seo_keywords",
  "is_active",
  "marketplace_status",
  "is_verified",
  "plan",
  "trial_ends_at",
].join(", ");

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    name_ar: z.string().trim().max(120).nullable(),
    description: z.string().trim().max(4000).nullable(),
    description_ar: z.string().trim().max(4000).nullable(),
    business_type: z.string().trim().max(80).nullable(),
    categories: z.array(z.string().trim().max(60)).max(20),
    phone: z.string().trim().max(40).nullable(),
    business_email: z.string().trim().max(160).nullable(),
    business_phone: z.string().trim().max(40).nullable(),
    website_url: z.string().trim().max(300).nullable(),
    instagram_url: z.string().trim().max(300).nullable(),
    facebook_url: z.string().trim().max(300).nullable(),
    tiktok_url: z.string().trim().max(300).nullable(),
    address: z.string().trim().max(300).nullable(),
    country: z.string().trim().max(80).nullable(),
    country_code: z.string().trim().max(4),
    city: z.string().trim().max(120),
    district: z.string().trim().max(120).nullable(),
    area: z.string().trim().max(120),
    postal_code: z.string().trim().max(20).nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    maps_url: z.string().trim().max(500).nullable(),
    timezone: z.string().trim().max(60),
    currency: z.string().trim().max(8),
    opens_at: z.string().max(8),
    closes_at: z.string().max(8),
    logo_url: z.string().max(2000).nullable(),
    cover_url: z.string().max(2000).nullable(),
    image_url: z.string().max(2000).nullable(),
    instant_booking: z.boolean(),
    booking_confirmation: z.string().max(30),
    buffer_minutes: z.number().int().min(0).max(240),
    cancellation_hours: z.number().int().min(0).max(720),
    max_booking_days: z.number().int().min(1).max(365),
    slot_interval_minutes: z.number().int().min(5).max(120),
    min_notice_hours: z.number().int().min(0).max(240),
    allow_waitlist: z.boolean(),
    cancellation_policy: z.string().max(4000).nullable(),
    cancellation_policy_ar: z.string().max(4000).nullable(),
    house_rules: z.string().max(4000).nullable(),
    house_rules_ar: z.string().max(4000).nullable(),
    owner_story: z.string().max(4000).nullable(),
    notify_new_booking: z.boolean(),
    notify_cancellation: z.boolean(),
    notify_review: z.boolean(),
    notify_daily_summary: z.boolean(),
    notify_email_address: z.string().trim().max(160).nullable(),
    accept_cash: z.boolean(),
    accept_card: z.boolean(),
    accept_online: z.boolean(),
    require_deposit: z.boolean(),
    deposit_percent: z.number().min(0).max(100),
    tax_rate: z.number().min(0).max(100),
    seo_title: z.string().trim().max(120).nullable(),
    seo_description: z.string().trim().max(320).nullable(),
    seo_keywords: z.string().trim().max(300).nullable(),
    is_active: z.boolean(),
  })
  .partial();

export type BusinessSettingsPatch = z.infer<typeof patchSchema>;

const hoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      is_closed: z.boolean(),
      opens_at: z.string().max(8),
      closes_at: z.string().max(8),
    }),
  )
  .max(7);

async function assertManages(context: { supabase: any; userId: string }, businessId: string) {
  const { data: allowed, error } = await context.supabase.rpc("is_platform_admin", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: business, error: businessError } = await supabaseAdmin
    .from("businesses")
    .select("id, owner_id")
    .eq("id", businessId)
    .maybeSingle();
  if (businessError) throw new Error(businessError.message);
  if (!business) throw new Error("Business not found");
  if (!allowed && business.owner_id !== context.userId) {
    throw new Error("You do not manage this business");
  }
  return supabaseAdmin;
}

/** Every settings field for the business the caller manages. */
export const getBusinessSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertManages(context as any, data.businessId);
    const [{ data: business, error }, { data: hours, error: hoursError }] = await Promise.all([
      admin.from("businesses").select(SETTINGS_COLUMNS).eq("id", data.businessId).maybeSingle(),
      admin
        .from("business_hours")
        .select("weekday, is_closed, opens_at, closes_at")
        .eq("business_id", data.businessId)
        .order("weekday"),
    ]);
    if (error) throw new Error(error.message);
    if (hoursError) throw new Error(hoursError.message);
    return { business: business as Record<string, any> | null, hours: hours ?? [] };
  });

/** Saves an allow-listed patch of settings, plus the weekly opening hours. */
export const saveBusinessSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        patch: patchSchema,
        hours: hoursSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertManages(context as any, data.businessId);

    if (Object.keys(data.patch).length > 0) {
      const { error } = await admin
        .from("businesses")
        .update({ ...data.patch, updated_at: new Date().toISOString() })
        .eq("id", data.businessId);
      if (error) throw new Error(error.message);
    }

    if (data.hours && data.hours.length > 0) {
      const rows = data.hours.map((h) => ({ ...h, business_id: data.businessId }));
      const { error } = await admin
        .from("business_hours")
        .upsert(rows, { onConflict: "business_id,weekday" });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });
```

- [ ] **Step 2: Rename and rewrite `salon-crm.server.ts`**

```bash
git mv src/lib/salon-crm.server.ts src/lib/business-crm.server.ts
```

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/** Throws unless the caller owns the business (or is a platform admin). */
export async function assertCanManageBusiness(
  supabase: AnySupabase,
  userId: string,
  businessId: string,
) {
  const [{ data: owns }, { data: isAdmin }] = await Promise.all([
    supabase.rpc("owns_business", { _user_id: userId, _business_id: businessId }),
    supabase.rpc("is_platform_admin", { _user_id: userId }),
  ]);
  if (!owns && !isAdmin) throw new Error("Forbidden: you do not manage this business");
}
```

- [ ] **Step 3: Rename and rewrite `salon-crm.functions.ts`**

```bash
git mv src/lib/salon-crm.functions.ts src/lib/business-crm.functions.ts
```

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const businessInput = z.object({ businessId: z.string().uuid() });

/**
 * Customer book for a single business: every client who ever booked there,
 * with spend, visit counts and contact details. Owners/managers only.
 */
export const listBusinessCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => businessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context.supabase, context.userId, data.businessId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, service_id, staff_id, starts_at, status, total_price")
      .eq("business_id", data.businessId)
      .order("starts_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const customerIds = [...new Set((bookings ?? []).map((b) => b.customer_id))];
    if (!customerIds.length) return [];

    const [{ data: profiles }, { data: services }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, phone, gender, birthday, skin_type, hair_type, allergies, beauty_notes")
        .in("id", customerIds),
      supabaseAdmin.from("services").select("id, name").eq("business_id", data.businessId),
    ]);

    const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
    const now = Date.now();

    return customerIds.map((id) => {
      const mine = (bookings ?? []).filter((b) => b.customer_id === id);
      const completed = mine.filter((b) => b.status === "completed");
      const upcoming = mine
        .filter((b) => new Date(b.starts_at).getTime() > now && b.status !== "cancelled")
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0];
      const past = mine.filter((b) => new Date(b.starts_at).getTime() <= now)[0];
      const counts = new Map<string, number>();
      mine.forEach((b) => counts.set(b.service_id, (counts.get(b.service_id) ?? 0) + 1));
      const favourite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const profile = profiles?.find((p) => p.id === id);

      return {
        id,
        fullName: profile?.full_name || "Guest",
        phone: profile?.phone ?? "",
        gender: profile?.gender ?? null,
        birthday: profile?.birthday ?? null,
        skinType: profile?.skin_type ?? null,
        hairType: profile?.hair_type ?? null,
        allergies: profile?.allergies ?? null,
        notes: profile?.beauty_notes ?? null,
        bookings: mine.length,
        cancelled: mine.filter((b) => b.status === "cancelled").length,
        totalSpent: completed.reduce((sum, b) => sum + Number(b.total_price ?? 0), 0),
        lastVisit: past?.starts_at ?? null,
        nextVisit: upcoming?.starts_at ?? null,
        favouriteService: favourite ? (serviceName.get(favourite) ?? null) : null,
      };
    });
  });
```

- [ ] **Step 4: Rename `salon-about.tsx`, `salon-overview.tsx`, `salon-reviews.tsx`**

```bash
git mv src/components/dallty/salon-about.tsx src/components/dallty/business-about.tsx
git mv src/components/dallty/salon-overview.tsx src/components/dallty/business-overview.tsx
git mv src/components/dallty/salon-reviews.tsx src/components/dallty/business-reviews.tsx
```

In `business-about.tsx`: rename the local `type Salon = {...}` (lines 42-57) to `type Business`; rename `export function SalonAbout({ salon }: { salon: Salon })` to `export function BusinessAbout({ business }: { business: Business })`; every `salon.` member access in the function body → `business.`; the query: `.from("salon_gallery")` → `.from("business_gallery")`, `.eq("salon_id", salon.id)` → `.eq("business_id", business.id)`, `queryKey: ["salon-gallery", salon.id]` → `queryKey: ["business-gallery", business.id]`.

In `business-overview.tsx`: rename the local `type SalonRow = {...}` (lines 5-26) to `type BusinessRow`; rename `export function SalonOverview({ salon, services, staffCount, onBook }: { salon: SalonRow; ... })` to `export function BusinessOverview({ business, services, staffCount, onBook }: { business: BusinessRow; ... })`; every `salon.` member access → `business.`. This is also where `businessCategoryLabel()` gets wired in (Task 15) — leave the `salon.business_type` badge (lines 87-91) as `business.business_type` for now; Task 15 replaces its *content*, not its rename.

In `business-reviews.tsx`: rename `export function SalonReviews({ salonId, isOwner }: { salonId: string; isOwner: boolean })` to `export function BusinessReviews({ businessId, isOwner }: { businessId: string; isOwner: boolean })`; every `salonId` reference in the body (including `.eq("salon_id", salonId)` → `.eq("business_id", businessId)`) → `businessId`.

- [ ] **Step 5: Update every importer of these six files**

Run (PowerShell, to find every remaining importer after the six files above are done): `Select-String -Path src\**\*.ts,src\**\*.tsx -Pattern 'from "@/lib/salon-settings\.functions"|from "@/lib/salon-crm\.(functions|server)"|from "@/components/dallty/salon-(about|overview|reviews)"' -Recurse`

Expected known importers (update each to the new path and new export names): `src/routes/business.$businessId.tsx` (imports `BusinessAbout`/`BusinessOverview`/`BusinessReviews`, per Task 9 Step 2's note), `src/routes/_authenticated/admin/settings.tsx` (imports `getBusinessSettings`/`saveBusinessSettings`/`getBusinessPrivateContact`/`BusinessSettingsPatch`), `src/routes/_authenticated/admin/customers.tsx` (imports `listBusinessCustomers`), `src/lib/staff-access.functions.ts` (if it imports `assertCanManageBusiness` — confirm via the grep above). After updating each, re-run the grep and confirm it returns nothing.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no more errors referencing any of the six old file paths or their old export names.

- [ ] **Step 7: Commit**

```bash
git add src/lib/business-settings.functions.ts src/lib/salon-settings.functions.ts src/lib/business-crm.functions.ts src/lib/salon-crm.functions.ts src/lib/business-crm.server.ts src/lib/salon-crm.server.ts src/components/dallty/business-about.tsx src/components/dallty/salon-about.tsx src/components/dallty/business-overview.tsx src/components/dallty/salon-overview.tsx src/components/dallty/business-reviews.tsx src/components/dallty/salon-reviews.tsx
git commit -m "feat: rename salon-prefixed server-function and component files to business-*"
```

---

### Task 14: Remaining `.from("salons"...)` call sites, `salon_id`/`salonId` variables, and RPC param renames

**Files (every one confirmed via grep against the live codebase before this plan was written; none overlap with Tasks 9–13's files):**
- `src/lib/business.functions.ts`
- `src/lib/marketplace.functions.ts`
- `src/lib/admin.ts`
- `src/lib/platform.functions.ts`
- `src/lib/platform-directory.server.ts`
- `src/lib/staff-access.functions.ts`
- `src/lib/staff-access.server.ts`
- `src/lib/staff-desk.functions.ts`
- `src/lib/staff-desk.server.ts`
- `src/lib/account.functions.ts`
- `src/lib/business-status-email.server.ts`
- `src/lib/pending-booking.ts`
- `src/components/admin/admin-shell.tsx`
- `src/components/admin/specialist-wizard.tsx`
- `src/components/admin/booking-details-dialog.tsx`
- `src/routes/_authenticated/dashboard.tsx`
- `src/routes/_authenticated/bookings.tsx`
- `src/routes/_authenticated/favorites.tsx` (already partly covered by Task 12 — this task finishes any remaining `salon_id`/`salonId` in the file)
- `src/routes/_authenticated/admin/index.tsx`
- `src/routes/_authenticated/admin/marketplace.tsx`
- `src/routes/_authenticated/admin/availability.tsx`
- `src/routes/_authenticated/admin/appointments.tsx`
- `src/routes/_authenticated/admin/calendar.tsx`
- `src/routes/_authenticated/admin/customers.tsx`
- `src/routes/_authenticated/admin/payments.tsx`
- `src/routes/_authenticated/admin/reports.tsx`
- `src/routes/_authenticated/admin/reschedule.$bookingId.tsx`
- `src/routes/_authenticated/admin/reviews.tsx`
- `src/routes/_authenticated/admin/services.tsx`
- `src/routes/_authenticated/admin/staff.tsx`
- `src/routes/_authenticated/admin/platform/businesses.tsx`
- `src/routes/_authenticated/admin/platform/marketplace.tsx`
- `src/routes/staff/signup.tsx`

**Interfaces:**
- Consumes: `businesses`/`business_gallery`/`business_hours` tables, every renamed RPC (Tasks 1–5); `assertCanManageBusiness` (Task 13); `Business`/`LiveBusiness` types (Task 10).

This task is the long tail: every remaining file where the only change is a mechanical identifier substitution (no structural rewrite, unlike Tasks 9/13). The substitution rule is the same everywhere and was confirmed unambiguous by the pre-plan grep (no file in this list has an unrelated identifier that collides with `salon`/`salon_id`/`salonId`):

1. `.from("salons")` → `.from("businesses")`; `.from("salon_gallery")` → `.from("business_gallery")`; `.from("salon_hours")` → `.from("business_hours")`
2. Every raw column reference `salon_id` (in `.eq(...)`, `.select(...)`, `.insert(...)`, `.update(...)`, `.upsert(..., { onConflict: "salon_id,..." })`, destructured row fields, `.or(\`salon_id.in.(...)\`)` template strings) → `business_id`
3. Every local variable/prop/parameter named `salonId` → `businessId` (including in exported function signatures — `assertManagesSalon(supabase, userId, salonId)` in `staff-access.server.ts` → `assertManagesSalon(supabase, userId, businessId)`, keeping the function's own name — it isn't part of this rename's file list for renaming — but its parameter is)
4. Every `<Link to="/salon/$salonId" params={{ salonId: ... }}>` (and the equivalent `navigate({ to: "/salon/$salonId", params: { salonId: ... } })`) → `<Link to="/business/$businessId" params={{ businessId: ... }}>` — the route-path **string literal** changes here too, not just the `salonId` param key covered by rule 3. Confirmed exact locations from the pre-plan grep: `src/routes/_authenticated/bookings.tsx:277-278,371-372,521-522` and `src/routes/_authenticated/favorites.tsx:126-127,160-161,183-184,215-216` (3 and 4 occurrences respectively — each is a `to`/`params` pair on one `<Link>`, so treat each line-pair as one edit).
5. Every `.rpc("owns_salon", { _user_id, _salon_id })` → `.rpc("owns_business", { _user_id, _business_id })`; `.rpc("is_salon_staff", {...})` → `.rpc("is_business_staff", {...})`; `.rpc("get_salon_availability_summary", {...})` → `.rpc("get_business_availability_summary", {...})`; `.rpc("get_salon_public_staff", {...})` → `.rpc("get_business_public_staff", {...})`; `.rpc("submit_salon_for_review", {...})` → `.rpc("submit_business_for_review", {...})`; `.rpc("check_promo_code", { _salon_id, ... })` → `.rpc("check_promo_code", { _business_id, ... })`; `.rpc("get_marketplace_readiness", { _salon_id })` → `.rpc("get_marketplace_readiness", { _business_id })`; `.rpc("get_available_slots", {...})` is unaffected (no salon-named args)

Confirmed exact call sites needing the RPC-param edit (rule 5): `src/lib/salon-crm.server.ts`/`src/lib/staff-access.server.ts` (`owns_salon`, handled inside Task 13's rewrite for the former — `staff-access.server.ts` needs it here), `src/routes/_authenticated/admin/marketplace.tsx:98,114` (`get_marketplace_readiness`, `submit_salon_for_review`), `src/routes/business.$businessId.tsx` (already done in Task 9), `src/lib/marketplace.functions.ts:56` (`get_marketplace_readiness`), `src/lib/account.functions.ts:466` (`check_promo_code`).

- [ ] **Step 1: `business.functions.ts`**

Rewrite the handler body (lines 20-130 read in full during planning) so every `.from("salons")` → `.from("businesses")`, `.from("salon_gallery")` → `.from("business_gallery")`, `salon_id: salon.id` (services insert, line 102) → `business_id: business.id`, `salon_id: salon.id` (gallery insert, line 114) → `business_id: business.id`, and the local variable `salon` (from `.select("id").single()`, line 54) → `business`. The gallery insert's `category: "salon"` (line 116) is a **gallery-category tag, not a favorite-kind** (see Task 12 Step 3) — change it to `category: "interior"` (the column's own DB default, confirmed in Task 1) rather than leaving a now-meaningless `"salon"` string. The call to `notifyBusinessStatus({..., salonId: salon.id})` (line 128) → `{..., businessId: business.id}` once `business-status-email.server.ts` (Step 11 below) renames that parameter. Also update the doc comment on line 6-9 ("Finishes a business registration: attaches the pending salon record...") to say "business record" and the error text on line 24 ("Platform admin accounts manage salons") to "Platform admin accounts manage businesses".

- [ ] **Step 2: `marketplace.functions.ts`**

Rename every `.from("salons")` call and every `salonId`/`salon_id` reference (including the line-56 `owns_salon`/`get_marketplace_readiness`-adjacent RPC call) per the rule above.

- [ ] **Step 3: `admin.ts`**

Rename the two `.from("salons")` calls (lines 74, 80), the `.from("staff").select("salon_id")` fallback (line 89) → `select("business_id")`, and every `salonId`/`salon_id` reference in between, including the already-covered `hasRole` calls from Task 11 (do not re-edit those, just confirm they're already done).

- [ ] **Step 4: `platform.functions.ts`**

Rename the `.from("salons")` calls (lines 115, 147, 214) and the parallel `.from("services")`/`.from("staff")`/`.from("bookings")` `salon_id` column selections in the `Promise.all` around line 218-222, plus every `salonId` reference.

- [ ] **Step 5: `platform-directory.server.ts`**

Rename its one `.from("salons")` call (line 47) and the one `salon_id` reference.

- [ ] **Step 6: `staff-access.functions.ts`**

Rename the three `.select("name").eq("id", member.salon_id)` / `.eq("id", request.salon_id)` patterns (lines 83, 137, 175) → `.eq("id", member.business_id)` / `.eq("id", request.business_id)`, and the `assertManagesSalon` call sites (function itself lives in `staff-access.server.ts`, Step 7).

- [ ] **Step 7: `staff-access.server.ts`**

Rename `assertManagesSalon`'s `salonId` parameter (line 67) → `businessId`, and its body's `.rpc("owns_salon", { _user_id: userId, _salon_id: salonId })` (line 69) → `.rpc("owns_business", { _user_id: userId, _business_id: businessId })`. Function *name* `assertManagesSalon` is not in this plan's file-rename list — leave the function name as-is (only its parameter and body change); flag this as a minor residual "Salon" in an otherwise-fully-renamed codebase if a stricter full rename is wanted later, but it's out of this plan's explicit file-rename scope (only the 6 files in Task 13 were designated for renaming).

- [ ] **Step 8: `staff-desk.functions.ts` and `staff-desk.server.ts`**

Rename every `salon_id`/`salonId` reference in both files per the rule above (no `.from("salons")` calls in either, per the pre-plan audit).

- [ ] **Step 9: `account.functions.ts`**

Rename the `check_promo_code` RPC call (line 466) — `.rpc("check_promo_code", { _salon_id: ..., ... })` → `.rpc("check_promo_code", { _business_id: ..., ... })` — and every other `salon_id`/`salonId` reference in the file.

- [ ] **Step 10: `pending-booking.ts`**

Rename `salonId` → `businessId` throughout: the `PendingBooking` type field, `readPendingBooking(salonId)`/`takePendingBooking(salonId)` parameters, and the internal `parsed.salonId !== salonId` comparison. Because this is a `localStorage`-persisted JSON shape (key `dallty:pending-booking`), any in-flight pending-booking JSON written under the old `salonId` field before this deploy will simply fail the equality check post-deploy and be treated as "no pending booking" — the existing `MAX_AGE_MS` (1 hour) already expires stale entries this fast in normal operation, and the code already handles storage-unavailable by having the user re-pick a slot, so this is a self-healing, pre-launch-acceptable gap, not something requiring a migration shim.

- [ ] **Step 11: `business-status-email.server.ts`**

Rename `notifyBusinessStatus`'s `salonId` parameter → `businessId`, and its one internal use (the `idempotencyKey` template string) accordingly.

- [ ] **Step 12: `admin-shell.tsx`**

Rename the two `.select("id, name, salon_id")` column lists (lines 237-238) → `salon_id` → `business_id`; the `.from("salons")` call (line 336) → `.from("businesses")`. UI copy ("Salon settings" label, "Your salon is..." banner text) is handled separately in Task 16 — do not touch those strings in this task, only the `salon_id`/`.from("salons")` references.

- [ ] **Step 13: `specialist-wizard.tsx`**

Rename the exported `SpecialistDraft` type's `salonId` field and `emptyDraft(salonId: string)` parameter → `businessId`; the two `uploadAndSign("salon-media", ...)` calls are already covered by Task 8 — confirm, don't redo.

- [ ] **Step 14: `booking-details-dialog.tsx`**

Rename its 3 `salon_id` references per the rule above.

- [ ] **Step 15–33: The remaining route files**

For each of `dashboard.tsx`, `bookings.tsx`, `favorites.tsx`, `admin/index.tsx`, `admin/marketplace.tsx`, `admin/availability.tsx`, `admin/appointments.tsx`, `admin/calendar.tsx`, `admin/customers.tsx`, `admin/payments.tsx`, `admin/reports.tsx`, `admin/reschedule.$bookingId.tsx`, `admin/reviews.tsx`, `admin/services.tsx`, `admin/staff.tsx`, `admin/platform/businesses.tsx`, `admin/platform/marketplace.tsx`, `staff/signup.tsx`: apply the same four-part substitution rule (`.from("salons"/...)`  → `.from("businesses"/...)`, `salon_id` → `business_id`, `salonId` → `businessId`, RPC param renames where applicable — `admin/marketplace.tsx` is the one with the two RPC calls). `dashboard.tsx`'s `.from("salons")` call (line 86) also feeds a `salonIds` array used in four later `.in("salon_id", salonIds)` calls (lines 103, 118, 131, 145) — rename the array variable to `businessIds` and every one of those four call sites together, not just the initial fetch. `availability.tsx`'s `.or(\`salon_id.in.(...)\`)` template string (line 115) needs its embedded column name changed too, not just the `salonIds` variable feeding it. `admin/reschedule.$bookingId.tsx`'s `get_available_slots` RPC call (confirmed unaffected by rule 4, since that RPC has no salon-named args) still needs any `salon_id`/`salonId` in its surrounding code updated.

- [ ] **Step 34: Typecheck**

Run: `npx tsc --noEmit`
Expected: **zero errors**. If any remain, they point at a file this task (or Tasks 9–13) missed — find it and fix it before moving on; do not proceed to Task 15/16 with outstanding type errors.

- [ ] **Step 35: Confirm no `salon` text remains outside the intentionally-untouched files**

Run (PowerShell): `Select-String -Path src\**\*.ts,src\**\*.tsx -Pattern "salon" -Recurse -CaseSensitive:$false | Where-Object { $_.Path -notmatch 'routeTree\.gen\.ts' }`
Expected: matches only in `src/routes/salon.$salonId.tsx` (the intentional redirect shim's filename/route path from Task 9) and the aggregate-copy strings explicitly kept per spec decision #4 (Task 16 catalogs and confirms every remaining one — cross-check the output here against that task's list rather than editing anything yet).

- [ ] **Step 36: Commit**

```bash
git add src/lib/business.functions.ts src/lib/marketplace.functions.ts src/lib/admin.ts src/lib/platform.functions.ts src/lib/platform-directory.server.ts src/lib/staff-access.functions.ts src/lib/staff-access.server.ts src/lib/staff-desk.functions.ts src/lib/staff-desk.server.ts src/lib/account.functions.ts src/lib/business-status-email.server.ts src/lib/pending-booking.ts src/components/admin/admin-shell.tsx src/components/admin/specialist-wizard.tsx src/components/admin/booking-details-dialog.tsx src/routes/_authenticated/dashboard.tsx src/routes/_authenticated/bookings.tsx src/routes/_authenticated/favorites.tsx src/routes/_authenticated/admin/index.tsx src/routes/_authenticated/admin/marketplace.tsx src/routes/_authenticated/admin/availability.tsx src/routes/_authenticated/admin/appointments.tsx src/routes/_authenticated/admin/calendar.tsx src/routes/_authenticated/admin/customers.tsx src/routes/_authenticated/admin/payments.tsx src/routes/_authenticated/admin/reports.tsx "src/routes/_authenticated/admin/reschedule.\$bookingId.tsx" src/routes/_authenticated/admin/reviews.tsx src/routes/_authenticated/admin/services.tsx src/routes/_authenticated/admin/staff.tsx src/routes/_authenticated/admin/platform/businesses.tsx src/routes/_authenticated/admin/platform/marketplace.tsx src/routes/staff/signup.tsx
git commit -m "feat: finish salon_id/salonId identifier rename across remaining consumers"
```

---

### Task 15: `businessCategoryLabel()` helper — category-driven per-business copy

**Files:**
- Create: `src/lib/business-category-label.ts`
- Modify: `src/components/dallty/business-overview.tsx` (the `business_type` badge from Task 13 Step 4)
- Modify: `src/routes/business.$businessId.tsx` (page `<title>`/meta, if it renders a "salon"-flavored noun for the specific business being viewed)

**Interfaces:**
- Consumes: `useCategories()` from `src/lib/reference-data.tsx` (returns `Category[]` with `id`, `default_name`, `translations`), `translate(row, lang)` helper from the same file, `businesses.categories: text[]` column.
- Produces: `businessCategoryLabel(categories: Category[], businessCategories: string[] | null, lang: string): string`.

**Data-quality note found while researching this plan:** `businesses.categories` is a free-text `text[]` (e.g. `["Hair Salon", "Barbershop"]`), populated independently from the seeded `categories` table (whose `default_name`s are `"Barbershop"`, `"Beauty Salon"`, `"Nail Salon"`, `"Spa"`, etc.) — they don't always match exactly (confirmed live: one seed business's `categories` array contains `"Hair Salon"`, which has no exact match in the `categories` table's `default_name` column). The helper below is written to degrade gracefully rather than assume a clean join.

- [ ] **Step 1: Write the helper**

```ts
// src/lib/business-category-label.ts
//
// A business's own descriptive noun, per spec decision #4: aggregate copy
// ("Nearby salons") stays beauty-flavored, but wherever a *specific*
// business's kind is named (a badge, a page title), it comes from that
// business's own category instead of a hardcoded "salon". businesses.categories
// is free text and isn't guaranteed to match categories.default_name
// exactly (confirmed against live data before writing this) — this falls
// back to the raw stored string, then to a generic label, rather than
// silently rendering nothing.

import type { Category } from "@/lib/reference-data";
import { translate } from "@/lib/reference-data";

export function businessCategoryLabel(
  categories: Category[],
  businessCategories: string[] | null | undefined,
  lang: string,
): string {
  const first = businessCategories?.[0]?.trim();
  if (!first) return lang === "ar" ? "نشاط تجاري" : "Business";

  const match = categories.find(
    (c) => c.default_name.toLowerCase() === first.toLowerCase(),
  );
  if (match) return translate(match, lang);

  // No exact match in the seeded categories table — the stored free-text
  // value is still meaningful to a human reader, so show it as-is rather
  // than falling back to a generic label.
  return first;
}
```

- [ ] **Step 2: Wire it into `business-overview.tsx`'s badge**

Replace the raw `{business.business_type}` badge (from Task 13 Step 4, originally lines 87-91) with a call to the helper. This requires passing `categories: Category[]` and `lang: string` into `BusinessOverview`'s props (both already available at its call site in `business.$businessId.tsx` — `useCategories()` is already mounted app-wide via `ReferenceDataProvider`, confirmed in the Reference Data Foundation sub-project earlier this session):

```tsx
{businessCategoryLabel(categories, business.categories, lang) ? (
  <span className="rounded-full glass-soft px-3 py-1 text-xs font-bold text-background">
    {businessCategoryLabel(categories, business.categories, lang)}
  </span>
) : null}
```
(add `categories: Category[]; lang: string;` to `BusinessOverview`'s prop type, and `import { businessCategoryLabel } from "@/lib/business-category-label"` at the top of the file; note this changes `business.business_type` — the free-text business-type column — to `business.categories` — the categories array — as the badge's data source, which is the correct field per the helper's contract).

- [ ] **Step 3: Wire it into the detail page title/meta, if applicable**

In `business.$businessId.tsx`, check the route's `head`/meta configuration (TanStack Start's `meta`/`head` export) for any literal "Salon" text in the page `<title>` or `og:title` for this specific business (as opposed to the aggregate `dashboard.tsx`/`settings.tsx`/`calendar.tsx` titles, which are Task 16's scope, not this one). If the title is already just the business's own `name` with no "Salon" suffix, no change is needed here — confirm by reading the route's meta block before assuming a change is required.

- [ ] **Step 4: Typecheck + browser spot-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

Using the browser preview tools: navigate to `/business/<a-real-business-id>` for the one seed business with real `categories` data (`thorbarber`, categories `["Hair Salon", "Barbershop"]`) and confirm the overview badge shows a real label (either the matched/translated category name or the raw `"Hair Salon"` fallback) rather than blank or `"undefined"`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/business-category-label.ts src/components/dallty/business-overview.tsx src/routes/business.\$businessId.tsx
git commit -m "feat: add category-driven businessCategoryLabel helper, wire into business overview badge"
```

---

### Task 16: Admin nav / UI copy updates

**Files:**
- Modify: `src/components/admin/admin-shell.tsx:107,330-336,431-433,457,607-614`
- Modify: `src/lib/marketplace.functions.ts:18`
- Modify: `src/routes/business/signup.tsx:174,281,681`
- Modify: `src/routes/auth.tsx:99,501`
- Modify: `src/routes/_authenticated/dashboard.tsx:35,41,271`
- Modify: `src/routes/_authenticated/bookings.tsx:225`
- Modify: `src/routes/_authenticated/admin/calendar.tsx:33,39`
- Modify: `src/routes/_authenticated/admin/marketplace.tsx:61-64`
- Modify: `src/routes/_authenticated/admin/settings.tsx:70,76,379,426,434,1078`
- Modify: `src/routes/business.$businessId.tsx` (the `aria-label="Salon sections"` from the audit, inside the file already renamed in Task 9 — confirm it, don't re-open the whole file)

**Interfaces:**
- None — pure copy edits, no type/interface changes.

Per spec decision #4, **aggregate** copy (the ones marked "stays" below) is explicitly out of scope; only **per-business-owner-facing chrome** ("your dashboard", "your settings", nav labels) that isn't naming a specific business's category gets genericized to "Business".

- [ ] **Step 1: `admin-shell.tsx`**

- Line 107: `label: "Salon settings",` → `label: "Business settings",` (and its Arabic sibling on line 108, `labelAr: "إعدادات الصالون"` → `labelAr: "إعدادات النشاط التجاري"`).
- Line 62 comment: `/** Owner / manager back-office, grouped by the way a salon actually runs. */` → `/** Owner / manager back-office, grouped by the way a business actually runs. */`
- Lines 330-336: the `ownedSalon` query variable and its comment (`// Owners see a review banner until the platform team approves their salon.`) → `ownedBusiness`, comment says "business"; `.from("salons")` already handled in Task 14 Step 12 — confirm, don't redo.
- Lines 431-433: comment `// Platform admins own no salon: they get the platform console first, then the salon modules scoped to whichever business they pick.` → "own no business... the business modules..."; `salonSections` variable → `businessSections`.
- Line 457: `sectionHeading(locale === "ar" ? "إدارة أي صالون" : "Manage any salon")` → `"إدارة أي نشاط تجاري" : "Manage any business"`.
- Lines 607-614: `"Your salon is under marketplace review"` / `"Your salon was not approved for the marketplace"` / `"Your salon is hidden from the marketplace"` / `"Your salon is not listed yet"` → `"Your business is under marketplace review"` / `"Your business was not approved for the marketplace"` / `"Your business is hidden from the marketplace"` / `"Your business is not listed yet"`.

- [ ] **Step 2: `marketplace.functions.ts`**

Line 18: `{ key: "profile_complete", label: "Salon profile completed", labelAr: "اكتمال ملف الصالون" }` → `{ key: "profile_complete", label: "Business profile completed", labelAr: "اكتمال ملف النشاط التجاري" }`.

- [ ] **Step 3: `business/signup.tsx`**

Line 174: `{ title: "Salon details", icon: Store }` → `{ title: "Business details", icon: Store }`. Line 281: `"Salon name is required"` → `"Business name is required"`. Line 681: `<Field label="Salon name" error={errors.name}>` → `<Field label="Business name" error={errors.name}>`.

- [ ] **Step 4: `auth.tsx`**

Line 99: `business: "Salon owner? Register your business",` → `business: "Business owner? Register your business",`. Line 501: `<span>Salon owner</span>` → `<span>Business owner</span>`.

- [ ] **Step 5: `dashboard.tsx`**

Line 35: `{ title: "Salon dashboard — Dallty" }` → `{ title: "Business dashboard — Dallty" }`. Line 41: `{ property: "og:title", content: "Salon dashboard — Dallty" }` → `content: "Business dashboard — Dallty"`. Line 271: `<h1 ...>Salon dashboard</h1>` → `<h1 ...>Business dashboard</h1>`.

- [ ] **Step 6: `bookings.tsx`**

Line 225: `title={isManager ? "Salon calendar" : "Your bookings"}` → `title={isManager ? "Business calendar" : "Your bookings"}`.

- [ ] **Step 7: `admin/calendar.tsx`**

Line 33: `{ title: "Salon calendar — Dallty Business" }` → `{ title: "Business calendar — Dallty Business" }`. Line 39: `{ property: "og:title", content: "Salon calendar — Dallty Business" }` → `content: "Business calendar — Dallty Business"`.

- [ ] **Step 8: `admin/marketplace.tsx`**

Lines 61-64: four `label: "Salon settings"` readiness-checklist entries → `label: "Business settings"`.

- [ ] **Step 9: `admin/settings.tsx`**

Line 70: `{ title: "Salon settings — Dallty Business" }` → `{ title: "Business settings — Dallty Business" }`. Line 76: `content: "Salon settings — Dallty Business"` → `content: "Business settings — Dallty Business"`. Line 379: `<h1 ...>Salon settings</h1>` → `<h1 ...>Business settings</h1>`. Line 426: `<Field label="Salon name">` → `<Field label="Business name">`. Line 434: `<Field label="Salon name (Arabic)">` → `<Field label="Business name (Arabic)">`. Line 1078: `label="Salon is open for business"` → `label="Business is open"`.

- [ ] **Step 10: `business.$businessId.tsx`**

Confirm the `aria-label="Salon sections"` found during the pre-plan audit was already changed in Task 9 (it should have been swept up by that task's general "every occurrence of case-sensitive salon substrings" instruction only if it was explicitly listed there — it wasn't, so treat it as a residual here): `aria-label="Salon sections"` → `aria-label="Business sections"`.

- [ ] **Step 11: Confirm which "salon" strings intentionally remain (aggregate copy, spec decision #4 — do NOT change these)**

`dallty-content.ts` line 95 (`["10,000+", "Salons"]` stat), line 100 (`nearbyTitle: "Nearby salons"`), `search.tsx` line 483 (`"Nearby salons"`). These are the only three that should survive the Step 35 grep from Task 14.

- [ ] **Step 12: Re-run the full-repo grep to confirm the final state**

Run (PowerShell): `Select-String -Path src\**\*.ts,src\**\*.tsx -Pattern "salon" -Recurse -CaseSensitive:$false | Where-Object { $_.Path -notmatch 'routeTree\.gen\.ts' }`
Expected: matches only in `src/routes/salon.$salonId.tsx` (the redirect shim) and the exact three aggregate-copy lines from Step 11.

- [ ] **Step 13: Typecheck + lint**

Run: `npx tsc --noEmit` — expected zero errors.
Run: `npx eslint .` — expected zero errors (warnings acceptable only if they pre-date this change; if unsure, run `git stash` and re-run eslint on the pre-change tree to compare counts, then `git stash pop`).

- [ ] **Step 14: Commit**

```bash
git add src/components/admin/admin-shell.tsx src/lib/marketplace.functions.ts src/routes/business/signup.tsx src/routes/auth.tsx src/routes/_authenticated/dashboard.tsx src/routes/_authenticated/bookings.tsx src/routes/_authenticated/admin/calendar.tsx src/routes/_authenticated/admin/marketplace.tsx src/routes/_authenticated/admin/settings.tsx src/routes/business.\$businessId.tsx
git commit -m "chore: rename remaining Salon UI copy to Business"
```

---

### Task 17: Final verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck and lint**

Run: `npx tsc --noEmit` — expected zero errors.
Run: `npx eslint .` — expected zero new errors.

- [ ] **Step 2: DB-side final confirmation**

Run:
```
npx supabase db query "select 'table' as kind, table_name as name from information_schema.tables where table_schema='public' and table_name ilike '%salon%' union all select 'column', table_name||'.'||column_name from information_schema.columns where table_schema='public' and column_name ilike '%salon%' union all select 'function', proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname ilike '%salon%' union all select 'policy', tablename||'.'||policyname from pg_policies where schemaname='public' and (policyname ilike '%salon%' or qual ilike '%salon%' or with_check ilike '%salon%') union all select 'bucket', id from storage.buckets where id ilike '%salon%' union all select 'enum', enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname in ('app_role','favorite_kind') and enumlabel ilike '%salon%';" --db-url "$DB_URL"
```
Expected: **zero rows**.

- [ ] **Step 3: Browser walkthrough — public search/detail/booking flow**

Using the preview tools against `dallty-dev` (port 8080):
1. Navigate to `/` — confirm the homepage loads, shows business cards, "Nearby salons" heading still reads correctly (intentional aggregate copy).
2. Click a business card → lands on `/business/<id>` (not `/salon/<id>`); confirm the URL bar shows `/business/...`.
3. Navigate directly to the old-style URL `/salon/<same-id>` → confirm it redirects to `/business/<same-id>` with no visible flash of a 404.
4. On the business detail page: confirm services, staff/specialists, hours, gallery/about tab, and reviews all render without console errors (`read_console_messages`, `onlyErrors: true`).
5. Add the business to favorites (if signed in as a test client) → confirm the favorite persists (`favorites` table row has `kind = 'business'`).
6. Start a booking, pick a service/slot, and reach the confirm step (no need to complete payment) → confirm no network errors (`read_network_requests`) hitting old `salon`-named endpoints/RPCs.

- [ ] **Step 4: Browser walkthrough — business-owner signup + admin dashboard**

Sign in as a test `business_owner` account (Admin API `generate_link` → extract `email_otp` → verify → write session into `localStorage`, the established technique from every prior sub-project this session):
1. If the account has no business yet: confirm `/business/signup` still resumes/works, and completing it lands on `/admin`.
2. On `/admin`: confirm the nav shows "Business settings" (not "Salon settings"), the dashboard header reads "Business dashboard", and the marketplace-status banner (if the seed account is not yet approved) reads "Your business is..." (not "Your salon is...").
3. Open `/admin/settings` → confirm the "Business name" field renders and saves correctly (round-trip a small edit).
4. Open `/admin/marketplace` → confirm the readiness checklist shows "Business profile completed" / "Business settings" entries.

- [ ] **Step 5: Browser walkthrough — platform-admin cross-business views**

Sign in as a test `super_admin` account (same technique):
1. Open `/admin/platform/businesses` (renamed route confirmed already generic — verify it still lists every business correctly post-rename).
2. Open `/admin/platform/marketplace` → confirm the review queue renders and a submit/approve action still works end-to-end (exercises `submit_business_for_review`/the marketplace RPCs from Task 3).

- [ ] **Step 6: Final commit (only if any fixes were needed during this sweep)**

If Steps 1-5 surfaced anything to fix, fix it, then:
```bash
git add -A
git commit -m "fix: address issues found during business-rename final verification sweep"
```
If nothing needed fixing, there is nothing to commit here — the plan is done as of Task 16's commit.
