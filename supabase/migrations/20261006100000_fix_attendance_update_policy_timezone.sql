-- "Users update own attendance for today" compared the row's date column
-- (recorded in Asia/Dhaka wall-clock terms, same as the client's localToday())
-- against CURRENT_DATE, which Postgres evaluates in the database server's
-- own timezone (UTC here) — not Asia/Dhaka. For roughly six hours every day
-- (00:00-06:00 Dhaka time, while UTC's calendar date is still "yesterday"),
-- this silently blocked every update to today's own attendance row: Resume,
-- Break, and Close all appeared to do nothing, since Postgrest reports an
-- RLS-blocked UPDATE as zero rows affected with no error, so the screen just
-- kept showing stale "still on break" data.
DROP POLICY IF EXISTS "Users update own attendance for today" ON public.attendance_logs;

CREATE POLICY "Users update own attendance for today"
  ON public.attendance_logs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND date = (now() AT TIME ZONE 'Asia/Dhaka')::date)
  WITH CHECK (auth.uid() = user_id AND date = (now() AT TIME ZONE 'Asia/Dhaka')::date);
