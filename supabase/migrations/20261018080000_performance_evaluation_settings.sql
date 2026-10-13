-- Admin-editable settings for future Performance Evaluations: the default
-- per-criterion score, the average-score thresholds that resolve to each
-- Section 6 Performance Category, and the Section 3 salary-range bands used
-- to pick an employee's A/B/C category. Single row (id always 'default'),
-- readable by everyone (every evaluator needs it to score/categorize a
-- form), editable only by admins. Existing evaluations/finalizations are
-- unaffected — only future ones read this row.
CREATE TABLE public.performance_evaluation_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  default_score integer NOT NULL DEFAULT 2 CHECK (default_score BETWEEN 1 AND 4),
  threshold_outstanding numeric NOT NULL DEFAULT 3.6,
  threshold_above numeric NOT NULL DEFAULT 2.8,
  threshold_meet numeric NOT NULL DEFAULT 2.0,
  salary_band_b_min numeric NOT NULL DEFAULT 20000,
  salary_band_a_min numeric NOT NULL DEFAULT 40000,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.performance_evaluation_settings (id) VALUES ('default');

GRANT SELECT ON public.performance_evaluation_settings TO authenticated;
GRANT UPDATE ON public.performance_evaluation_settings TO authenticated;
ALTER TABLE public.performance_evaluation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone reads performance evaluation settings"
  ON public.performance_evaluation_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins update performance evaluation settings"
  ON public.performance_evaluation_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_performance_evaluation_settings_updated BEFORE UPDATE ON public.performance_evaluation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
