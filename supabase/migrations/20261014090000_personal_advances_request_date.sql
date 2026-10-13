-- Request Loan dialog now captures an explicit Request Date (separate from
-- the auto-set created_at), shown as the Loan History table's Date column.
ALTER TABLE public.personal_advances
  ADD COLUMN IF NOT EXISTS request_date DATE NOT NULL DEFAULT CURRENT_DATE;
