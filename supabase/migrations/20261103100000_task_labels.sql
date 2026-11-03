-- Trello-style labels: defined per board (not per card), named + colored,
-- and referenced by id from tasks.labels (now a text[] of label ids rather
-- than bare color keys). Visibility/edit rights mirror task_columns.
CREATE TABLE public.task_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.task_boards(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  color text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view task labels"
  ON public.task_labels FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_boards b
      WHERE b.id = task_labels.board_id AND can_view_project(auth.uid(), b.project_id)
    )
  );

CREATE POLICY "Members manage task labels"
  ON public.task_labels FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_boards b
      WHERE b.id = task_labels.board_id AND can_edit_project(auth.uid(), b.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task_boards b
      WHERE b.id = task_labels.board_id AND can_edit_project(auth.uid(), b.project_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_labels TO authenticated;
