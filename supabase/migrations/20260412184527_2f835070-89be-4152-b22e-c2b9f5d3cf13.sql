
-- Add break tracking columns to attendance_logs
ALTER TABLE public.attendance_logs
ADD COLUMN IF NOT EXISTS break_start timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS break_end timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS break_minutes numeric DEFAULT 0;

-- Add foreign key from user_roles to profiles so PostgREST can join them
ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
