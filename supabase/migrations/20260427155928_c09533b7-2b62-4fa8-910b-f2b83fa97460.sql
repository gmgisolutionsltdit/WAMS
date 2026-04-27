-- Allow general employees to view colleagues in same wing + department (read-only)
CREATE POLICY "Employees view same wing and department"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = auth.uid()
      AND me.company_wing = profiles.company_wing
      AND me.department IS NOT NULL
      AND profiles.department IS NOT NULL
      AND me.department = profiles.department
  )
);