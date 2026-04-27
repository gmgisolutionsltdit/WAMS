-- Allow employees to see approved leave requests of teammates in the same wing & department.
-- Managers and admins are already covered by existing policies.
CREATE POLICY "Teammates view approved leave in same wing-dept"
ON public.leave_requests
FOR SELECT
TO authenticated
USING (
  status = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = leave_requests.user_id
      AND p.department IS NOT NULL
      AND p.department = public.current_user_department()
      AND p.company_wing = public.current_user_wing()
  )
);