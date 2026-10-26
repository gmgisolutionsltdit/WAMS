-- Trello-style board visibility: "Private" (only members, same as today),
-- "Workspace" (every authenticated employee can see AND edit the board,
-- like Trello's workspace visibility), "Public" (every authenticated
-- employee can see the board, but only members/admins can edit it, like
-- Trello's "anyone on the internet can see, only board members can edit").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'board_visibility') THEN
    CREATE TYPE public.board_visibility AS ENUM ('private', 'workspace', 'public');
  END IF;
END $$;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS visibility public.board_visibility NOT NULL DEFAULT 'private';

CREATE OR REPLACE FUNCTION public.can_view_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_project_member(_user_id, _project_id)
    OR public.has_role(_user_id, 'admin')
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND visibility <> 'private');
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_project_member(_user_id, _project_id)
    OR public.has_role(_user_id, 'admin')
    OR EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND visibility = 'workspace');
$$;

-- Projects
DROP POLICY IF EXISTS "Members view projects" ON public.projects;
CREATE POLICY "Members view projects" ON public.projects FOR SELECT TO authenticated
  USING (public.can_view_project(auth.uid(), id));

-- Boards
DROP POLICY IF EXISTS "Members view boards" ON public.task_boards;
CREATE POLICY "Members view boards" ON public.task_boards FOR SELECT TO authenticated
  USING (public.can_view_project(auth.uid(), project_id));

DROP POLICY IF EXISTS "Members manage boards" ON public.task_boards;
CREATE POLICY "Members manage boards" ON public.task_boards FOR ALL TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id))
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

-- Columns
DROP POLICY IF EXISTS "Members view columns" ON public.task_columns;
CREATE POLICY "Members view columns" ON public.task_columns FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = board_id AND public.can_view_project(auth.uid(), b.project_id))
);

DROP POLICY IF EXISTS "Members manage columns" ON public.task_columns;
CREATE POLICY "Members manage columns" ON public.task_columns FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = board_id AND public.can_edit_project(auth.uid(), b.project_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = board_id AND public.can_edit_project(auth.uid(), b.project_id))
);

-- Tasks
DROP POLICY IF EXISTS "Members view tasks" ON public.tasks;
CREATE POLICY "Members view tasks" ON public.tasks FOR SELECT TO authenticated
  USING (public.can_view_project(auth.uid(), project_id) OR assignee_id = auth.uid());

DROP POLICY IF EXISTS "Members create tasks" ON public.tasks;
CREATE POLICY "Members create tasks" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_project(auth.uid(), project_id));

DROP POLICY IF EXISTS "Members update tasks" ON public.tasks;
CREATE POLICY "Members update tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (public.can_edit_project(auth.uid(), project_id) OR assignee_id = auth.uid());

-- Comments
DROP POLICY IF EXISTS "Members view comments" ON public.task_comments;
CREATE POLICY "Members view comments" ON public.task_comments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.can_view_project(auth.uid(), t.project_id) OR t.assignee_id = auth.uid()))
);

DROP POLICY IF EXISTS "Members create comments" ON public.task_comments;
CREATE POLICY "Members create comments" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.can_edit_project(auth.uid(), t.project_id) OR t.assignee_id = auth.uid()))
);

-- Attachments
DROP POLICY IF EXISTS "Members view attachments" ON public.task_attachments;
CREATE POLICY "Members view attachments" ON public.task_attachments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.can_view_project(auth.uid(), t.project_id))
);

DROP POLICY IF EXISTS "Members upload attachments" ON public.task_attachments;
CREATE POLICY "Members upload attachments" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = uploader_id AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.can_edit_project(auth.uid(), t.project_id))
);

-- Activity
DROP POLICY IF EXISTS "Members view activity" ON public.task_activity;
CREATE POLICY "Members view activity" ON public.task_activity FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.can_view_project(auth.uid(), t.project_id))
);

-- Watchers
DROP POLICY IF EXISTS "Members view watchers" ON public.task_watchers;
CREATE POLICY "Members view watchers" ON public.task_watchers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.can_view_project(auth.uid(), t.project_id))
);
