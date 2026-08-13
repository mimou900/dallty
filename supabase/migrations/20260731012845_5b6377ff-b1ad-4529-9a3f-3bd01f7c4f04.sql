REVOKE EXECUTE ON FUNCTION public.recompute_salon_listing(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_listing_from_salon_row() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_listing_from_link() FROM anon, authenticated, public;