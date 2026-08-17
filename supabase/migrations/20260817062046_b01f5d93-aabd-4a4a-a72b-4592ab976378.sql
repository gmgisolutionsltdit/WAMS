DROP VIEW IF EXISTS public.team_leave_calendar;

CREATE OR REPLACE FUNCTION public.get_team_leave_calendar()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  leave_type_id uuid,
  start_date date,
  end_date date,
  day_type leave_day_type,
  total_days numeric,
  status leave_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lr.id, lr.user_id, lr.leave_type_id, lr.start_date, lr.end_date,
         lr.day_type, lr.total_days, lr.status
  FROM public.leave_requests lr
  JOIN public.profiles p ON p.id = lr.user_id
  WHERE auth.uid() IS NOT NULL
    AND lr.status = 'approved'::leave_status
    AND p.department IS NOT NULL
    AND p.department = public.current_user_department()
    AND p.company_wing = public.current_user_wing();
$$;

REVOKE ALL ON FUNCTION public.get_team_leave_calendar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leave_calendar() TO authenticated;