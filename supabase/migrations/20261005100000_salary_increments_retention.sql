-- Lets the Increment Evaluation Form record the retention component (amount
-- and/or %) it stacked onto the performance-based increment, so it shows up
-- in the employee's Salary Increment history, not just inside the
-- evaluation workflow itself.
ALTER TABLE public.salary_increments
  ADD COLUMN IF NOT EXISTS retention_pct numeric(6,2),
  ADD COLUMN IF NOT EXISTS retention_amount numeric(12,2);
