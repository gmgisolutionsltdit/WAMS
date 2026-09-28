-- "Work From" becomes multi-selectable (e.g. Office + Field on a split
-- day), so it moves from a single text value to a text array on both
-- attendance_logs and manual_time_requests. Existing single values are
-- preserved as one-element arrays.

ALTER TABLE public.attendance_logs ALTER COLUMN work_from DROP DEFAULT;
ALTER TABLE public.attendance_logs
  ALTER COLUMN work_from TYPE text[] USING (CASE WHEN work_from IS NULL THEN NULL ELSE ARRAY[work_from] END);

ALTER TABLE public.manual_time_requests ALTER COLUMN work_from DROP DEFAULT;
ALTER TABLE public.manual_time_requests
  ALTER COLUMN work_from TYPE text[] USING (CASE WHEN work_from IS NULL THEN NULL ELSE ARRAY[work_from] END);

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
