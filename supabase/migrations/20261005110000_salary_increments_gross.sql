-- Lets Promotion & Increment History show the gross salary before/after an
-- increment alongside the basic-salary figures already there (base_salary,
-- increment_amount apply to Basic per policy) — populated when a row is
-- created from the Increment Evaluation Form; left null for a plain manual
-- entry that never tracked gross.
ALTER TABLE public.salary_increments
  ADD COLUMN IF NOT EXISTS gross_salary_before numeric(12,2),
  ADD COLUMN IF NOT EXISTS gross_salary_after numeric(12,2);
