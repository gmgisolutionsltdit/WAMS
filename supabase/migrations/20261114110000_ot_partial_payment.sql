-- Overtime payment becomes its own partially-payable, carry-forward line
-- item in My Payments — same pattern Expense Balance and Loan Due already
-- use (an editable amount box + Adjust Now checkbox), instead of being
-- bundled into "Net Adjustment" with Due Deduction as one all-or-nothing
-- figure. Due Deduction stays always-applied (it's a penalty, not optional)
-- and is folded straight into the base salary going forward.
ALTER TABLE public.payroll_settlements ADD COLUMN IF NOT EXISTS ot_amount_paid numeric NOT NULL DEFAULT 0;
ALTER TABLE public.payroll_settlements ADD COLUMN IF NOT EXISTS ot_paid boolean NOT NULL DEFAULT true;
