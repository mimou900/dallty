REVOKE SELECT ON public.staff FROM anon, authenticated;

GRANT SELECT (id, salon_id, user_id, full_name, full_name_ar, title, title_ar, avatar_url, is_active, created_at)
  ON public.staff TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;