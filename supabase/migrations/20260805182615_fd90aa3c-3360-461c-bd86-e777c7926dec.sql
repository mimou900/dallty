DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'salons'
    AND column_name NOT IN (
      'business_email','business_phone','latitude','longitude',
      'terms_accepted_at','rejection_reason','reviewed_by','reviewed_at'
    );

  EXECUTE 'REVOKE SELECT ON public.salons FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.salons TO anon, authenticated', cols);
END $$;

GRANT ALL ON public.salons TO service_role;