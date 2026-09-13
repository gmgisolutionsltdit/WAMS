-- Late-arrival penalty was only ever recomputed at render time (in the
-- Attendance page, from the employee's *current* office-time settings), so
-- nothing was ever actually recorded at the moment of a late clock-in, and
-- no one was notified. Persist it as a fact of that day's record instead.

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS late_minutes numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_minutes numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.attendance_logs.late_minutes IS
  'Minutes past the approved office start time (grace period excluded), recorded at clock-in.';
COMMENT ON COLUMN public.attendance_logs.penalty_minutes IS
  'Extra work minutes owed for a late arrival, fixed at clock-in time so later office-time changes do not rewrite history.';
