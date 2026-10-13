-- Net Payment now depends on whether Expense/Loan were actually adjusted
-- now (not just their amount) — persist the same "Adjust Now" checkbox
-- state net_hours_paid already records, for Expense and Loan too, so the
-- employee's read-only My Payments view can reproduce the same Net Payment
-- figure the admin saw when recording it.
ALTER TABLE public.payroll_settlements
  ADD COLUMN IF NOT EXISTS expense_paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS loan_paid boolean NOT NULL DEFAULT true;
