-- The previous version of apply_late_time_request() set approved_start_time
-- to a synthetic "on time" stamp (office start time, e.g. 09:00:00) whenever
-- a late_adjustment request was approved. Migration 20260916090000 fixed the
-- trigger to use the real clock_in going forward, but rows approved before
-- that change are still frozen at the old synthetic value. Backfill them so
-- "Approved Start Time" reflects the employee's actual clock-in everywhere.
UPDATE public.attendance_logs al
SET approved_start_time = al.clock_in
FROM public.late_time_requests ltr
WHERE ltr.user_id = al.user_id
  AND ltr.effective_date = al.date
  AND ltr.request_type = 'late_adjustment'
  AND ltr.status = 'approved'
  AND al.approved_start_time IS NOT NULL
  AND al.approved_start_time IS DISTINCT FROM al.clock_in;
