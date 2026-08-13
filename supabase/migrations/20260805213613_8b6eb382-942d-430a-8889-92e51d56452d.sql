REVOKE SELECT ON public.staff FROM anon, authenticated;

GRANT SELECT (
  id, salon_id, user_id, full_name, full_name_ar, title, title_ar, avatar_url,
  is_active, created_at, bio, experience_years, languages, certificates,
  portfolio, social_links, invited_at, invite_accepted_at
) ON public.staff TO anon, authenticated;

GRANT ALL ON public.staff TO service_role;