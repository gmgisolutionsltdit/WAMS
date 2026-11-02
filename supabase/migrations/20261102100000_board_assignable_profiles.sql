-- Board membership assignment needs every employee to be pickable as a
-- board member/share target, regardless of the wing/reporting-chain scoping
-- that normally limits who a given profiles row is visible to. Rather than
-- widening the general "profiles" SELECT policy (used by payroll, approvals,
-- etc.), expose a narrow SECURITY DEFINER function returning just the
-- columns the board-member picker needs, for any authenticated employee.
CREATE OR REPLACE FUNCTION public.get_board_assignable_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  photo_url text,
  department text,
  designation text,
  company_wing text,
  reporting_manager_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, full_name, email, photo_url, department, designation, company_wing, reporting_manager_id
  FROM public.profiles
  ORDER BY full_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_board_assignable_profiles() TO authenticated;
