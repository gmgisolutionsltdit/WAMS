
-- =========================================================
-- Leave types — bridge_holidays
-- =========================================================
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS bridge_holidays boolean NOT NULL DEFAULT true;

-- =========================================================
-- OT routing
-- =========================================================
ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS assigned_approver_id uuid;

CREATE OR REPLACE FUNCTION public.route_overtime_request()
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

  SELECT reporting_manager_id INTO _manager
  FROM public.profiles WHERE id = NEW.user_id;

  IF _manager IS NOT NULL THEN
    NEW.assigned_approver_id := _manager;
  ELSE
    SELECT user_id INTO _admin
    FROM public.user_roles
    WHERE role = 'admin'
    ORDER BY created_at ASC LIMIT 1;
    NEW.assigned_approver_id := _admin;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_overtime_request ON public.overtime_requests;
CREATE TRIGGER trg_route_overtime_request
  BEFORE INSERT ON public.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION public.route_overtime_request();

UPDATE public.overtime_requests o
SET assigned_approver_id = COALESCE(
  (SELECT reporting_manager_id FROM public.profiles p WHERE p.id = o.user_id),
  (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at LIMIT 1)
)
WHERE assigned_approver_id IS NULL;

-- =========================================================
-- 48-hour retro lock
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_48h_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'hr'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.date IS NOT NULL
     AND NEW.date < (CURRENT_DATE - INTERVAL '2 days')::date THEN
    RAISE EXCEPTION 'Submissions for dates older than 48 hours are restricted.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_48h_window_attendance ON public.attendance_logs;
CREATE TRIGGER trg_48h_window_attendance
  BEFORE INSERT ON public.attendance_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_48h_window();

DROP TRIGGER IF EXISTS trg_48h_window_overtime ON public.overtime_requests;
CREATE TRIGGER trg_48h_window_overtime
  BEFORE INSERT ON public.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_48h_window();

CREATE OR REPLACE FUNCTION public.enforce_48h_window_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'hr'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.start_date IS NOT NULL
     AND NEW.start_date < (CURRENT_DATE - INTERVAL '2 days')::date THEN
    RAISE EXCEPTION 'Submissions for dates older than 48 hours are restricted.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_48h_window_leave ON public.leave_requests;
CREATE TRIGGER trg_48h_window_leave
  BEFORE INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_48h_window_leave();

-- =========================================================
-- Dynamic Wings
-- =========================================================
CREATE TABLE IF NOT EXISTS public.company_wings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_wings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view wings" ON public.company_wings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage wings" ON public.company_wings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_company_wings_updated
  BEFORE UPDATE ON public.company_wings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.company_wings (name, code)
  VALUES ('GMGI', 'GMGI'), ('MORU', 'MORU')
  ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wing_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wing_id uuid NOT NULL REFERENCES public.company_wings(id) ON DELETE CASCADE,
  title text NOT NULL,
  level int NOT NULL DEFAULT 0,
  parent_id uuid REFERENCES public.wing_designations(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wing_designations_wing ON public.wing_designations(wing_id);
CREATE INDEX IF NOT EXISTS idx_wing_designations_parent ON public.wing_designations(parent_id);
ALTER TABLE public.wing_designations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view designations" ON public.wing_designations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage designations" ON public.wing_designations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wing_id uuid REFERENCES public.company_wings(id);

-- =========================================================
-- Supervisor helpers & RLS
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_supervisor_of(_sup uuid, _emp uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _emp AND reporting_manager_id = _sup
  )
$$;

CREATE POLICY "Supervisors view downline leave"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role)
         AND public.is_supervisor_of(auth.uid(), user_id));

CREATE POLICY "Supervisors update downline leave"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role)
         AND public.is_supervisor_of(auth.uid(), user_id));

CREATE POLICY "Supervisors view downline OT"
  ON public.overtime_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role)
         AND (public.is_supervisor_of(auth.uid(), user_id) OR assigned_approver_id = auth.uid()));

CREATE POLICY "Supervisors update downline OT"
  ON public.overtime_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role)
         AND (public.is_supervisor_of(auth.uid(), user_id) OR assigned_approver_id = auth.uid()));

CREATE POLICY "Supervisors view downline attendance"
  ON public.attendance_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role)
         AND public.is_supervisor_of(auth.uid(), user_id));

-- =========================================================
-- Salary Increment Ledger
-- =========================================================
CREATE TABLE IF NOT EXISTS public.salary_increments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cycle_label text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  base_salary numeric NOT NULL DEFAULT 0,
  increment_amount numeric NOT NULL DEFAULT 0,
  increment_pct numeric NOT NULL DEFAULT 0,
  reason text,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_salary_increments_user ON public.salary_increments(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_increments_dates ON public.salary_increments(effective_from, effective_to);

ALTER TABLE public.salary_increments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll manage salary increments"
  ON public.salary_increments FOR ALL TO authenticated
  USING (public.can_access_payroll(auth.uid()))
  WITH CHECK (public.can_access_payroll(auth.uid()));

CREATE POLICY "Users view own salary increments"
  ON public.salary_increments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_salary_increments_updated
  BEFORE UPDATE ON public.salary_increments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
