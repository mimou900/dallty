CREATE OR REPLACE FUNCTION public.get_salon_public_staff(_salon_id uuid)
RETURNS TABLE(
  id uuid,
  salon_id uuid,
  user_id uuid,
  full_name text,
  full_name_ar text,
  title text,
  title_ar text,
  avatar_url text,
  is_active boolean,
  created_at timestamptz,
  service_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT st.id, st.salon_id, st.user_id, st.full_name, st.full_name_ar, st.title,
         st.title_ar, st.avatar_url, st.is_active, st.created_at,
         COALESCE(ARRAY(
           SELECT ss.service_id
           FROM public.staff_services ss
           JOIN public.services sv ON sv.id = ss.service_id AND sv.is_active
           WHERE ss.staff_id = st.id
         ), '{}'::uuid[])
  FROM public.staff st
  WHERE st.salon_id = _salon_id AND st.is_active
  ORDER BY st.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_salon_public_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_salon_public_staff(uuid) TO anon, authenticated, service_role;