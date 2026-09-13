-- "Approve Start Time" — a late_time_requests row of type 'late_adjustment'
-- already let an employee ask for their late penalty to be waived, but
-- approving it did nothing: apply_late_time_request only ever handled
-- 'office_time_change'. The waiver was accepted and then silently dropped.
--
-- Approving a late_adjustment now actually reduces that day's penalty and
-- records an approved_start_time: the time that officially counts once an
-- approver has signed off, as opposed to the raw punch in clock_in.

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS approved_start_time timestamptz,
  -- True once a row's late penalty reflects a deliberate decision (recorded
  -- at clock-in, or set by an approval) rather than being an old row that
  -- predates this feature and defaults to 0 by column default alone.
  ADD COLUMN IF NOT EXISTS penalty_reviewed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.attendance_logs.approved_start_time IS
  'Start time that officially counts once approved — equals clock_in until an approved late_adjustment waives the days penalty, at which point it becomes the approved office start time.';
COMMENT ON COLUMN public.attendance_logs.penalty_reviewed IS
  'True when late_minutes/penalty_minutes on this row are authoritative (recorded at clock-in or set by an approval), so the UI does not need to fall back to a live recomputation.';

-- Existing rows already carry today''s office-approved clock_in as their
-- baseline approved time.
UPDATE public.attendance_logs SET approved_start_time = clock_in WHERE approved_start_time IS NULL;

CREATE OR REPLACE FUNCTION public.apply_late_time_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _office_start time;
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF NEW.request_type = 'office_time_change' THEN
      UPDATE public.profiles
      SET office_start_time = COALESCE(NEW.requested_start_time, office_start_time),
          office_end_time = COALESCE(NEW.requested_end_time, office_end_time)
      WHERE id = NEW.user_id;
    ELSIF NEW.request_type = 'late_adjustment' THEN
      SELECT office_start_time INTO _office_start FROM public.profiles WHERE id = NEW.user_id;
      UPDATE public.attendance_logs al
      SET penalty_minutes = GREATEST(0, al.penalty_minutes - COALESCE(NEW.adjustment_minutes, 0)),
          penalty_reviewed = true,
          approved_start_time = CASE
            WHEN GREATEST(0, al.penalty_minutes - COALESCE(NEW.adjustment_minutes, 0)) = 0
              THEN (al.date + COALESCE(_office_start, '09:00'::time))::timestamptz
            ELSE al.clock_in
          END
      WHERE al.user_id = NEW.user_id AND al.date = NEW.effective_date;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
