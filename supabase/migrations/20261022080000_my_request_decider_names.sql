-- The Notice Board activity feed shows who decided an employee's own
-- request. Profile RLS ("Users can view their own profile") correctly
-- blocks a regular employee from reading their manager's/admin's profile
-- directly, so a plain `profiles` SELECT never returns the decider's name
-- for that employee. This function is SECURITY DEFINER but scoped: it only
-- ever resolves names for deciders of requests the caller themselves filed
-- (user_id = auth.uid() is baked into every branch, not caller-supplied),
-- so it can't be used to look up arbitrary profiles.
CREATE OR REPLACE FUNCTION public.my_request_decider_names()
RETURNS TABLE(user_id UUID, full_name TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.id, COALESCE(p.full_name, p.email)
  FROM public.profiles p
  WHERE p.id IN (
    SELECT approver_id FROM public.leave_requests WHERE user_id = auth.uid() AND approver_id IS NOT NULL
    UNION
    SELECT approved_by FROM public.late_time_requests WHERE user_id = auth.uid() AND approved_by IS NOT NULL
    UNION
    SELECT approved_by FROM public.manual_time_requests WHERE user_id = auth.uid() AND approved_by IS NOT NULL
    UNION
    SELECT approved_by FROM public.overtime_requests WHERE user_id = auth.uid() AND approved_by IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.my_request_decider_names() TO authenticated;
