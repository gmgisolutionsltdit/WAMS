
ALTER TABLE public.attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_user_id_fkey;
ALTER TABLE public.overtime_requests DROP CONSTRAINT IF EXISTS overtime_requests_user_id_fkey;
ALTER TABLE public.overtime_requests DROP CONSTRAINT IF EXISTS overtime_requests_approved_by_fkey;
