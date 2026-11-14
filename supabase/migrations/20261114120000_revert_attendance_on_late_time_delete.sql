-- Admin deleting an approved late_time_requests row (Approvals > delete)
-- only removed the request itself — the approved_start_time/late_minutes/
-- penalty_minutes it had stamped onto attendance_logs when approved was
-- never reverted, so My Attendance kept showing the stale approved time
-- forever even after the admin "removed" it. apply_late_time_request()
-- only ever ran on UPDATE (approval); there was no DELETE-side cleanup.
--
-- This resets the affected attendance_logs rows back to their un-reviewed,
-- live-computed state (penalty_reviewed = false, same as a row that was
-- never touched by a late time approval) for every date the deleted
-- request covered, whenever that request was approved.
CREATE OR REPLACE FUNCTION public.revert_late_time_request_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d date;
  _range_end date;
BEGIN
  IF OLD.status = 'approved' THEN
    _range_end := COALESCE(OLD.effective_to, OLD.effective_date);
    FOR _d IN SELECT generate_series(OLD.effective_date, _range_end, '1 day'::interval)::date LOOP
      UPDATE public.attendance_logs
      SET approved_start_time = NULL,
          late_minutes = 0,
          penalty_minutes = 0,
          penalty_reviewed = false
      WHERE user_id = OLD.user_id AND date = _d;
    END LOOP;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_revert_late_time_request_on_delete ON public.late_time_requests;
CREATE TRIGGER trg_revert_late_time_request_on_delete
  AFTER DELETE ON public.late_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.revert_late_time_request_on_delete();

-- One-time backfill for stamps already orphaned before this trigger
-- existed. penalty_reviewed = true by itself can't be used to find them —
-- it's the normal state clock-in already sets on every row, not a sign a
-- late time request was ever involved. approved_start_time alone isn't
-- reliable either: a 2026-09-13 migration one-time-backfilled it to equal
-- clock_in on every pre-existing row regardless of any request, so a value
-- merely being non-null includes that legacy noise. approved_start_time
-- actually DIFFERING from clock_in is the real signal — clock-in itself
-- never sets a differing value, only an approved late_time_requests row
-- ever moves it away from the raw punch. A row still backed by a
-- currently-approved request covering that date is left alone — only ones
-- with no such request left (deleted since) are reset.
UPDATE public.attendance_logs al
SET approved_start_time = NULL,
    late_minutes = 0,
    penalty_minutes = 0,
    penalty_reviewed = false
WHERE al.approved_start_time IS DISTINCT FROM al.clock_in
  AND NOT EXISTS (
    SELECT 1 FROM public.late_time_requests ltr
    WHERE ltr.user_id = al.user_id
      AND ltr.status = 'approved'
      AND ltr.effective_date <= al.date
      AND COALESCE(ltr.effective_to, ltr.effective_date) >= al.date
  );
