-- Lets a manager Edit, Reset Password and Delete their own direct reports
-- from the new "Profile" sidebar tab — the same actions admins already had
-- from Employee Management, scoped to just the employees reporting to them.

CREATE POLICY "Managers update their direct reports' profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND (reporting_manager_id = auth.uid() OR reporting_manager_ids @> ARRAY[auth.uid()])
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND (reporting_manager_id = auth.uid() OR reporting_manager_ids @> ARRAY[auth.uid()])
  );
