
-- Temporary dev policies for attendance_logs
DROP POLICY IF EXISTS "Dev Allow All on attendance_logs" ON public.attendance_logs;
CREATE POLICY "Dev Allow All on attendance_logs" ON public.attendance_logs
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Temporary dev policies for overtime_requests
DROP POLICY IF EXISTS "Dev Allow All on overtime_requests" ON public.overtime_requests;
CREATE POLICY "Dev Allow All on overtime_requests" ON public.overtime_requests
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Temporary dev policies for profiles
DROP POLICY IF EXISTS "Dev Allow All on profiles" ON public.profiles;
CREATE POLICY "Dev Allow All on profiles" ON public.profiles
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Temporary dev policies for settings
DROP POLICY IF EXISTS "Dev Allow All on settings" ON public.settings;
CREATE POLICY "Dev Allow All on settings" ON public.settings
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Temporary dev policies for user_roles
DROP POLICY IF EXISTS "Dev Allow All on user_roles" ON public.user_roles;
CREATE POLICY "Dev Allow All on user_roles" ON public.user_roles
FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
