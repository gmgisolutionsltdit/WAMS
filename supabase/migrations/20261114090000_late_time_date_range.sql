-- Office-time-change (and late-adjustment) requests get an optional
-- effective_to, turning them into date/range-scoped requests instead of a
-- permanent schedule change. Previously, approving an office_time_change
-- request for a single date permanently overwrote profiles.office_start_time
-- / office_end_time "going forward" — so one day's approved late arrival
-- silently changed what counted as "late" on every other day, past and
-- future, in every month, since most of the app falls back to the profile's
-- office_start_time when a day has no per-day override. That permanent
-- schedule change is no longer this request type's job (do that directly in
-- Employee Management instead); approving now only ever stamps the
-- attendance_logs rows for the requested date (or date range when
-- effective_to is set), leaving every other date untouched.
ALTER TABLE public.late_time_requests ADD COLUMN IF NOT EXISTS effective_to date;
ALTER TABLE public.late_time_requests
  ADD CONSTRAINT late_time_requests_effective_to_chk
  CHECK (effective_to IS NULL OR effective_to >= effective_date);

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
          _new_start := (_d::timestamp + NEW.requested_start_time) AT TIME ZONE 'UTC';
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
