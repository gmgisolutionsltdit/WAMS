-- Backfill: salary_increments.gross_salary_before/after (added in
-- 20261005110000) didn't exist yet when earlier rows were created from the
-- Increment Evaluation Form, so those rows show no New Gross. The linked
-- increment_evaluations row already had that data from the start — copy it
-- across for any salary_increments row that's missing it.
UPDATE public.salary_increments si
SET
  gross_salary_before = ie.gross_salary_before,
  gross_salary_after = ie.gross_salary_after
FROM public.increment_evaluations ie
WHERE ie.salary_increment_id = si.id
  AND si.gross_salary_before IS NULL;
