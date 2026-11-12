-- One-time backfill: the AFTER DELETE trigger added in
-- 20261112090000_cleanup_ot_on_attendance_delete_trigger.sql only cleans up
-- manual_time_requests going forward. Any manual_time_request whose
-- applied_log_id already points at an attendance_logs row that no longer
-- exists is a leftover from an attendance-session delete that happened
-- before that trigger existed (previously blocked by RLS for a
-- non-approver deleting their own session) — remove those now so Reports
-- stops counting their overtime.
DELETE FROM public.manual_time_requests mtr
WHERE mtr.applied_log_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.attendance_logs al WHERE al.id = mtr.applied_log_id
  );
