-- An approved office-time-change permanently updates profiles.office_start_time
-- going forward, but Approved Start Time in My Attendance History must only
-- reflect that change for the day it was actually requested for - not every
-- other day (past or future) that happens to render while the profile now
-- carries the new value. Mirror the late_adjustment approach: stamp the
-- specific effective_date's attendance_logs row with the new approved start
-- time and re-judge that day's lateness against it, leaving every other
-- day's Approved Start Time to keep falling back to the org's Settings
-- default (handled client-side).
CREATE OR REPLACE FUNCTION public.apply_late_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_start timestamptz;
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF NEW.request_type = 'office_time_change' THEN
      UPDATE public.profiles
      SET office_start_time = COALESCE(NEW.requested_start_time, office_start_time),
          office_end_time = COALESCE(NEW.requested_end_time, office_end_time)
      WHERE id = NEW.user_id;

      IF NEW.requested_start_time IS NOT NULL THEN
        _new_start := (NEW.effective_date::timestamp + NEW.requested_start_time) AT TIME ZONE 'UTC';
        UPDATE public.attendance_logs al
        SET approved_start_time = _new_start,
            late_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (al.clock_in - _new_start)) / 60)),
            penalty_minutes = CASE WHEN al.clock_in <= _new_start + INTERVAL '11 minutes' THEN 0 ELSE 160 END,
            penalty_reviewed = true
        WHERE al.user_id = NEW.user_id AND al.date = NEW.effective_date AND al.clock_in IS NOT NULL;
      END IF;
    ELSIF NEW.request_type = 'late_adjustment' THEN
      UPDATE public.attendance_logs al
      SET penalty_minutes = GREATEST(0, al.penalty_minutes - COALESCE(NEW.adjustment_minutes, 0)),
          late_minutes = CASE
            WHEN GREATEST(0, al.penalty_minutes - COALESCE(NEW.adjustment_minutes, 0)) = 0 THEN 0
            ELSE al.late_minutes
          END,
          penalty_reviewed = true,
          approved_start_time = al.clock_in
      WHERE al.user_id = NEW.user_id AND al.date = NEW.effective_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: apply the new logic retroactively to office_time_change requests
-- that were already approved before this fix, so an already-approved day
-- (e.g. one requested with a specific effective_date) shows its approved
-- start time immediately rather than only for the next approval going forward.
DO $$
DECLARE
  r record;
  _new_start timestamptz;
BEGIN
  FOR r IN
    SELECT * FROM public.late_time_requests
    WHERE request_type = 'office_time_change' AND status = 'approved' AND requested_start_time IS NOT NULL
  LOOP
    _new_start := (r.effective_date::timestamp + r.requested_start_time) AT TIME ZONE 'UTC';
    UPDATE public.attendance_logs al
    SET approved_start_time = _new_start,
        late_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (al.clock_in - _new_start)) / 60)),
        penalty_minutes = CASE WHEN al.clock_in <= _new_start + INTERVAL '11 minutes' THEN 0 ELSE 160 END,
        penalty_reviewed = true
    WHERE al.user_id = r.user_id AND al.date = r.effective_date AND al.clock_in IS NOT NULL;
  END LOOP;
END $$;
