-- Clarify that standard_daily_hours is the office *window*, with the unpaid
-- break sitting inside it. The default 8h window at a 09:00 start therefore
-- ends at 17:00 and holds 7h of net work, not 8h plus the break.

COMMENT ON COLUMN public.profiles.standard_daily_hours IS
  'Length of the office window in hours, unpaid break included. Net work required is this less unpaid_break_minutes.';
COMMENT ON COLUMN public.profiles.unpaid_break_minutes IS
  'Unpaid break taken inside the office window; deducted from worked hours and from the daily requirement.';
