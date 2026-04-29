
-- Profiles: payroll columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS base_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_overtime_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pf_contribution_pct numeric NOT NULL DEFAULT 0;

-- Settings: currency
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BDT';

-- Helper: payroll-authorized?
CREATE OR REPLACE FUNCTION public.can_access_payroll(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin'::public.app_role, 'hr'::public.app_role, 'executive'::public.app_role)
  )
$$;

-- payroll_records
CREATE TABLE IF NOT EXISTS public.payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  base_salary numeric NOT NULL DEFAULT 0,
  ot_hours numeric NOT NULL DEFAULT 0,
  ot_amount numeric NOT NULL DEFAULT 0,
  incentives_amount numeric NOT NULL DEFAULT 0,
  gross_pay numeric NOT NULL DEFAULT 0,
  pf_employee numeric NOT NULL DEFAULT 0,
  pf_employer numeric NOT NULL DEFAULT 0,
  other_deductions numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BDT',
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_payroll_records_period ON public.payroll_records(period_year, period_month);
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll roles view records" ON public.payroll_records
  FOR SELECT TO authenticated USING (public.can_access_payroll(auth.uid()));
CREATE POLICY "Payroll roles insert records" ON public.payroll_records
  FOR INSERT TO authenticated WITH CHECK (public.can_access_payroll(auth.uid()));
CREATE POLICY "Payroll roles update records" ON public.payroll_records
  FOR UPDATE TO authenticated USING (public.can_access_payroll(auth.uid()));
CREATE POLICY "Payroll roles delete records" ON public.payroll_records
  FOR DELETE TO authenticated USING (public.can_access_payroll(auth.uid()));

CREATE TRIGGER trg_payroll_records_updated_at
  BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- payroll_incentives
CREATE TABLE IF NOT EXISTS public.payroll_incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_year int NOT NULL,
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  label text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_incentives_user_period
  ON public.payroll_incentives(user_id, period_year, period_month);
ALTER TABLE public.payroll_incentives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll roles manage incentives" ON public.payroll_incentives
  FOR ALL TO authenticated
  USING (public.can_access_payroll(auth.uid()))
  WITH CHECK (public.can_access_payroll(auth.uid()));

CREATE TRIGGER trg_payroll_incentives_updated_at
  BEFORE UPDATE ON public.payroll_incentives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
