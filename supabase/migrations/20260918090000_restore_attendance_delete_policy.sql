-- Migration 20260823055611 dropped "Users can delete their own attendance"
-- (as part of restricting UPDATE to today's date only) but never restored a
-- DELETE policy for employees at all - only the admin-only "Admins can
-- manage all attendance" FOR ALL policy remained. Since My Attendance
-- History's per-session Delete button is shown to every employee, a
-- non-admin's delete call was silently blocked by RLS (no matching row to
-- delete, no error surfaced), even though the UI implied it worked.
--
-- Restore employee deletion, scoped to the same 48-hour retroactive window
-- already used for manual time entries and OT requests, so a person can
-- correct a recent mistake but not rewrite older history (that stays admin
-- or approval-only).
CREATE POLICY "Users delete own recent attendance"
  ON public.attendance_logs FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND date >= (CURRENT_DATE - INTERVAL '2 days'));
