-- The 20260814070000_business_slugs.sql migration added businesses.slug and
-- businesses.slug_source via ALTER TABLE, but new columns are never covered
-- by a table-level GRANT issued before they existed. Public business-detail
-- routing reads businesses.slug through the anon client, so it needs an
-- explicit column grant.
GRANT SELECT (slug) ON public.businesses TO anon, authenticated;
