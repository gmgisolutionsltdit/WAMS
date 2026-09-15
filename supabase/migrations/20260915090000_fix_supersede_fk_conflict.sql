-- Editing a session raised "tuple to be updated was already modified by an
-- operation triggered by the current command".
--
-- apply_manual_time_request deletes the superseded attendance_logs row from
-- inside a BEFORE UPDATE trigger on manual_time_requests. Because
-- supersedes_log_id had a plain (non-deferrable) ON DELETE SET NULL foreign
-- key back to attendance_logs, that DELETE made Postgres immediately try to
-- null out supersedes_log_id on every manual_time_requests row referencing
-- the deleted id - including the very row the outer UPDATE was still in the
-- middle of modifying. Two commands touching the same tuple at once is
-- exactly what that error reports.
--
-- Making the constraint DEFERRABLE INITIALLY DEFERRED pushes the SET NULL
-- action to transaction commit, by which point the outer UPDATE has already
-- finished, so it never collides with itself.
ALTER TABLE public.manual_time_requests
  DROP CONSTRAINT IF EXISTS manual_time_requests_supersedes_log_id_fkey;
ALTER TABLE public.manual_time_requests
  ADD CONSTRAINT manual_time_requests_supersedes_log_id_fkey
  FOREIGN KEY (supersedes_log_id) REFERENCES public.attendance_logs(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;
