-- Trello-style checklist inside a task card: ordered sub-items that can be
-- checked off independently of the task's own column/status. Mirrors
-- task_comments' RLS shape (board members manage, task assignee too).
CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  position INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view checklist items" ON public.task_checklist_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members create checklist items" ON public.task_checklist_items FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.project_role_of(auth.uid(), t.project_id) IN ('owner','member') OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members update checklist items" ON public.task_checklist_items FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.project_role_of(auth.uid(), t.project_id) IN ('owner','member') OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.project_role_of(auth.uid(), t.project_id) IN ('owner','member') OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members delete checklist items" ON public.task_checklist_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.project_role_of(auth.uid(), t.project_id) IN ('owner','member') OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);

-- Belt-and-braces: even though app code never changes created_by after insert,
-- no WITH CHECK clause can diff against the pre-update row, so a direct API
-- call could otherwise reassign authorship. Pin it server-side instead.
CREATE OR REPLACE FUNCTION public.lock_task_checklist_item_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_checklist_item_created_by ON public.task_checklist_items;
CREATE TRIGGER trg_lock_checklist_item_created_by
  BEFORE UPDATE ON public.task_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.lock_task_checklist_item_created_by();

ALTER TABLE public.task_checklist_items REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='task_checklist_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.task_checklist_items';
  END IF;
END$$;
