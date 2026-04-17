CREATE TABLE public.daily_work_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dev Allow All on daily_work_logs"
ON public.daily_work_logs FOR ALL
TO anon, authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Users can insert their own work logs"
ON public.daily_work_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own work logs"
ON public.daily_work_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own work logs"
ON public.daily_work_logs FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all work logs"
ON public.daily_work_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Managers can view team work logs"
ON public.daily_work_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'manager'::app_role) AND is_manager_of(auth.uid(), user_id));

CREATE TRIGGER update_daily_work_logs_updated_at
BEFORE UPDATE ON public.daily_work_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_daily_work_logs_user_date ON public.daily_work_logs(user_id, log_date DESC);