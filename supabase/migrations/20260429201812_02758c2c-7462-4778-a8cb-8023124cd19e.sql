-- Allow payroll-authorized roles (admin, hr, executive) to update profiles
-- so they can edit base_salary, hourly_overtime_rate, pf_contribution_pct, etc.
CREATE POLICY "Payroll roles can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.can_access_payroll(auth.uid()))
WITH CHECK (public.can_access_payroll(auth.uid()));

-- Also allow them to view all profiles so they can manage salaries org-wide
CREATE POLICY "Payroll roles can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.can_access_payroll(auth.uid()));