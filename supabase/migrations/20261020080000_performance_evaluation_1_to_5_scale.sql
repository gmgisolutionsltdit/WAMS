-- Reverts the Performance Evaluation scoring scale from 1-4 (20261018080000/
-- 20261019080000) back to the original 1-5 scale (as of PR #177): widen the
-- default_score check, and reset the settings row's scale-dependent fields
-- back to their 1-5 equivalents — but only when they still hold the 1-4
-- defaults untouched by an admin, so a genuine admin override survives.
ALTER TABLE public.performance_evaluation_settings
  DROP CONSTRAINT IF EXISTS performance_evaluation_settings_default_score_check,
  ADD CONSTRAINT performance_evaluation_settings_default_score_check CHECK (default_score BETWEEN 1 AND 5);

ALTER TABLE public.performance_evaluation_settings
  ALTER COLUMN default_score SET DEFAULT 3;

UPDATE public.performance_evaluation_settings
SET threshold_outstanding = 4.5
WHERE threshold_outstanding = 3.6;

UPDATE public.performance_evaluation_settings
SET threshold_above = 3.5
WHERE threshold_above = 2.8;

UPDATE public.performance_evaluation_settings
SET threshold_meet = 2.5
WHERE threshold_meet = 2.0;

UPDATE public.performance_evaluation_settings
SET default_score = 3
WHERE default_score = 2;

-- performance_category_guide used to hold the 4-row
-- {score,category,description,behaviors} Performance Category guide; it now
-- holds the 5-row {score,label,description} Score Scale instead (src/lib/
-- performanceEvaluation.ts DEFAULT_SCORE_SCALE). Clear any row still in the
-- old shape so the code's new default takes over.
UPDATE public.performance_evaluation_settings
SET performance_category_guide = NULL
WHERE performance_category_guide IS NOT NULL
  AND jsonb_typeof(performance_category_guide) = 'array'
  AND performance_category_guide -> 0 ? 'category';
