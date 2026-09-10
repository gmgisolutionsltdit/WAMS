-- Per-employee work schedule.
--
-- Some staff work a 9-hour day instead of the default 8, and some work a 6-day
-- week instead of the standard 5. The unpaid break is stored explicitly so the
-- worked-hours / overtime maths stops assuming a hard-coded 8-hour day.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS standard_daily_hours numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS unpaid_break_minutes integer NOT NULL DEFAULT 60,
  -- Weekday numbers the employee works, 0 = Sunday. Default is Sunday-Thursday.
  ADD COLUMN IF NOT EXISTS working_days smallint[] NOT NULL DEFAULT '{0,1,2,3,4}';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_standard_daily_hours_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_standard_daily_hours_check
  CHECK (standard_daily_hours > 0 AND standard_daily_hours <= 24);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_unpaid_break_minutes_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_unpaid_break_minutes_check
  CHECK (unpaid_break_minutes >= 0 AND unpaid_break_minutes < 480);

COMMENT ON COLUMN public.profiles.standard_daily_hours IS
  'Net hours of work required per day, excluding the unpaid break.';
COMMENT ON COLUMN public.profiles.unpaid_break_minutes IS
  'Unpaid break sitting inside the office window; deducted before overtime.';
COMMENT ON COLUMN public.profiles.working_days IS
  'Weekday numbers the employee is scheduled to work, 0 = Sunday.';
