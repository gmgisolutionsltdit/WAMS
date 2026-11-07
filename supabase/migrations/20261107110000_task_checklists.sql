-- Trello-style multiple named checklists per task card (previously a task
-- had one flat, unnamed list of checklist items). Mirrors
-- task_checklist_items' own RLS shape.
CREATE TABLE IF NOT EXISTS public.task_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Checklist',
  position INT NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view checklists" ON public.task_checklists FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members create checklists" ON public.task_checklists FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.project_role_of(auth.uid(), t.project_id) IN ('owner','member') OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members update checklists" ON public.task_checklists FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.project_role_of(auth.uid(), t.project_id) IN ('owner','member') OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.project_role_of(auth.uid(), t.project_id) IN ('owner','member') OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members delete checklists" ON public.task_checklists FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.project_role_of(auth.uid(), t.project_id) IN ('owner','member') OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);

CREATE OR REPLACE FUNCTION public.lock_task_checklist_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_checklist_created_by ON public.task_checklists;
CREATE TRIGGER trg_lock_checklist_created_by
  BEFORE UPDATE ON public.task_checklists
  FOR EACH ROW EXECUTE FUNCTION public.lock_task_checklist_created_by();

ALTER TABLE public.task_checklists REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='task_checklists'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.task_checklists';
  END IF;
END$$;

-- Give each existing item a checklist to belong to: one "Checklist" group per
-- task that already had items, created by that item's own earliest author so
-- the new row's own RLS (created_by = auth.uid() only matters on INSERT,
-- harmless here since this is a migration) has a sensible owner.
ALTER TABLE public.task_checklist_items ADD COLUMN IF NOT EXISTS checklist_id UUID REFERENCES public.task_checklists(id) ON DELETE CASCADE;

INSERT INTO public.task_checklists (task_id, title, position, created_by, created_at)
SELECT DISTINCT ON (i.task_id)
  i.task_id, 'Checklist', 0, i.created_by, i.created_at
FROM public.task_checklist_items i
WHERE i.checklist_id IS NULL
ORDER BY i.task_id, i.created_at;

UPDATE public.task_checklist_items i
SET checklist_id = c.id
FROM public.task_checklists c
WHERE i.checklist_id IS NULL AND c.task_id = i.task_id;

ALTER TABLE public.task_checklist_items ALTER COLUMN checklist_id SET NOT NULL;
