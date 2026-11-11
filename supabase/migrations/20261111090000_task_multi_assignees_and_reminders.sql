-- Trello-style multiple Members per card, plus actually sending the "Set
-- due date reminder" notification that TaskDatesPopover already collects
-- but never acted on.

-- 1. Multiple assignees per task -------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON public.task_assignees(user_id);

GRANT SELECT, INSERT, DELETE ON public.task_assignees TO authenticated;
GRANT ALL ON public.task_assignees TO service_role;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_task_assignee(_user_id uuid, _task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees WHERE task_id = _task_id AND user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Members view task assignees" ON public.task_assignees;
CREATE POLICY "Members view task assignees" ON public.task_assignees FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND (public.can_view_project(auth.uid(), t.project_id) OR t.assignee_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Members manage task assignees" ON public.task_assignees;
CREATE POLICY "Members manage task assignees" ON public.task_assignees FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND (public.can_edit_project(auth.uid(), t.project_id) OR t.assignee_id = auth.uid())
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND (public.can_edit_project(auth.uid(), t.project_id) OR t.assignee_id = auth.uid())
  )
);

-- Backfill: today's single assignee becomes the first multi-assignee row.
INSERT INTO public.task_assignees (task_id, user_id)
SELECT id, assignee_id FROM public.tasks WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- A task's visibility/edit grant must now also extend to every one of its
-- multiple assignees, not just the legacy single assignee_id column.
DROP POLICY IF EXISTS "Members view tasks" ON public.tasks;
CREATE POLICY "Members view tasks" ON public.tasks FOR SELECT TO authenticated
  USING (
    public.can_view_project(auth.uid(), project_id)
    OR assignee_id = auth.uid()
    OR public.is_task_assignee(auth.uid(), id)
  );

DROP POLICY IF EXISTS "Members update tasks" ON public.tasks;
CREATE POLICY "Members update tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (
    public.can_edit_project(auth.uid(), project_id)
    OR assignee_id = auth.uid()
    OR public.is_task_assignee(auth.uid(), id)
  );

-- 2. Actually send the due-date reminder ------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.send_task_reminders()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t RECORD;
  offset_interval interval;
  reminder_at timestamptz;
  recipient uuid;
  recipient_count int;
BEGIN
  FOR t IN
    SELECT id, title, due_date, reminder, assignee_id, project_id
    FROM public.tasks
    WHERE due_date IS NOT NULL
      AND reminder IS NOT NULL
      AND reminder <> 'none'
      AND reminder_sent_at IS NULL
      AND archived = false
  LOOP
    offset_interval := CASE t.reminder
      WHEN 'at_time' THEN interval '0'
      WHEN '5_min_before' THEN interval '5 minutes'
      WHEN '10_min_before' THEN interval '10 minutes'
      WHEN '15_min_before' THEN interval '15 minutes'
      WHEN '1_hour_before' THEN interval '1 hour'
      WHEN '2_hours_before' THEN interval '2 hours'
      WHEN '3_hours_before' THEN interval '3 hours'
      WHEN '4_hours_before' THEN interval '4 hours'
      WHEN '5_hours_before' THEN interval '5 hours'
      WHEN '1_day_before' THEN interval '1 day'
      WHEN '2_days_before' THEN interval '2 days'
      WHEN '1_week_before' THEN interval '7 days'
      WHEN '2_weeks_before' THEN interval '14 days'
      ELSE NULL
    END;

    IF offset_interval IS NULL THEN
      CONTINUE;
    END IF;

    reminder_at := t.due_date - offset_interval;
    IF reminder_at > now() THEN
      CONTINUE;
    END IF;

    recipient_count := 0;
    FOR recipient IN
      SELECT user_id FROM public.task_assignees WHERE task_id = t.id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, related_id, route)
      VALUES (
        recipient,
        'task_reminder',
        'Task due soon',
        format('"%s" is due %s', t.title, to_char(t.due_date, 'Mon DD, YYYY HH12:MI AM')),
        t.id,
        '/tasks/' || t.project_id
      );
      recipient_count := recipient_count + 1;
    END LOOP;

    -- No multi-assignee rows yet (legacy single-assignee task) — fall back
    -- to assignee_id so the reminder still reaches someone.
    IF recipient_count = 0 AND t.assignee_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, related_id, route)
      VALUES (
        t.assignee_id,
        'task_reminder',
        'Task due soon',
        format('"%s" is due %s', t.title, to_char(t.due_date, 'Mon DD, YYYY HH12:MI AM')),
        t.id,
        '/tasks/' || t.project_id
      );
    END IF;

    UPDATE public.tasks SET reminder_sent_at = now() WHERE id = t.id;
  END LOOP;
END;
$$;

-- Try to enable pg_cron so the function above actually runs on a schedule.
-- Some hosting tiers don't permit this from a migration — never let that
-- fail the whole deploy; it just means reminders need pg_cron turned on
-- from the Supabase dashboard (Database > Extensions) instead.
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'pg_cron could not be enabled from this migration — enable it from the Supabase dashboard to start sending task reminders.';
END $$;

-- Run every 5 minutes. Re-running this migration must not create a second
-- schedule for the same job name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-task-reminders';
    PERFORM cron.schedule('send-task-reminders', '*/5 * * * *', 'SELECT public.send_task_reminders();');
  END IF;
END $$;
