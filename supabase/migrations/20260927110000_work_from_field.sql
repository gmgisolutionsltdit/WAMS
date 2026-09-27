-- "Work From" (Office/Home/Field) captured on clock-in and on manual time
-- entries, and carried through to the attendance log so it shows up in
-- attendance history.
ALTER TABLE public.attendance_logs ADD COLUMN IF NOT EXISTS work_from text;
ALTER TABLE public.manual_time_requests ADD COLUMN IF NOT EXISTS work_from text;

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
    INSERT INTO public.attendance_logs (user_id, date, clock_in, clock_out, total_hours, overtime_hours, break_minutes, device_source, work_from)
    VALUES (NEW.user_id, NEW.date, NEW.clock_in, NEW.clock_out, NEW.total_hours, NEW.overtime_hours, NEW.break_minutes, 'manual', NEW.work_from)
    RETURNING id INTO _log_id;
    NEW.applied_log_id := _log_id;
  END IF;
  RETURN NEW;
END;
$$;
