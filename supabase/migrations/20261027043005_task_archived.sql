-- Soft-archive for tasks (Trello's "Archive card"), mirroring projects.archived.
-- A hard DELETE loses comments/checklist/attachments/activity history and, for
-- non-owner board members or a task's own assignee, silently fails under the
-- "Owners delete tasks" RLS policy; an UPDATE instead goes through the same
-- "Members update tasks" policy already used for the complete-toggle.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
