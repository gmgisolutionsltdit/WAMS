-- 1. Who is allowed to approve "Approve Start Time" (a late_time_requests row
-- of type 'late_adjustment'). Defaults to admin-only; an admin can widen it
-- to include reporting managers via Settings.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS start_time_approver_role text NOT NULL DEFAULT 'admin';
ALTER TABLE public.settings
  DROP CONSTRAINT IF EXISTS settings_start_time_approver_role_chk;
ALTER TABLE public.settings
  ADD CONSTRAINT settings_start_time_approver_role_chk
  CHECK (start_time_approver_role IN ('admin', 'manager_or_admin'));

COMMENT ON COLUMN public.settings.start_time_approver_role IS
  'Who may approve a late_adjustment (Approve Start Time) request: admin-only, or managers too.';

CREATE OR REPLACE FUNCTION public.start_time_approval_allows_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT start_time_approver_role = 'manager_or_admin' FROM public.settings LIMIT 1),
    false
  );
$$;

-- 2. Enforce it: a non-admin may only decide a late_adjustment request when
-- the setting allows managers, in addition to already being the assigned
-- approver or in the employee's management chain. office_time_change keeps
-- its existing rule untouched.
DROP POLICY IF EXISTS "Approvers decide late requests" ON public.late_time_requests;
CREATE POLICY "Approvers decide late requests"
  ON public.late_time_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      request_type <> 'late_adjustment'
      AND (auth.uid() = assigned_approver_id OR public.is_in_management_chain(auth.uid(), user_id))
    )
    OR (
      request_type = 'late_adjustment'
      AND public.start_time_approval_allows_manager()
      AND (auth.uid() = assigned_approver_id OR public.is_in_management_chain(auth.uid(), user_id))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      request_type <> 'late_adjustment'
      AND (auth.uid() = assigned_approver_id OR public.is_in_management_chain(auth.uid(), user_id))
    )
    OR (
      request_type = 'late_adjustment'
      AND public.start_time_approval_allows_manager()
      AND (auth.uid() = assigned_approver_id OR public.is_in_management_chain(auth.uid(), user_id))
    )
  );

-- 3. Once approved, Approved Start Time should read as the real time the
-- employee actually clicked Start (clock_in), not a synthetic "on time"
-- stamp - the penalty waiver is already visible via penalty_minutes/the
-- Status badge, and substituting a fictional office-start time here misrepresented
-- when the employee actually arrived.
CREATE OR REPLACE FUNCTION public.apply_late_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF NEW.request_type = 'office_time_change' THEN
      UPDATE public.profiles
      SET office_start_time = COALESCE(NEW.requested_start_time, office_start_time),
          office_end_time = COALESCE(NEW.requested_end_time, office_end_time)
      WHERE id = NEW.user_id;
    ELSIF NEW.request_type = 'late_adjustment' THEN
      UPDATE public.attendance_logs al
      SET penalty_minutes = GREATEST(0, al.penalty_minutes - COALESCE(NEW.adjustment_minutes, 0)),
          penalty_reviewed = true,
          approved_start_time = al.clock_in
      WHERE al.user_id = NEW.user_id AND al.date = NEW.effective_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
