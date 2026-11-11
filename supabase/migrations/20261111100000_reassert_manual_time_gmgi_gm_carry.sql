-- Re-assert apply_manual_time_request() exactly as fixed in
-- 20261005060000_fix_manual_time_gmgi_gm_carry.sql. A user reported the
-- GMGI/GM task TEXT still not showing up in attendance_logs after a fresh,
-- controlled test (time carried correctly, task text did not) — pure DDL,
-- no data touched, just guarantees the function in the database matches
-- what's in this repo.
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
    INSERT INTO public.attendance_logs (
      user_id, date, clock_in, clock_out, total_hours, overtime_hours, break_minutes,
      device_source, work_from, gmgi_task, gm_task, gmgi_time, gm_time
    )
    VALUES (
      NEW.user_id, NEW.date, NEW.clock_in, NEW.clock_out, NEW.total_hours, NEW.overtime_hours, NEW.break_minutes,
      'manual', NEW.work_from, NEW.gmgi_task, NEW.gm_task, COALESCE(NEW.gmgi_time, 0), COALESCE(NEW.gm_time, 0)
    )
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
