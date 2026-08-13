-- These helpers are referenced directly inside RLS policies, which are evaluated
-- with the caller's privileges. Without EXECUTE, every read of salons/services/
-- staff fails with "permission denied for function has_role" for anon users.
-- They are security definer and only return a boolean about the arguments passed,
-- so they leak nothing beyond what the policies already decide.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_salon(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_salon_staff(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, date) TO anon, authenticated;