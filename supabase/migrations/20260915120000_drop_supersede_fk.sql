-- The previous fix (making the FK DEFERRABLE INITIALLY DEFERRED) still left
-- editing a session failing with "tuple to be updated was already modified
-- by an operation triggered by the current command."
--
-- supersedes_log_id is write-once bookkeeping consumed entirely inside
-- apply_manual_time_request: the trigger reads it, deletes the row it names,
-- and never needs the column again afterwards. It does not need a foreign
-- key at all, and the ON DELETE SET NULL cascade is exactly what forces
-- Postgres to update the very manual_time_requests row the outer UPDATE is
-- still processing - the self-conflict this error reports. Deferring the
-- cascade was not enough because Supabase runs each request in its own
-- single-statement transaction, so "end of transaction" and "end of this
-- command" landed at effectively the same point.
--
-- Dropping the constraint removes the cascade entirely: the DELETE inside
-- the trigger becomes an ordinary delete-by-id with no side effect on
-- manual_time_requests, so there is nothing left to conflict with.
ALTER TABLE public.manual_time_requests
  DROP CONSTRAINT IF EXISTS manual_time_requests_supersedes_log_id_fkey;
