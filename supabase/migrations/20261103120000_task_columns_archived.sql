ALTER TABLE public.task_columns
  ADD COLUMN archived boolean NOT NULL DEFAULT false;
