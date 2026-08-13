-- ROLES ---------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('customer', 'salon_owner', 'staff', 'admin');
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  locale text NOT NULL DEFAULT 'en',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- SIGNUP TRIGGER ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer');
  assigned public.app_role;
BEGIN
  IF requested IN ('customer', 'salon_owner', 'staff') THEN
    assigned := requested::public.app_role;
  ELSE
    assigned := 'customer';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, locale)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    COALESCE(NEW.raw_user_meta_data ->> 'locale', 'en')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SALONS --------------------------------------------------------------
CREATE TABLE public.salons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  name_ar text,
  description text,
  description_ar text,
  area text NOT NULL DEFAULT '',
  area_ar text,
  city text NOT NULL DEFAULT '',
  image_url text,
  rating numeric(2,1) NOT NULL DEFAULT 5.0,
  review_count integer NOT NULL DEFAULT 0,
  price_range text NOT NULL DEFAULT '$$',
  distance_km numeric(4,1) NOT NULL DEFAULT 1.0,
  opens_at time NOT NULL DEFAULT '09:00',
  closes_at time NOT NULL DEFAULT '21:00',
  instant_booking boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.salons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salons TO authenticated;
GRANT ALL ON public.salons TO service_role;
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads active salons" ON public.salons FOR SELECT TO anon, authenticated
  USING (is_active OR owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners insert salons" ON public.salons FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(), 'salon_owner'));
CREATE POLICY "Owners update salons" ON public.salons FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners delete salons" ON public.salons FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.owns_salon(_user_id uuid, _salon_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.salons WHERE id = _salon_id AND owner_id = _user_id)
$$;

-- SERVICES ------------------------------------------------------------
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  description text,
  description_ar text,
  category text NOT NULL DEFAULT 'hair',
  duration_minutes integer NOT NULL DEFAULT 30,
  price numeric(10,2) NOT NULL DEFAULT 0,
  discount_price numeric(10,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.services TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads services" ON public.services FOR SELECT TO anon, authenticated
  USING (is_active OR public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners manage services" ON public.services FOR ALL TO authenticated
  USING (public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'));

-- STAFF ---------------------------------------------------------------
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  full_name_ar text,
  title text NOT NULL DEFAULT 'Stylist',
  title_ar text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads staff" ON public.staff FOR SELECT TO anon, authenticated
  USING (is_active OR user_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners manage staff" ON public.staff FOR ALL TO authenticated
  USING (public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.staff_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at time NOT NULL DEFAULT '10:00',
  ends_at time NOT NULL DEFAULT '20:00',
  UNIQUE (staff_id, weekday)
);
GRANT SELECT ON public.staff_schedules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_schedules TO authenticated;
GRANT ALL ON public.staff_schedules TO service_role;
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads schedules" ON public.staff_schedules FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY "Owners manage schedules" ON public.staff_schedules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (public.owns_salon(auth.uid(), s.salon_id) OR s.user_id = auth.uid())) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND (public.owns_salon(auth.uid(), s.salon_id) OR s.user_id = auth.uid())) OR public.has_role(auth.uid(), 'admin'));

-- BOOKINGS ------------------------------------------------------------
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  total_price numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_staff_time_idx ON public.bookings (staff_id, starts_at);
CREATE UNIQUE INDEX bookings_no_double_booking ON public.bookings (staff_id, starts_at)
  WHERE status IN ('pending', 'confirmed');

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_salon_staff(_user_id uuid, _staff_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff WHERE id = _staff_id AND user_id = _user_id)
$$;

CREATE POLICY "Read own or managed bookings" ON public.bookings FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.owns_salon(auth.uid(), salon_id)
    OR public.is_salon_staff(auth.uid(), staff_id)
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Customers create own bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());
CREATE POLICY "Update own or managed bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.owns_salon(auth.uid(), salon_id)
    OR public.is_salon_staff(auth.uid(), staff_id)
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    customer_id = auth.uid()
    OR public.owns_salon(auth.uid(), salon_id)
    OR public.is_salon_staff(auth.uid(), staff_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER bookings_touch_updated_at BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;

-- AVAILABILITY --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_available_slots(_staff_id uuid, _service_id uuid, _day date)
RETURNS TABLE (slot timestamptz, available boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dur integer;
  win_start time;
  win_end time;
  cur timestamptz;
  win_end_ts timestamptz;
BEGIN
  SELECT duration_minutes INTO dur FROM public.services WHERE id = _service_id;
  IF dur IS NULL THEN RETURN; END IF;

  SELECT ss.starts_at, ss.ends_at INTO win_start, win_end
  FROM public.staff_schedules ss
  WHERE ss.staff_id = _staff_id AND ss.weekday = EXTRACT(dow FROM _day)::smallint;

  IF win_start IS NULL THEN RETURN; END IF;

  cur := (_day + win_start) AT TIME ZONE 'UTC';
  win_end_ts := (_day + win_end) AT TIME ZONE 'UTC';

  WHILE cur + make_interval(mins => dur) <= win_end_ts LOOP
    slot := cur;
    available := cur > now() AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.staff_id = _staff_id
        AND b.status IN ('pending', 'confirmed')
        AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(cur, cur + make_interval(mins => dur), '[)')
    );
    RETURN NEXT;
    cur := cur + interval '30 minutes';
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date) TO anon, authenticated;

-- DEMO DATA -----------------------------------------------------------
INSERT INTO public.salons (id, name, name_ar, area, area_ar, city, image_url, rating, review_count, price_range, distance_km, opens_at, closes_at, instant_booking)
VALUES
 ('11111111-1111-1111-1111-111111111111','Maison Vert','ميزون فير','Al Olaya','العليا','Riyadh','/salons/hair.jpg',4.9,812,'$$',1.2,'09:00','21:00',true),
 ('22222222-2222-2222-2222-222222222222','The Gentleman Room','غرفة الأناقة','Jumeirah','جميرا','Dubai','/salons/barber.jpg',4.8,1240,'$',2.4,'10:00','22:00',true),
 ('33333333-3333-3333-3333-333333333333','Rosé Nail Studio','استوديو روزيه','City Walk','سيتي ووك','Dubai','/salons/nails.jpg',4.7,430,'$$',3.1,'10:00','20:00',false),
 ('44444444-4444-4444-4444-444444444444','Amber Spa & Wellness','أمبر سبا','Corniche','الكورنيش','Abu Dhabi','/salons/spa.jpg',5.0,296,'$$$',4.6,'09:00','22:00',true);

INSERT INTO public.services (id, salon_id, name, name_ar, category, duration_minutes, price) VALUES
 ('a1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Haircut & Style','قص وتصفيف','hair',60,180),
 ('a1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Full Color','صبغة كاملة','hair',120,450),
 ('a1000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Keratin Treatment','كيراتين','hair',150,700),
 ('a2000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Classic Haircut','قصة كلاسيكية','barber',30,80),
 ('a2000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Skin Fade','تدرج','barber',45,110),
 ('a2000000-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','Beard Trim & Shave','لحية وحلاقة','barber',30,70),
 ('a3000000-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','Classic Manicure','مانيكير','nails',45,120),
 ('a3000000-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333','Gel Pedicure','بديكير جل','nails',60,180),
 ('a4000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','Relaxing Massage','مساج استرخاء','spa',60,320),
 ('a4000000-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','Signature Facial','عناية بالبشرة','spa',75,400);

INSERT INTO public.staff (id, salon_id, full_name, full_name_ar, title, title_ar) VALUES
 ('b1000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Lina Haddad','لينا حداد','Senior Stylist','مصففة أولى'),
 ('b1000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Nour Fares','نور فارس','Color Specialist','خبيرة صبغة'),
 ('b2000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Omar Khalil','عمر خليل','Master Barber','حلاق محترف'),
 ('b2000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Yousef Adel','يوسف عادل','Barber','حلاق'),
 ('b3000000-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','Maya Saleh','مايا صالح','Nail Artist','فنانة أظافر'),
 ('b4000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','Sara Mansour','سارة منصور','Spa Therapist','أخصائية سبا');

INSERT INTO public.staff_schedules (staff_id, weekday, starts_at, ends_at)
SELECT s.id, d.weekday, '10:00'::time, '20:00'::time
FROM public.staff s CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) AS d(weekday);