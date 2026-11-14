-- PR #329 rebuilt apply_late_time_request() for date-range support but
-- accidentally copied from the pre-20260917130000 version, which built the
-- approved start time with `AT TIME ZONE 'UTC'` instead of 'Asia/Dhaka' —
-- reintroducing the exact 6-hour-off bug that migration already fixed
-- (10:30 local got stored as 10:30 UTC, rendered as 16:30/4:30pm locally).
CREATE OR REPLACE FUNCTION public.apply_late_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d date;
  _range_end date;
  _new_start timestamptz;
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    _range_end := COALESCE(NEW.effective_to, NEW.effective_date);
    IF NEW.request_type = 'office_time_change' THEN
      IF NEW.requested_start_time IS NOT NULL THEN
        FOR _d IN SELECT generate_series(NEW.effective_date, _range_end, '1 day'::interval)::date LOOP
          _new_start := (_d::timestamp + NEW.requested_start_time) AT TIME ZONE 'Asia/Dhaka';
          UPDATE public.attendance_logs al
          SET approved_start_time = _new_start,
              late_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (al.clock_in - _new_start)) / 60)),
              penalty_minutes = CASE WHEN al.clock_in <= _new_start + INTERVAL '11 minutes' THEN 0 ELSE 160 END,
              penalty_reviewed = true
          WHERE al.user_id = NEW.user_id AND al.date = _d AND al.clock_in IS NOT NULL;
        END LOOP;
      END IF;
    ELSIF NEW.request_type = 'late_adjustment' THEN
      FOR _d IN SELECT generate_series(NEW.effective_date, _range_end, '1 day'::interval)::date LOOP
        UPDATE public.attendance_logs al
        SET penalty_minutes = GREATEST(0, al.penalty_minutes - COALESCE(NEW.adjustment_minutes, 0)),
            late_minutes = CASE
              WHEN GREATEST(0, al.penalty_minutes - COALESCE(NEW.adjustment_minutes, 0)) = 0 THEN 0
              ELSE al.late_minutes
            END,
            penalty_reviewed = true,
            approved_start_time = al.clock_in
        WHERE al.user_id = NEW.user_id AND al.date = _d;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Re-run the backfill with the corrected timezone for any office_time_change
-- request already approved (and mis-stamped 6 hours off) under PR #329.
DO $$
DECLARE
  r record;
  _d date;
  _range_end date;
  _new_start timestamptz;
BEGIN
  FOR r IN
    SELECT * FROM public.late_time_requests
    WHERE request_type = 'office_time_change' AND status = 'approved' AND requested_start_time IS NOT NULL
  LOOP
    _range_end := COALESCE(r.effective_to, r.effective_date);
    FOR _d IN SELECT generate_series(r.effective_date, _range_end, '1 day'::interval)::date LOOP
      _new_start := (_d::timestamp + r.requested_start_time) AT TIME ZONE 'Asia/Dhaka';
      UPDATE public.attendance_logs al
      SET approved_start_time = _new_start,
          late_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (al.clock_in - _new_start)) / 60)),
          penalty_minutes = CASE WHEN al.clock_in <= _new_start + INTERVAL '11 minutes' THEN 0 ELSE 160 END,
          penalty_reviewed = true
      WHERE al.user_id = r.user_id AND al.date = _d AND al.clock_in IS NOT NULL;
    END LOOP;
  END LOOP;
END $$;
