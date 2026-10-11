-- Loan requests (personal_advances) now capture which month the employee is
-- requesting the loan for, so admins reviewing it have that context without
-- guessing from the created_at timestamp.
ALTER TABLE public.personal_advances
  ADD COLUMN IF NOT EXISTS month date; -- first of month
