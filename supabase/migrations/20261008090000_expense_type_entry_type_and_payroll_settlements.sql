-- 1. Expense categories are now scoped to an entry type (Expense vs
-- Advance), since the New Claim form asks Entry Type first and offers a
-- different category list depending on the answer. Existing categories
-- default to 'expense' (none of the seeded categories — Travel, Meals,
-- Office Supplies, Software, Training, Client Entertainment, Other — make
-- sense as an advance purpose); admin adds 'advance' categories separately.
ALTER TABLE public.expense_types
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'expense'
    CHECK (entry_type IN ('expense', 'advance'));

-- The table had a global UNIQUE(name) constraint; a category name can now
-- repeat once per entry type (e.g. "Other" under both Expense and Advance).
ALTER TABLE public.expense_types DROP CONSTRAINT IF EXISTS expense_types_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS expense_types_name_entry_type_key
  ON public.expense_types(name, entry_type);

-- 2. "My Payments" — the admin disbursement record for a given employee's
-- month: how much of that month's Net Hours payment, outstanding Expense
-- balance and Loan due was actually paid out now vs left outstanding.
-- Net Hours is binary (paid now or carried to next month, matching the
-- "Carry Forward" option OT/Due/Expense-Recovery decisions already have);
-- Expense and Loan amounts can be partial. One settlement row per
-- employee per month — re-paying the same month updates it in place.
CREATE TABLE IF NOT EXISTS public.payroll_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month date NOT NULL, -- first of month
  net_hours_amount numeric NOT NULL DEFAULT 0, -- the Net Hours figure as of this payment (otPayment - dueDeduction)
  net_hours_paid boolean NOT NULL DEFAULT false, -- true = paid now, false = carried to next month
  expense_amount_paid numeric NOT NULL DEFAULT 0,
  loan_amount_paid numeric NOT NULL DEFAULT 0,
  note text,
  paid_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

GRANT SELECT, INSERT, UPDATE ON public.payroll_settlements TO authenticated;
GRANT ALL ON public.payroll_settlements TO service_role;
ALTER TABLE public.payroll_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payroll settlements"
  ON public.payroll_settlements FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins record payroll settlements"
  ON public.payroll_settlements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update payroll settlements"
  ON public.payroll_settlements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
