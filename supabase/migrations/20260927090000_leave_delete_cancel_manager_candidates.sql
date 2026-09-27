-- 1. leave_requests never had a DELETE policy at all (same gap fixed on
--    overtime_requests earlier), so admins had no way to remove a decided
--    leave request from the log.
CREATE POLICY "Approvers delete leave requests"
  ON public.leave_requests FOR DELETE TO authenticated
  USING (public.can_approve(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. "Users update own pending leave" had no explicit WITH CHECK, so
--    Postgres reused its USING clause (status = 'pending') as the check —
--    meaning the new row also had to have status = 'pending', which is
--    never true when cancelling (new status = 'cancelled'). This silently
--    blocked every employee self-cancel.
DROP POLICY IF EXISTS "Users update own pending leave" ON public.leave_requests;
CREATE POLICY "Users update own pending leave"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id);

-- 3. The "Reporting To" picker in Employee Management built its manager
--    list from the already-loaded `employees` state, which for a manager
--    viewer is scoped (by profiles RLS) to just their own direct reports
--    — so the picker was always empty for anyone but an admin. This
--    security-definer function returns the org-wide admin/manager roster
--    regardless of the caller's own visibility scope.
CREATE OR REPLACE FUNCTION public.manager_candidates()
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('admin', 'manager')
$$;

GRANT EXECUTE ON FUNCTION public.manager_candidates() TO authenticated;
