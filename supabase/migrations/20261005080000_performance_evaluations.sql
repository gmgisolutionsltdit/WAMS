-- Employee Performance Evaluation, digitizing Section 4 (scored criteria),
-- Section 5 (total/average score) and Section 6 (final category) of the
-- Employee Performance Evaluation Form: an admin requests one or more
-- managers/admins to evaluate an employee; each evaluator scores 14
-- criteria (1-5) grouped into 5 categories, and the app computes that
-- evaluator's total/average score and category automatically. When more
-- than one evaluator covers the same employee, the admin assigns each
-- evaluation a weight, and the final category is the weighted average of
-- the evaluators' average scores.

CREATE TABLE public.performance_evaluation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  period_from date,
  period_to date,
  -- Admin-assigned weightage factor used to combine this evaluator's result
  -- with others' into the employee's final Section 6 category. Defaults to
  -- 1 (equal weight) and is only meaningful once more than one evaluation
  -- exists for the same employee.
  weight numeric(5,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);

CREATE TABLE public.performance_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.performance_evaluation_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evaluator_designation text,
  relationship text,
  -- One entry per Section 4 criterion: { category, criterion, score (1-5), comment }.
  scores jsonb NOT NULL,
  criteria_count integer NOT NULL,
  total_score numeric NOT NULL,
  average_score numeric NOT NULL,
  category text NOT NULL,
  justification text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_performance_eval_requests_employee ON public.performance_evaluation_requests(employee_id);
CREATE INDEX idx_performance_eval_requests_evaluator ON public.performance_evaluation_requests(evaluator_id);
CREATE INDEX idx_performance_evaluations_employee ON public.performance_evaluations(employee_id);

ALTER TABLE public.performance_evaluation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage evaluation requests" ON public.performance_evaluation_requests
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Evaluators view their own requests" ON public.performance_evaluation_requests
  FOR SELECT
  USING (evaluator_id = auth.uid());

CREATE POLICY "Admins manage evaluations" ON public.performance_evaluations
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Evaluators view their own evaluations" ON public.performance_evaluations
  FOR SELECT
  USING (evaluator_id = auth.uid());

CREATE POLICY "Evaluators submit their own evaluations" ON public.performance_evaluations
  FOR INSERT
  WITH CHECK (
    evaluator_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.performance_evaluation_requests r
      WHERE r.id = request_id AND r.evaluator_id = auth.uid() AND r.status = 'pending'
    )
  );

-- Submitting an evaluation marks its request as submitted, so a manager's
-- pending list and an admin's status view stay in sync automatically.
CREATE OR REPLACE FUNCTION public.mark_evaluation_request_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.performance_evaluation_requests
  SET status = 'submitted', submitted_at = now()
  WHERE id = NEW.request_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mark_evaluation_request_submitted
AFTER INSERT ON public.performance_evaluations
FOR EACH ROW EXECUTE FUNCTION public.mark_evaluation_request_submitted();
