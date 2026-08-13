-- 1. Profile enrichment
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS skin_type text,
  ADD COLUMN IF NOT EXISTS hair_type text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS beauty_notes text,
  ADD COLUMN IF NOT EXISTS favorite_categories text[] NOT NULL DEFAULT '{}';

-- 2. Salon profile depth
ALTER TABLE public.salons
  ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS awards text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS certifications text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS brands text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cancellation_policy text,
  ADD COLUMN IF NOT EXISTS cancellation_policy_ar text,
  ADD COLUMN IF NOT EXISTS house_rules text,
  ADD COLUMN IF NOT EXISTS house_rules_ar text,
  ADD COLUMN IF NOT EXISTS owner_story text,
  ADD COLUMN IF NOT EXISTS owner_story_ar text,
  ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_tour_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS address text;

-- 3. Favorites
CREATE TYPE public.favorite_kind AS ENUM ('salon', 'staff', 'service');

CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind public.favorite_kind NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, target_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own favorites" ON public.favorites
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_favorites_user ON public.favorites (user_id, kind);

-- 4. Recently viewed salons
CREATE TABLE public.recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, salon_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recently_viewed TO authenticated;
GRANT ALL ON public.recently_viewed TO service_role;
ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own history" ON public.recently_viewed
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX idx_recently_viewed_user ON public.recently_viewed (user_id, viewed_at DESC);

-- 5. Reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id uuid NOT NULL,
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  rating smallint NOT NULL,
  body text NOT NULL DEFAULT '',
  photos text[] NOT NULL DEFAULT '{}',
  owner_reply text,
  owner_replied_at timestamptz,
  is_hidden boolean NOT NULL DEFAULT false,
  report_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_one_per_booking UNIQUE (booking_id, customer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads visible reviews" ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (NOT is_hidden OR customer_id = auth.uid() OR public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers write own reviews" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = reviews.booking_id
        AND b.customer_id = auth.uid()
        AND b.salon_id = reviews.salon_id
        AND b.status IN ('completed', 'confirmed')
    )
  );

CREATE POLICY "Customers edit own reviews" ON public.reviews
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid()) WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Owners moderate reviews" ON public.reviews
  FOR UPDATE TO authenticated
  USING (public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers delete own reviews" ON public.reviews
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_reviews_salon ON public.reviews (salon_id, created_at DESC);
CREATE INDEX idx_reviews_customer ON public.reviews (customer_id, created_at DESC);

CREATE TRIGGER reviews_touch BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Keep salon aggregate rating in sync
CREATE OR REPLACE FUNCTION public.refresh_salon_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid uuid := COALESCE(NEW.salon_id, OLD.salon_id);
BEGIN
  UPDATE public.salons s
  SET rating = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM public.reviews r WHERE r.salon_id = sid AND NOT r.is_hidden), 5.0),
      review_count = (SELECT COUNT(*) FROM public.reviews r WHERE r.salon_id = sid AND NOT r.is_hidden)
  WHERE s.id = sid;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_salon_rating() FROM anon, authenticated, public;

CREATE TRIGGER reviews_refresh_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_salon_rating();

-- 6. Review reports
CREATE TABLE public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_id)
);
GRANT SELECT, INSERT ON public.review_reports TO authenticated;
GRANT ALL ON public.review_reports TO service_role;
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users file own reports" ON public.review_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Reporters and moderators read reports" ON public.review_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
         OR EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND public.owns_salon(auth.uid(), r.salon_id)));

-- 7. Salon gallery
CREATE TABLE public.salon_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id uuid NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  url text NOT NULL,
  category text NOT NULL DEFAULT 'interior',
  caption text,
  caption_ar text,
  before_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.salon_gallery TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salon_gallery TO authenticated;
GRANT ALL ON public.salon_gallery TO service_role;
ALTER TABLE public.salon_gallery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads gallery of active salons" ON public.salon_gallery
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.salons s WHERE s.id = salon_id AND (s.is_active OR s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "Owners manage gallery" ON public.salon_gallery
  FOR ALL TO authenticated
  USING (public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.owns_salon(auth.uid(), salon_id) OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_salon_gallery_salon ON public.salon_gallery (salon_id, sort_order);