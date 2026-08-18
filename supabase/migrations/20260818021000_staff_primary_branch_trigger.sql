-- Mirrors businesses_create_main_branch: every new staff row automatically gets a
-- staff_branches row pointing at their business's main branch, so downstream code can rely on
-- "every staff member has a primary branch" as an invariant rather than needing a fallback
-- query at every call site.
CREATE OR REPLACE FUNCTION public.create_primary_branch_assignment_for_new_staff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  main_branch_id uuid;
BEGIN
  SELECT id INTO main_branch_id FROM public.business_branches
  WHERE business_id = NEW.business_id AND is_main
  LIMIT 1;

  IF main_branch_id IS NOT NULL THEN
    INSERT INTO public.staff_branches (staff_id, branch_id, is_primary)
    VALUES (NEW.id, main_branch_id, true)
    ON CONFLICT (staff_id, branch_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER staff_create_primary_branch AFTER INSERT ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.create_primary_branch_assignment_for_new_staff();
