-- Lets the evaluator who submitted a performance evaluation edit their own
-- answers afterward (new "Edit" option alongside "View Answers"). Admins
-- could already edit any evaluation via their existing FOR ALL policy.
CREATE POLICY "Evaluators update their own evaluations" ON public.performance_evaluations
  FOR UPDATE TO authenticated
  USING (evaluator_id = auth.uid())
  WITH CHECK (evaluator_id = auth.uid());
