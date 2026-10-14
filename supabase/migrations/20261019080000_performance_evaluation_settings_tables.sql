-- Extends performance_evaluation_settings with three more admin-editable
-- policy tables (values only — row/column shape stays fixed to match the
-- official evaluation form): the Section 6 Performance Category guide
-- (description + expected behaviors per category), the Section 6A
-- Increment Range matrix (salary category x performance category), and
-- the Increment Evaluation step's Company Performance scenario ranges.
-- NULL means "use the built-in defaults" (src/lib/performanceEvaluation.ts
-- / src/lib/incrementEvaluation.ts) — nothing breaks until an admin saves
-- an override.
ALTER TABLE public.performance_evaluation_settings
  ADD COLUMN IF NOT EXISTS performance_category_guide jsonb,
  ADD COLUMN IF NOT EXISTS increment_policy jsonb,
  ADD COLUMN IF NOT EXISTS company_scenario_ranges jsonb;
