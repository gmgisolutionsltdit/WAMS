-- Basic Salary moved from 60% to 50% of gross (20261005070000). Rows created
-- before that fix still carry their Previous Basic / Increment / Retention
-- amounts computed off the old 60% figure, which is wrong under the current
-- rule. Recompute them off 50% for any row whose gross is tracked (i.e. it
-- came from the Increment Evaluation Form, via the already-backfilled
-- gross_salary_before) — increment_pct/retention_pct themselves are
-- dimensionless and don't need to change, only the BDT amounts derived from
-- them.
UPDATE public.salary_increments si
SET
  base_salary = ROUND(ie.gross_salary_before * 0.5, 2),
  increment_amount = ROUND(ie.gross_salary_before * 0.5 * si.increment_pct / 100, 2),
  retention_amount = CASE
    WHEN si.retention_pct IS NOT NULL THEN ROUND(ie.gross_salary_before * 0.5 * si.retention_pct / 100, 2)
    ELSE si.retention_amount
  END
FROM public.increment_evaluations ie
WHERE ie.salary_increment_id = si.id
  AND si.gross_salary_before IS NOT NULL;
