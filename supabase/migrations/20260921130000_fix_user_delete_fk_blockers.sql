-- Deleting a user account (Employees tab -> Delete) calls
-- auth.admin.deleteUser(), which cascades into deleting their `profiles`
-- row. That delete was failing with a foreign-key violation whenever the
-- account being deleted was set as someone else's reporting manager,
-- because profiles.reporting_manager_id had no ON DELETE action (defaults
-- to RESTRICT). Same problem for the new sop_documents.uploaded_by /
-- sop_updates.created_by columns. None of these should block deleting a
-- user — the reference should just clear.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_reporting_manager_id_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_reporting_manager_id_fkey
  FOREIGN KEY (reporting_manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.sop_documents DROP CONSTRAINT IF EXISTS sop_documents_uploaded_by_fkey;
ALTER TABLE public.sop_documents
  ADD CONSTRAINT sop_documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sop_updates DROP CONSTRAINT IF EXISTS sop_updates_created_by_fkey;
ALTER TABLE public.sop_updates
  ADD CONSTRAINT sop_updates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
