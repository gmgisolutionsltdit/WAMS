-- Expense Recovery gets the same "Carry Forward" option OT and Due
-- adjustments already have: admin picks which month to defer the
-- remaining recoverable amount to, instead of only Pending/Deduct/Waive.
ALTER TABLE public.expense_recovery_actions
  ADD COLUMN IF NOT EXISTS carried_to_month date;
