-- Employees can be promoted, or rejoin, more than once over their career.
-- profiles.joining_date/promotion_date stay the primary (most prominent)
-- date for each, but this table lets an admin/manager add further dates —
-- a full history shown as a list on the employee's profile.
CREATE TABLE IF NOT EXISTS public.employee_date_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date_type TEXT NOT NULL CHECK (date_type IN ('joining', 'promotion')),
  date DATE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_date_history_user_idx ON public.employee_date_history (user_id, date_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_date_history TO authenticated;
ALTER TABLE public.employee_date_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own date history"
  ON public.employee_date_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all date history"
  ON public.employee_date_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Managers manage their direct reports' date history"
  ON public.employee_date_history FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = employee_date_history.user_id
        AND (pr.reporting_manager_id = auth.uid() OR pr.reporting_manager_ids @> ARRAY[auth.uid()])
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = employee_date_history.user_id
        AND (pr.reporting_manager_id = auth.uid() OR pr.reporting_manager_ids @> ARRAY[auth.uid()])
    )
  );
