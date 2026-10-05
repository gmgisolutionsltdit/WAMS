-- Finishes the evaluation-to-increment pipeline: once an admin finalizes an
-- employee's weighted Section 4-6 performance result (from
-- performance_evaluation_requests/performance_evaluations), the app computes
-- their Section 3 salary category and the policy-based Section 6 increment
-- % range automatically (performance_evaluation_finalizations). The
-- Increment Evaluation Form then turns that recommendation into the
-- increment actually applied, which is written back into the existing
-- salary_increments ledger (increment_evaluations).

CREATE TABLE public.performance_evaluation_finalizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  finalized_by uuid NOT NULL REFERENCES public.profiles(id),
  weighted_average numeric NOT NULL,
  final_category text NOT NULL,
  gross_salary numeric NOT NULL,
  salary_category text NOT NULL CHECK (salary_category IN ('A', 'B', 'C')),
  recommended_min_pct numeric NOT NULL,
  recommended_max_pct numeric NOT NULL,
  request_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_perf_eval_finalizations_employee ON public.performance_evaluation_finalizations(employee_id);

ALTER TABLE public.performance_evaluation_finalizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage finalizations" ON public.performance_evaluation_finalizations
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.increment_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finalization_id uuid NOT NULL REFERENCES public.performance_evaluation_finalizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_scenario text NOT NULL CHECK (company_scenario IN ('strong', 'average', 'weak', 'freeze')),
  approved_increment_factor_pct numeric NOT NULL DEFAULT 0,
  average_recommended_pct numeric NOT NULL,
  final_increment_pct numeric NOT NULL,
  gross_salary_before numeric NOT NULL,
  gross_salary_after numeric NOT NULL,
  retention_recommended boolean NOT NULL DEFAULT false,
  retention_checklist text[] NOT NULL DEFAULT '{}',
  retention_pct numeric,
  retention_amount numeric,
  retention_period text,
  retention_condition text,
  retention_justification text,
  final_approved_retention_pct numeric,
  final_approved_bonus_amount numeric,
  final_notes text,
  salary_increment_id uuid REFERENCES public.salary_increments(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_increment_evaluations_employee ON public.increment_evaluations(employee_id);

ALTER TABLE public.increment_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage increment evaluations" ON public.increment_evaluations
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
