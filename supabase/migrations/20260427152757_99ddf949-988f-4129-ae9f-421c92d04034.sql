-- Enable realtime + REPLICA IDENTITY FULL for the tables our hooks subscribe to
ALTER TABLE public.attendance_logs REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
ALTER TABLE public.daily_work_logs REPLICA IDENTITY FULL;
ALTER TABLE public.leave_requests REPLICA IDENTITY FULL;
ALTER TABLE public.leave_balances REPLICA IDENTITY FULL;
ALTER TABLE public.leave_types REPLICA IDENTITY FULL;
ALTER TABLE public.holidays REPLICA IDENTITY FULL;
ALTER TABLE public.settings REPLICA IDENTITY FULL;
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.project_members REPLICA IDENTITY FULL;
ALTER TABLE public.task_boards REPLICA IDENTITY FULL;
ALTER TABLE public.task_columns REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.task_comments REPLICA IDENTITY FULL;
ALTER TABLE public.task_activity REPLICA IDENTITY FULL;
ALTER TABLE public.task_watchers REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance_logs','profiles','user_roles','daily_work_logs',
    'leave_requests','leave_balances','leave_types','holidays','settings',
    'projects','project_members','task_boards','task_columns',
    'tasks','task_comments','task_activity','task_watchers'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END$$;