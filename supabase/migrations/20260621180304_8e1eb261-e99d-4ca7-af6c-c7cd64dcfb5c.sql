
-- =============== ENTERPRISE HRMS SCHEMA EXTENSION ===============

-- 1. Shifts / Roster
CREATE TABLE IF NOT EXISTS public.shifts_roster (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  grace_period_minutes INTEGER NOT NULL DEFAULT 10,
  work_days INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  color TEXT DEFAULT '#2563EB',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts_roster TO authenticated;
GRANT ALL ON public.shifts_roster TO service_role;
ALTER TABLE public.shifts_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view shifts" ON public.shifts_roster
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "HR/Admin manage shifts" ON public.shifts_roster
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

-- 2. Employee Shift Assignments
CREATE TABLE IF NOT EXISTS public.employee_shift_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  shift_id UUID NOT NULL REFERENCES public.shifts_roster(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  end_date DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_shift_assignments TO authenticated;
GRANT ALL ON public.employee_shift_assignments TO service_role;
ALTER TABLE public.employee_shift_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own assignments" ON public.employee_shift_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'hr')
    OR public.is_manager_of(auth.uid(), user_id));
CREATE POLICY "HR/Admin manage assignments" ON public.employee_shift_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

-- 3. Expense Claims
CREATE TABLE IF NOT EXISTS public.expense_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approver_id UUID,
  approver_note TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO authenticated;
GRANT ALL ON public.expense_claims TO service_role;
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own claims" ON public.expense_claims
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'hr')
    OR public.is_manager_of(auth.uid(), user_id)
  );
CREATE POLICY "Users create own claims" ON public.expense_claims
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own pending claims" ON public.expense_claims
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "Approvers manage claims" ON public.expense_claims
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'hr')
    OR public.is_manager_of(auth.uid(), user_id)
  );
CREATE POLICY "Admin delete claims" ON public.expense_claims
  FOR DELETE TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR (user_id = auth.uid() AND status = 'pending')
  );

-- 4. Employee Loans
CREATE TABLE IF NOT EXISTS public.employee_loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  principal_amount NUMERIC(12,2) NOT NULL,
  monthly_deduction NUMERIC(12,2) NOT NULL,
  remaining_balance NUMERIC(12,2) NOT NULL,
  interest_rate NUMERIC(5,2) DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  reason TEXT,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_loans TO authenticated;
GRANT ALL ON public.employee_loans TO service_role;
ALTER TABLE public.employee_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own loans" ON public.employee_loans
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'hr')
    OR public.can_access_payroll(auth.uid())
  );
CREATE POLICY "HR/Admin manage loans" ON public.employee_loans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

-- 5. Notice Board
CREATE TABLE IF NOT EXISTS public.notices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  author_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view notices" ON public.notices
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "HR/Admin manage notices" ON public.notices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr'));

-- 6. Add tax slabs + face recognition fields
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tax_slabs JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_descriptor JSONB;
ALTER TABLE public.attendance_logs ADD COLUMN IF NOT EXISTS device_source TEXT DEFAULT 'web';
ALTER TABLE public.attendance_logs ADD COLUMN IF NOT EXISTS face_verified BOOLEAN DEFAULT FALSE;

-- Triggers for updated_at
CREATE TRIGGER trg_shifts_roster_updated BEFORE UPDATE ON public.shifts_roster
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shift_assignments_updated BEFORE UPDATE ON public.employee_shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_expense_claims_updated BEFORE UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_employee_loans_updated BEFORE UPDATE ON public.employee_loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_notices_updated BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
