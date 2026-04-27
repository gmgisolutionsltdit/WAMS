-- 1) SECURITY DEFINER helpers to read current user's wing/department without invoking RLS
CREATE OR REPLACE FUNCTION public.current_user_wing()
RETURNS public.company_wing
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_wing FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department FROM public.profiles WHERE id = auth.uid()
$$;

-- 2) Drop the recursive policy and recreate it using the SECURITY DEFINER functions
DROP POLICY IF EXISTS "Employees view same wing and department" ON public.profiles;

CREATE POLICY "Employees view same wing and department"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  department IS NOT NULL
  AND department = public.current_user_department()
  AND company_wing = public.current_user_wing()
);

-- 3) Ensure realtime delivers full row data and enable publication for relevant tables
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.leave_requests REPLICA IDENTITY FULL;
ALTER TABLE public.leave_balances REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leave_requests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leave_balances'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_balances';
  END IF;
END $$;