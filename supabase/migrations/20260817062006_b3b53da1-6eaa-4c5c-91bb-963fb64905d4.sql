-- 1) Restrict biometric device network details to admin/hr
DROP POLICY IF EXISTS "Authenticated can view biometric devices" ON public.biometric_devices;
CREATE POLICY "Admin/HR can view biometric devices"
ON public.biometric_devices FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr'::app_role));

-- 2) Remove broad teammate access to full leave rows (incl. reason)
DROP POLICY IF EXISTS "Teammates view approved leave in same wing-dept" ON public.leave_requests;

-- Minimal, reason-free team calendar view (runs with owner privileges, scoped to same wing+department)
CREATE OR REPLACE VIEW public.team_leave_calendar
WITH (security_barrier = true) AS
SELECT lr.id, lr.user_id, lr.leave_type_id, lr.start_date, lr.end_date,
       lr.day_type, lr.total_days, lr.status
FROM public.leave_requests lr
JOIN public.profiles p ON p.id = lr.user_id
WHERE lr.status = 'approved'::leave_status
  AND p.department IS NOT NULL
  AND p.department = public.current_user_department()
  AND p.company_wing = public.current_user_wing();

GRANT SELECT ON public.team_leave_calendar TO authenticated;