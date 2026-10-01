-- Payroll OT/Due adjustments, expense recovery and HR warnings.
--
-- Additive only: no existing table, column, function or policy is altered
-- or dropped. Every amount column is plain `numeric` (no fixed scale) so
-- nothing is rounded before it is stored — rounding happens only when a
-- money value is displayed, per the payroll spec. Every table here is
-- append-only from the app's point of view: an "edit" is a new row, nothing
-- already written is ever updated or deleted by policy.

-- 1. Expense types: admin-extendable, never deletable from the UI (no
-- UPDATE/DELETE policy is granted at all), seeded with the categories
-- Expenses.tsx already offers today.
CREATE TABLE IF NOT EXISTS public.expense_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.expense_types (name) VALUES
  ('Travel'), ('Meals'), ('Office Supplies'), ('Software'), ('Training'), ('Client Entertainment'), ('Other')
ON CONFLICT (name) DO NOTHING;

GRANT SELECT ON public.expense_types TO authenticated;
GRANT INSERT ON public.expense_types TO authenticated;
GRANT ALL ON public.expense_types TO service_role;
ALTER TABLE public.expense_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view expense types"
  ON public.expense_types FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins add expense types"
  ON public.expense_types FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Expense direction + recovery tracking on the existing expense_claims
-- table — additive columns only, defaulted so existing rows keep working
-- unchanged (every existing claim is implicitly "Company Pays Employee").
ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'company_pays_employee'
    CHECK (direction IN ('company_pays_employee', 'employee_owes_company')),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_paid'
    CHECK (payment_status IN ('paid', 'not_paid')),
  ADD COLUMN IF NOT EXISTS paid_date date,
  ADD COLUMN IF NOT EXISTS recoverable_total numeric,
  ADD COLUMN IF NOT EXISTS recovered_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'open'
    CHECK (recovery_status IN ('open', 'partially_recovered', 'fully_recovered', 'waived', 'pending_decision'));

-- Each recovery decision/action is its own row — nothing on expense_claims
-- is ever overwritten to reflect a recovery; recovered_amount is a running
-- total maintained alongside this log for quick display.
CREATE TABLE IF NOT EXISTS public.expense_recovery_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_claim_id uuid NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('deduct_month', 'specific_amount', 'installment', 'paid_back_directly', 'waive', 'pending')),
  amount numeric NOT NULL DEFAULT 0,
  remaining_after numeric NOT NULL DEFAULT 0,
  month date NOT NULL,
  note text,
  admin_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.expense_recovery_actions TO authenticated;
GRANT ALL ON public.expense_recovery_actions TO service_role;
ALTER TABLE public.expense_recovery_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own expense recovery actions"
  ON public.expense_recovery_actions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins record expense recovery actions"
  ON public.expense_recovery_actions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Per-record OT decisions. One attendance OT record (identified by its
-- date) can be split across several decisions/minute allocations over time
-- as the admin reviews it — each decision is its own row, nothing here is
-- ever updated once written.
CREATE TABLE IF NOT EXISTS public.payroll_ot_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month date NOT NULL,
  attendance_date date NOT NULL,
  decision text NOT NULL CHECK (decision IN ('pay', 'do_not_pay', 'adjust_due', 'pending', 'carry_forward')),
  minutes integer NOT NULL CHECK (minutes >= 0),
  ot_multiplier numeric NOT NULL DEFAULT 1 CHECK (ot_multiplier > 0),
  rate_per_minute numeric NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  carried_to_month date,
  admin_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payroll_ot_adjustments TO authenticated;
GRANT ALL ON public.payroll_ot_adjustments TO service_role;
ALTER TABLE public.payroll_ot_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own OT adjustments"
  ON public.payroll_ot_adjustments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins record OT adjustments"
  ON public.payroll_ot_adjustments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Per-record Due decisions, same append-only shape as OT adjustments.
CREATE TABLE IF NOT EXISTS public.payroll_due_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month date NOT NULL,
  attendance_date date NOT NULL,
  decision text NOT NULL CHECK (decision IN ('adjusted_zero', 'leave_deduction', 'salary_deduction', 'adjust_ot', 'pending', 'carry_forward')),
  minutes integer NOT NULL CHECK (minutes >= 0),
  due_multiplier numeric NOT NULL DEFAULT 1 CHECK (due_multiplier > 0),
  rate_per_minute numeric NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  leave_type_id uuid REFERENCES public.leave_types(id),
  leave_days numeric,
  installment_group uuid,
  carried_to_month date,
  admin_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payroll_due_adjustments TO authenticated;
GRANT ALL ON public.payroll_due_adjustments TO service_role;
ALTER TABLE public.payroll_due_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own Due adjustments"
  ON public.payroll_due_adjustments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins record Due adjustments"
  ON public.payroll_due_adjustments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. OT <-> Due offsets: 1 OT minute cancels 1 Due minute, 1:1, and that
-- minute is never paid or deducted again elsewhere. Linking both adjustment
-- rows it came from keeps the offset auditable.
CREATE TABLE IF NOT EXISTS public.payroll_offsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month date NOT NULL,
  ot_adjustment_id uuid NOT NULL REFERENCES public.payroll_ot_adjustments(id),
  due_adjustment_id uuid NOT NULL REFERENCES public.payroll_due_adjustments(id),
  minutes integer NOT NULL CHECK (minutes > 0),
  admin_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.payroll_offsets TO authenticated;
GRANT ALL ON public.payroll_offsets TO service_role;
ALTER TABLE public.payroll_offsets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own offsets"
  ON public.payroll_offsets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins record offsets"
  ON public.payroll_offsets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. HR warnings: admin-authored, timestamped notes against an employee.
-- Visible to the employee themselves (read-only) and to admins. Manager
-- visibility is intentionally left out for now, pending confirmation.
CREATE TABLE IF NOT EXISTS public.hr_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  note text NOT NULL,
  warning_date date NOT NULL DEFAULT CURRENT_DATE,
  admin_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.hr_warnings TO authenticated;
GRANT ALL ON public.hr_warnings TO service_role;
ALTER TABLE public.hr_warnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own HR warnings"
  ON public.hr_warnings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins record HR warnings"
  ON public.hr_warnings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
