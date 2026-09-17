-- 1. GMGI / GM task-time split for manual entries, mirrored onto
-- attendance_logs so My Attendance History can show a GMGI Time and GM Time
-- column per day. total time (gmgi_time + gm_time) must stay <= the entry's
-- worked duration; that check is enforced client-side (the UI computes it
-- live), not here, since the columns are optional free-form bookkeeping.
ALTER TABLE public.manual_time_requests
  ADD COLUMN IF NOT EXISTS gmgi_task text,
  ADD COLUMN IF NOT EXISTS gm_task text,
  ADD COLUMN IF NOT EXISTS gmgi_time numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gm_time numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS gmgi_task text,
  ADD COLUMN IF NOT EXISTS gm_task text,
  ADD COLUMN IF NOT EXISTS gmgi_time numeric(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gm_time numeric(6,2) NOT NULL DEFAULT 0;

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
      device_source, gmgi_task, gm_task, gmgi_time, gm_time
    )
    VALUES (
      NEW.user_id, NEW.date, NEW.clock_in, NEW.clock_out, NEW.total_hours, NEW.overtime_hours, NEW.break_minutes,
      'manual', NEW.gmgi_task, NEW.gm_task, COALESCE(NEW.gmgi_time, 0), COALESCE(NEW.gm_time, 0)
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

-- 2. Once a late_adjustment request fully waives the penalty (adjustment
-- covers the whole stored penalty_minutes), the recorded late_minutes should
-- clear too - otherwise the Status column keeps showing "Late Xm" and Due
-- Time keeps counting minutes for an arrival that was already excused.
CREATE OR REPLACE FUNCTION public.apply_late_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _remaining_penalty numeric;
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF NEW.request_type = 'office_time_change' THEN
      UPDATE public.profiles
      SET office_start_time = COALESCE(NEW.requested_start_time, office_start_time),
          office_end_time = COALESCE(NEW.requested_end_time, office_end_time)
      WHERE id = NEW.user_id;
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

-- 3. Office-time-change effective date window: from today through 2 days
-- ahead (inclusive), not "at least 1 day ahead with no upper bound".
CREATE OR REPLACE FUNCTION public.enforce_office_time_lead_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.request_type = 'office_time_change'
     AND (NEW.effective_date < CURRENT_DATE OR NEW.effective_date > CURRENT_DATE + INTERVAL '2 days') THEN
    RAISE EXCEPTION 'Office time change requests must be effective within the next 2 days.';
  END IF;
  RETURN NEW;
END;
$$;
