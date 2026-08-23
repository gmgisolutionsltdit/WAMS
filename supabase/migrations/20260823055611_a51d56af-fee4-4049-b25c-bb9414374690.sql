-- 1. Office time fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS office_start_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS office_end_time time NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS late_grace_minutes integer NOT NULL DEFAULT 11;

-- 2. Manual time entry requests
CREATE TABLE IF NOT EXISTS public.manual_time_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz NOT NULL,
  break_minutes numeric NOT NULL DEFAULT 0,
  due_hours numeric NOT NULL DEFAULT 8,
  overtime_hours numeric NOT NULL DEFAULT 0,
  total_hours numeric NOT NULL DEFAULT 0,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  task_note text,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  assigned_approver_id uuid,
  approved_by uuid,
  approver_note text,
  applied_log_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_time_requests_status_chk CHECK (status IN ('pending','approved','rejected'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_time_requests TO authenticated;
GRANT ALL ON public.manual_time_requests TO service_role;
ALTER TABLE public.manual_time_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create own manual time requests"
  ON public.manual_time_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own manual time requests"
  ON public.manual_time_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = assigned_approver_id);

CREATE POLICY "Approvers view manual time requests"
  ON public.manual_time_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_in_management_chain(auth.uid(), user_id)
  );

CREATE POLICY "Approvers decide manual time requests"
  ON public.manual_time_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = assigned_approver_id
    OR public.is_in_management_chain(auth.uid(), user_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = assigned_approver_id
    OR public.is_in_management_chain(auth.uid(), user_id)
  );

CREATE POLICY "Users cancel own pending manual time requests"
  ON public.manual_time_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

-- 3. Late time requests
CREATE TABLE IF NOT EXISTS public.late_time_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  request_type text NOT NULL DEFAULT 'late_adjustment',
  effective_date date NOT NULL,
  requested_start_time time,
  requested_end_time time,
  late_minutes numeric NOT NULL DEFAULT 0,
  adjustment_minutes numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  assigned_approver_id uuid,
  approved_by uuid,
  approver_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT late_time_requests_status_chk CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT late_time_requests_type_chk CHECK (request_type IN ('late_adjustment','office_time_change'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.late_time_requests TO authenticated;
GRANT ALL ON public.late_time_requests TO service_role;
ALTER TABLE public.late_time_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users create own late requests"
  ON public.late_time_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own late requests"
  ON public.late_time_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = assigned_approver_id);

CREATE POLICY "Approvers view late requests"
  ON public.late_time_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_in_management_chain(auth.uid(), user_id)
  );

CREATE POLICY "Approvers decide late requests"
  ON public.late_time_requests FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = assigned_approver_id
    OR public.is_in_management_chain(auth.uid(), user_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR auth.uid() = assigned_approver_id
    OR public.is_in_management_chain(auth.uid(), user_id)
  );

CREATE POLICY "Users cancel own pending late requests"
  ON public.late_time_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

-- 4. Routing to reporting manager / admin
CREATE OR REPLACE FUNCTION public.route_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _manager uuid;
  _admin uuid;
BEGIN
  IF NEW.assigned_approver_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT reporting_manager_id INTO _manager FROM public.profiles WHERE id = NEW.user_id;
  IF _manager IS NOT NULL THEN
    NEW.assigned_approver_id := _manager;
  ELSE
    SELECT user_id INTO _admin FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
    NEW.assigned_approver_id := _admin;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_route_manual_time_request
  BEFORE INSERT ON public.manual_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.route_time_request();

CREATE TRIGGER trg_route_late_time_request
  BEFORE INSERT ON public.late_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.route_time_request();

CREATE TRIGGER trg_manual_time_requests_updated
  BEFORE UPDATE ON public.manual_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_late_time_requests_updated
  BEFORE UPDATE ON public.late_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Office time change must be at least 1 day in advance
CREATE OR REPLACE FUNCTION public.enforce_office_time_lead_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.request_type = 'office_time_change'
     AND NEW.effective_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Office time change requests must be submitted at least 1 day in advance.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_late_time_lead_time
  BEFORE INSERT ON public.late_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_office_time_lead_time();

-- 6. Apply approvals
CREATE OR REPLACE FUNCTION public.apply_manual_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_id uuid;
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' AND NEW.applied_log_id IS NULL THEN
    INSERT INTO public.attendance_logs (user_id, date, clock_in, clock_out, total_hours, overtime_hours, break_minutes, device_source)
    VALUES (NEW.user_id, NEW.date, NEW.clock_in, NEW.clock_out, NEW.total_hours, NEW.overtime_hours, NEW.break_minutes, 'manual')
    RETURNING id INTO _log_id;
    NEW.applied_log_id := _log_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_manual_time_request
  BEFORE UPDATE ON public.manual_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_manual_time_request();

CREATE OR REPLACE FUNCTION public.apply_late_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved'
     AND NEW.request_type = 'office_time_change' THEN
    UPDATE public.profiles
    SET office_start_time = COALESCE(NEW.requested_start_time, office_start_time),
        office_end_time = COALESCE(NEW.requested_end_time, office_end_time)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_late_time_request
  BEFORE UPDATE ON public.late_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_late_time_request();

-- 7. History edits: admin only (users may still close out the current day)
DROP POLICY IF EXISTS "Users can update their own attendance" ON public.attendance_logs;
DROP POLICY IF EXISTS "Users can delete their own attendance" ON public.attendance_logs;

CREATE POLICY "Users update own attendance for today"
  ON public.attendance_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND date = CURRENT_DATE)
  WITH CHECK (auth.uid() = user_id AND date = CURRENT_DATE);
