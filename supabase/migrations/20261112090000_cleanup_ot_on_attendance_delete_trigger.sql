-- Deleting an attendance session is supposed to also drop any approved
-- manual_time_requests/overtime_requests tied to it (see Attendance.tsx's
-- deleteSession), so Reports doesn't keep counting overtime for a session
-- that no longer exists. But that cleanup is done as a client-side delete,
-- which RLS blocks once the request is approved/modified unless the caller
-- is an approver or admin ("Approvers delete OT/manual time requests").
-- An employee deleting their own session therefore silently fails to clean
-- up their own approved OT, leaving it to keep showing in Reports.
--
-- Move the cleanup into a SECURITY DEFINER trigger on attendance_logs so it
-- always runs, regardless of who deleted the session.
CREATE OR REPLACE FUNCTION public.cleanup_ot_on_attendance_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.manual_time_requests WHERE applied_log_id = OLD.id;

  DELETE FROM public.overtime_requests
  WHERE user_id = OLD.user_id
    AND date = OLD.date
    AND status IN ('approved', 'modified');

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_ot_on_attendance_delete ON public.attendance_logs;
CREATE TRIGGER cleanup_ot_on_attendance_delete
  AFTER DELETE ON public.attendance_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_ot_on_attendance_delete();
