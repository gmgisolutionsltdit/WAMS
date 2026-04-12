
-- Re-add foreign keys to profiles (not auth.users) so PostgREST joins work
ALTER TABLE public.overtime_requests
  ADD CONSTRAINT overtime_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
