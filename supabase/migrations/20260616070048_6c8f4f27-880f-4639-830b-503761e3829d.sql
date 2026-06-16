
-- 1) Fix notifications INSERT policy
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'hr'::public.app_role)
);

-- 2) Drop overly broad coworker profile visibility to prevent salary exposure.
-- Admins / payroll roles / managers / self still retain access via their existing policies.
DROP POLICY IF EXISTS "Employees view same wing and department" ON public.profiles;

-- 3) Remove sensitive tables from realtime publication so changes are not broadcast
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_roles') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.user_roles';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='payroll_records') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.payroll_records';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='payroll_incentives') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.payroll_incentives';
  END IF;
END $$;
