
-- ============================================
-- PHASE 1: WIPE EXISTING DATA
-- ============================================
-- Temporarily disable safety triggers for the wipe
ALTER TABLE public.profiles DISABLE TRIGGER block_admin_profile_delete;
ALTER TABLE public.profiles DISABLE TRIGGER block_unfiltered_profile_delete;

DELETE FROM public.daily_work_logs WHERE true;
DELETE FROM public.attendance_logs WHERE true;
DELETE FROM public.overtime_requests WHERE true;
DELETE FROM public.notifications WHERE true;
DELETE FROM public.user_roles WHERE true;
DELETE FROM public.profiles WHERE true;

ALTER TABLE public.profiles ENABLE TRIGGER block_admin_profile_delete;
ALTER TABLE public.profiles ENABLE TRIGGER block_unfiltered_profile_delete;

-- ============================================
-- NEW ENUMS
-- ============================================
DO $$ BEGIN
  CREATE TYPE public.company_wing AS ENUM ('GMGI', 'MORU');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_status AS ENUM ('Permanent', 'Contractual', 'Intern', 'Short-Term', 'Consultant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.employee_status AS ENUM ('Active', 'Inactive', 'Resigned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- EXPAND PROFILES TABLE
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS company_wing public.company_wing NOT NULL DEFAULT 'GMGI',
  ADD COLUMN IF NOT EXISTS service_status public.service_status NOT NULL DEFAULT 'Permanent',
  ADD COLUMN IF NOT EXISTS employee_status public.employee_status NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS promotion_date DATE,
  ADD COLUMN IF NOT EXISTS resign_date DATE,
  ADD COLUMN IF NOT EXISTS daily_ot_cap NUMERIC NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS monthly_ot_cap NUMERIC NOT NULL DEFAULT 40;

-- ============================================
-- EXPAND SETTINGS TABLE
-- ============================================
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS weekend_days INTEGER[] NOT NULL DEFAULT ARRAY[5,6], -- Fri, Sat (ISO: 0=Sun..6=Sat)
  ADD COLUMN IF NOT EXISTS office_start_time TIME NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS office_end_time TIME NOT NULL DEFAULT '17:00';

-- ============================================
-- NEW HOLIDAYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  wing public.company_wing, -- NULL = applies to both wings
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(holiday_date);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- HELPER: MULTI-LEVEL MANAGEMENT CHAIN
-- ============================================
CREATE OR REPLACE FUNCTION public.is_in_management_chain(_manager_id UUID, _employee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current UUID := _employee_id;
  _next UUID;
  _depth INT := 0;
BEGIN
  WHILE _current IS NOT NULL AND _depth < 10 LOOP
    SELECT reporting_manager_id INTO _next FROM public.profiles WHERE id = _current;
    IF _next = _manager_id THEN
      RETURN TRUE;
    END IF;
    _current := _next;
    _depth := _depth + 1;
  END LOOP;
  RETURN FALSE;
END;
$$;

-- ============================================
-- AUTO-ADMIN BOOTSTRAP TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.app_role;
BEGIN
  IF LOWER(NEW.email) = 'shahriar@gmgisolutionsltd.com' THEN
    _role := 'admin';
  ELSE
    _role := 'employee';
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

-- Ensure trigger is attached to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- DROP ALL "DEV ALLOW ALL" POLICIES
-- ============================================
DROP POLICY IF EXISTS "Dev Allow All on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Dev Allow All on user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Dev Allow All on attendance_logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "Dev Allow All on daily_work_logs" ON public.daily_work_logs;
DROP POLICY IF EXISTS "Dev Allow All on overtime_requests" ON public.overtime_requests;
DROP POLICY IF EXISTS "Dev Allow All on settings" ON public.settings;
DROP POLICY IF EXISTS "Dev Allow All on notifications" ON public.notifications;

-- ============================================
-- STRICT RLS: PROFILES (replace manager policy with chain-aware)
-- ============================================
DROP POLICY IF EXISTS "Managers can view team profiles" ON public.profiles;
CREATE POLICY "Managers can view chain profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') 
    AND public.is_in_management_chain(auth.uid(), id)
  );

-- ============================================
-- STRICT RLS: ATTENDANCE_LOGS (chain-aware managers)
-- ============================================
DROP POLICY IF EXISTS "Managers can view team attendance" ON public.attendance_logs;
CREATE POLICY "Managers can view chain attendance"
  ON public.attendance_logs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') 
    AND public.is_in_management_chain(auth.uid(), user_id)
  );

CREATE POLICY "Users can delete their own attendance"
  ON public.attendance_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- STRICT RLS: DAILY_WORK_LOGS (chain-aware managers + delete policy)
-- ============================================
DROP POLICY IF EXISTS "Managers can view team work logs" ON public.daily_work_logs;
CREATE POLICY "Managers can view chain work logs"
  ON public.daily_work_logs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') 
    AND public.is_in_management_chain(auth.uid(), user_id)
  );

CREATE POLICY "Users can delete their own work logs"
  ON public.daily_work_logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all work logs"
  ON public.daily_work_logs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- STRICT RLS: OVERTIME_REQUESTS (chain-aware managers)
-- ============================================
DROP POLICY IF EXISTS "Managers can view team OT requests" ON public.overtime_requests;
DROP POLICY IF EXISTS "Managers can update team OT requests" ON public.overtime_requests;
CREATE POLICY "Managers can view chain OT requests"
  ON public.overtime_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') 
    AND public.is_in_management_chain(auth.uid(), user_id)
  );
CREATE POLICY "Managers can update chain OT requests"
  ON public.overtime_requests FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager') 
    AND public.is_in_management_chain(auth.uid(), user_id)
  );

-- ============================================
-- STRICT RLS: NOTIFICATIONS
-- ============================================
CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins manage all notifications"
  ON public.notifications FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- STRICT RLS: HOLIDAYS
-- ============================================
CREATE POLICY "All authenticated can view holidays"
  ON public.holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage holidays"
  ON public.holidays FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- ENSURE DEFAULT SETTINGS ROW EXISTS
-- ============================================
INSERT INTO public.settings (standard_shift_hours, weekday_ot_multiplier, weekend_ot_multiplier, holiday_ot_multiplier)
SELECT 8, 1.5, 2.0, 3.0
WHERE NOT EXISTS (SELECT 1 FROM public.settings);
