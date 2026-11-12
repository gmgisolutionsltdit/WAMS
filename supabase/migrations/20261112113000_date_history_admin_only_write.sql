-- Adding/removing extra Joining/Promotion date entries is admin-only (an
-- employee must not be able to add or delete their own promotion/rejoin
-- history) — drop the manager write policy added in
-- 20261112110000_employee_date_history.sql, keeping managers able to view
-- their direct reports' history via the existing profiles relationship but
-- not write it.
DROP POLICY IF EXISTS "Managers manage their direct reports' date history" ON public.employee_date_history;

CREATE POLICY "Managers view their direct reports' date history"
  ON public.employee_date_history FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = employee_date_history.user_id
        AND (pr.reporting_manager_id = auth.uid() OR pr.reporting_manager_ids @> ARRAY[auth.uid()])
    )
  );
