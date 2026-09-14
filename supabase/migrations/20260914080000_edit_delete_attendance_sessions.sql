-- Editing a session from My Attendance History previously had no way to
-- replace the row being corrected: a manual time request always inserted a
-- brand-new attendance_logs row, so "editing" a wrong punch left the wrong
-- one in place and added a second, correct one next to it.
--
-- supersedes_log_id lets an edit name the row it is replacing. On approval,
-- apply_manual_time_request deletes that row (scoped to the same user, so a
-- stale or forged id can never delete someone else's data) after inserting
-- the corrected one.

ALTER TABLE public.manual_time_requests
  ADD COLUMN IF NOT EXISTS supersedes_log_id uuid REFERENCES public.attendance_logs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.manual_time_requests.supersedes_log_id IS
  'attendance_logs row this correction replaces, deleted once the correction is applied.';

CREATE OR REPLACE FUNCTION public.apply_manual_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_id uuid;
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' AND NEW.applied_log_id IS NULL THEN
    INSERT INTO public.attendance_logs (user_id, date, clock_in, clock_out, total_hours, overtime_hours, break_minutes, device_source)
    VALUES (NEW.user_id, NEW.date, NEW.clock_in, NEW.clock_out, NEW.total_hours, NEW.overtime_hours, NEW.break_minutes, 'manual')
    RETURNING id INTO _log_id;
    NEW.applied_log_id := _log_id;

    IF NEW.supersedes_log_id IS NOT NULL THEN
      DELETE FROM public.attendance_logs
      WHERE id = NEW.supersedes_log_id AND user_id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
