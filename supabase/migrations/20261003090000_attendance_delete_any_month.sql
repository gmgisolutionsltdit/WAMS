-- My Attendance History's per-session Delete button now shows for every
-- session regardless of age, not just the last 48 hours. Replace the
-- 48-hour-scoped employee delete policy (20260918090000) with one that
-- drops the date restriction — still own sessions only, still a real
-- permanent delete (nothing stored is ever overwritten in place, this is
-- the row simply going away, same as before within the 48h window).
DROP POLICY IF EXISTS "Users delete own recent attendance" ON public.attendance_logs;

CREATE POLICY "Users delete own attendance"
  ON public.attendance_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
