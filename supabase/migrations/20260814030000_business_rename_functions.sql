-- Business/Salon Terminology Rename, migration 3 of 4: function renames and
-- body rewrites.
--
-- ALTER FUNCTION RENAME preserves OID, so it carries grants and trigger
-- bindings automatically — no re-GRANT, no trigger recreation needed.
-- CREATE OR REPLACE FUNCTION on the (now new-named) function updates its
-- body text, which is NOT auto-rewritten by the table/column renames in
-- migration 1 (function bodies are stored as raw text, re-parsed per call —
-- unlike policies, which are stored as compiled expression trees).
--
-- DEVIATION FROM THE ORIGINAL PLAN, discovered at apply time: every
-- parameter below keeps its original name (_salon_id, _user_id, etc.)
-- instead of being renamed to _business_id/etc. Postgres's CREATE OR
-- REPLACE FUNCTION refuses to change a parameter's name ("cannot change
-- name of input parameter"), full stop — this applies even to a function
-- that was just renamed via ALTER FUNCTION RENAME (the rename changes the
-- function's name, not its parameters). The only way to actually rename a
-- parameter is DROP FUNCTION + CREATE FUNCTION, and DROP is unsafe here:
-- `owns_salon` alone has 41 RLS policies with a hard pg_depend dependency
-- on it (confirmed live before writing this), so a DROP would cascade into
-- dropping (or refuse to drop without cascading into dropping) 41
-- production policies. Function *names* still change everywhere below —
-- only their parameter identifiers stay put. RPC call sites in the
-- TypeScript layer therefore change their first argument (the function
-- name string) but keep the same parameter object keys.

-- owns_salon -> owns_business
ALTER FUNCTION public.owns_salon(uuid, uuid) RENAME TO owns_business;
CREATE OR REPLACE FUNCTION public.owns_business(_user_id uuid, _salon_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.businesses WHERE id = _salon_id AND owner_id = _user_id)
$function$;

-- is_salon_staff -> is_business_staff (body has no salon/salon_id references
-- to rewrite — it only queries public.staff by id/user_id).
ALTER FUNCTION public.is_salon_staff(uuid, uuid) RENAME TO is_business_staff;
CREATE OR REPLACE FUNCTION public.is_business_staff(_user_id uuid, _staff_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.staff WHERE id = _staff_id AND user_id = _user_id)
$function$;

-- get_salon_availability_summary -> get_business_availability_summary
ALTER FUNCTION public.get_salon_availability_summary(uuid, integer) RENAME TO get_business_availability_summary;
CREATE OR REPLACE FUNCTION public.get_business_availability_summary(_salon_id uuid, _days integer DEFAULT 14)
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
  SELECT COALESCE(b.timezone, 'UTC') INTO tz FROM public.businesses b WHERE b.id = _salon_id;
  tz := COALESCE(tz, 'UTC');
  today := (now() AT TIME ZONE tz)::date;

  FOR r IN
    SELECT st.id AS sid, sv.id AS svid
    FROM public.staff st
    JOIN public.staff_services ss ON ss.staff_id = st.id
    JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active AND sv.business_id = _salon_id
    WHERE st.business_id = _salon_id AND st.is_active
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

-- get_salon_public_staff -> get_business_public_staff. Note: the
-- RETURNS TABLE column list also can't rename salon_id -> business_id via
-- CREATE OR REPLACE (same "cannot change ... of existing function"
-- constraint as parameters, confirmed at apply time) — that output column
-- stays named salon_id even though the underlying query now reads
-- st.business_id into it.
ALTER FUNCTION public.get_salon_public_staff(uuid) RENAME TO get_business_public_staff;
CREATE OR REPLACE FUNCTION public.get_business_public_staff(_salon_id uuid)
 RETURNS TABLE(id uuid, salon_id uuid, user_id uuid, full_name text, full_name_ar text, title text, title_ar text, avatar_url text, is_active boolean, created_at timestamp with time zone, service_ids uuid[])
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
  WHERE st.business_id = _salon_id AND st.is_active
  ORDER BY st.created_at;
$function$;

-- submit_salon_for_review -> submit_business_for_review
ALTER FUNCTION public.submit_salon_for_review(uuid) RENAME TO submit_business_for_review;
CREATE OR REPLACE FUNCTION public.submit_business_for_review(_salon_id uuid)
 RETURNS TABLE(ok boolean, reason text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  cur public.marketplace_status;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = _salon_id
      AND (b.owner_id = auth.uid() OR public.is_platform_admin(auth.uid()))
  ) THEN
    RETURN QUERY SELECT false, 'forbidden'; RETURN;
  END IF;

  SELECT marketplace_status INTO cur FROM public.businesses WHERE id = _salon_id;
  IF cur IN ('pending_review', 'approved') THEN
    RETURN QUERY SELECT false, 'already_submitted'; RETURN;
  END IF;

  SELECT * INTO r FROM public.get_marketplace_readiness(_salon_id);
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
  WHERE id = _salon_id;

  RETURN QUERY SELECT true, 'ok';
END; $function$;

-- recompute_salon_listing -> recompute_business_listing
ALTER FUNCTION public.recompute_salon_listing(uuid) RENAME TO recompute_business_listing;
CREATE OR REPLACE FUNCTION public.recompute_business_listing(_salon_id uuid)
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
  WHERE b.id = _salon_id;
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

-- check_promo_code: same name, body rewritten. Postgres refuses to rename a
-- parameter via CREATE OR REPLACE FUNCTION when the function name itself is
-- unchanged ("cannot change name of input parameter") — confirmed by
-- Postgres rejecting the originally-planned _salon_id -> _business_id
-- rename here at apply time. Parameter stays _salon_id; only the body
-- (table/column references) is rewritten.
CREATE OR REPLACE FUNCTION public.check_promo_code(_salon_id uuid, _code text, _amount numeric)
 RETURNS TABLE(promotion_id uuid, valid boolean, reason text, discount numeric, final_price numeric)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE p record; d numeric := 0;
BEGIN
  SELECT * INTO p FROM public.promotions
  WHERE business_id = _salon_id AND upper(code) = upper(trim(_code));

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

-- get_marketplace_readiness: same name, body rewritten. Same parameter-name
-- constraint as check_promo_code above — _salon_id stays.
CREATE OR REPLACE FUNCTION public.get_marketplace_readiness(_salon_id uuid)
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
  WHERE b.id = _salon_id
    AND (b.owner_id = auth.uid() OR is_platform_admin(auth.uid()));
$function$;

-- get_available_slots: same name, body rewritten (joins staff -> businesses
-- for timezone). Parameters were never salon-named, unaffected.
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
