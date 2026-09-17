-- The previous fix built the requested office start time as a naive
-- timestamp and labeled it UTC, but requested_start_time is a local
-- wall-clock time (Asia/Dhaka, this org's timezone) - so 10:00 was stored
-- as 10:00 UTC and rendered as 16:00 (4pm) in the browser's local time.
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
        _new_start := (NEW.effective_date::timestamp + NEW.requested_start_time) AT TIME ZONE 'Asia/Dhaka';
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

-- Re-run the backfill with the corrected timezone for any office_time_change
-- request already approved (and mis-stamped 6 hours off) before this fix.
DO $$
DECLARE
  r record;
  _new_start timestamptz;
BEGIN
  FOR r IN
    SELECT * FROM public.late_time_requests
    WHERE request_type = 'office_time_change' AND status = 'approved' AND requested_start_time IS NOT NULL
  LOOP
    _new_start := (r.effective_date::timestamp + r.requested_start_time) AT TIME ZONE 'Asia/Dhaka';
    UPDATE public.attendance_logs al
    SET approved_start_time = _new_start,
        late_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (al.clock_in - _new_start)) / 60)),
        penalty_minutes = CASE WHEN al.clock_in <= _new_start + INTERVAL '11 minutes' THEN 0 ELSE 160 END,
        penalty_reviewed = true
    WHERE al.user_id = r.user_id AND al.date = r.effective_date AND al.clock_in IS NOT NULL;
  END LOOP;
END $$;
