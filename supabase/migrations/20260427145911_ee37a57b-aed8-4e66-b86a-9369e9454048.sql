
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.leave_day_type AS ENUM ('full', 'first_half', 'second_half');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'in_review', 'blocked', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.project_role AS ENUM ('owner', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ LEAVE TYPES ============
CREATE TABLE IF NOT EXISTS public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  annual_quota NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  accrual_per_month NUMERIC NOT NULL DEFAULT 0,
  carry_forward_max NUMERIC NOT NULL DEFAULT 0,
  encashable BOOLEAN NOT NULL DEFAULT FALSE,
  half_day_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view leave types" ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage leave types" ON public.leave_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed defaults
INSERT INTO public.leave_types (name, code, annual_quota, is_paid, half_day_allowed, color)
VALUES
  ('Annual Leave','AL', 20, TRUE, TRUE, '#3b82f6'),
  ('Sick Leave','SL', 10, TRUE, TRUE, '#ef4444'),
  ('Casual Leave','CL', 10, TRUE, TRUE, '#10b981'),
  ('Compensatory Off','COMP', 0, TRUE, FALSE, '#f59e0b'),
  ('Unpaid Leave','UPL', 0, FALSE, TRUE, '#6b7280')
ON CONFLICT (code) DO NOTHING;

-- ============ LEAVE BALANCES ============
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  leave_type_id UUID NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year INT NOT NULL,
  allocated NUMERIC NOT NULL DEFAULT 0,
  used NUMERIC NOT NULL DEFAULT 0,
  carried_forward NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, leave_type_id, year)
);
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own balance" ON public.leave_balances FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Managers view chain balance" ON public.leave_balances FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'manager') AND public.is_in_management_chain(auth.uid(), user_id));
CREATE POLICY "Admins manage balances" ON public.leave_balances FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ LEAVE REQUESTS ============
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  leave_type_id UUID NOT NULL REFERENCES public.leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  day_type public.leave_day_type NOT NULL DEFAULT 'full',
  total_days NUMERIC NOT NULL,
  reason TEXT,
  status public.leave_status NOT NULL DEFAULT 'pending',
  approver_id UUID,
  approver_note TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own leave" ON public.leave_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own leave" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own pending leave" ON public.leave_requests FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Managers view chain leave" ON public.leave_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'manager') AND public.is_in_management_chain(auth.uid(), user_id));
CREATE POLICY "Managers update chain leave" ON public.leave_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'manager') AND public.is_in_management_chain(auth.uid(), user_id));
CREATE POLICY "Admins manage all leave" ON public.leave_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ COMP OFF CREDITS ============
CREATE TABLE IF NOT EXISTS public.comp_off_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_ot_id UUID,
  hours NUMERIC NOT NULL,
  days_credited NUMERIC NOT NULL DEFAULT 0,
  expires_at DATE,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comp_off_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own comp off" ON public.comp_off_credits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Managers view chain comp off" ON public.comp_off_credits FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'manager') AND public.is_in_management_chain(auth.uid(), user_id));
CREATE POLICY "Admins manage comp off" ON public.comp_off_credits FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ PROJECTS ============
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  wing public.company_wing,
  owner_id UUID NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ============ PROJECT MEMBERS ============
CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.project_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Helper: is user a member of a project
CREATE OR REPLACE FUNCTION public.is_project_member(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.project_role_of(_user_id UUID, _project_id UUID)
RETURNS public.project_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND owner_id = _user_id) THEN 'owner'::public.project_role
    ELSE (SELECT role FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id LIMIT 1)
  END;
$$;

-- Project policies
CREATE POLICY "Members view projects" ON public.projects FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated can create projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners update projects" ON public.projects FOR UPDATE TO authenticated USING (auth.uid() = owner_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owners delete projects" ON public.projects FOR DELETE TO authenticated USING (auth.uid() = owner_id OR public.has_role(auth.uid(),'admin'));

-- Project members policies
CREATE POLICY "Members view project members" ON public.project_members FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Owners manage members" ON public.project_members FOR ALL TO authenticated USING (
  public.project_role_of(auth.uid(), project_id) = 'owner' OR public.has_role(auth.uid(),'admin')
) WITH CHECK (
  public.project_role_of(auth.uid(), project_id) = 'owner' OR public.has_role(auth.uid(),'admin')
);

-- ============ TASK BOARDS ============
CREATE TABLE IF NOT EXISTS public.task_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view boards" ON public.task_boards FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Members manage boards" ON public.task_boards FOR ALL TO authenticated USING (
  public.project_role_of(auth.uid(), project_id) IN ('owner','member') OR public.has_role(auth.uid(),'admin')
) WITH CHECK (
  public.project_role_of(auth.uid(), project_id) IN ('owner','member') OR public.has_role(auth.uid(),'admin')
);

-- ============ TASK COLUMNS ============
CREATE TABLE IF NOT EXISTS public.task_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.task_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status public.task_status NOT NULL DEFAULT 'todo',
  position INT NOT NULL DEFAULT 0,
  wip_limit INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view columns" ON public.task_columns FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = board_id AND (public.is_project_member(auth.uid(), b.project_id) OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members manage columns" ON public.task_columns FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = board_id AND (public.project_role_of(auth.uid(), b.project_id) IN ('owner','member') OR public.has_role(auth.uid(),'admin')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = board_id AND (public.project_role_of(auth.uid(), b.project_id) IN ('owner','member') OR public.has_role(auth.uid(),'admin')))
);

-- ============ TASKS ============
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  board_id UUID REFERENCES public.task_boards(id) ON DELETE SET NULL,
  column_id UUID REFERENCES public.task_columns(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  ticket_key TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID,
  reporter_id UUID NOT NULL,
  due_date DATE,
  start_date DATE,
  estimated_hours NUMERIC,
  actual_hours NUMERIC,
  story_points INT,
  position INT NOT NULL DEFAULT 0,
  labels TEXT[] DEFAULT ARRAY[]::TEXT[],
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view tasks" ON public.tasks FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id) OR assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Members create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  public.project_role_of(auth.uid(), project_id) IN ('owner','member') OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "Members update tasks" ON public.tasks FOR UPDATE TO authenticated USING (
  public.project_role_of(auth.uid(), project_id) IN ('owner','member') OR assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "Owners delete tasks" ON public.tasks FOR DELETE TO authenticated USING (
  public.project_role_of(auth.uid(), project_id) = 'owner' OR public.has_role(auth.uid(),'admin')
);

-- ============ TASK COMMENTS ============
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view comments" ON public.task_comments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members create comments" ON public.task_comments FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR t.assignee_id = auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Authors update own comments" ON public.task_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authors or admins delete comments" ON public.task_comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- ============ TASK ATTACHMENTS ============
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view attachments" ON public.task_attachments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Members upload attachments" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = uploader_id AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "Uploaders or admins delete attachments" ON public.task_attachments FOR DELETE TO authenticated USING (auth.uid() = uploader_id OR public.has_role(auth.uid(),'admin'));

-- ============ TASK ACTIVITY ============
CREATE TABLE IF NOT EXISTS public.task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  action TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view activity" ON public.task_activity FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "System inserts activity" ON public.task_activity FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

-- ============ TASK WATCHERS ============
CREATE TABLE IF NOT EXISTS public.task_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);
ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own watch" ON public.task_watchers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members view watchers" ON public.task_watchers FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR public.has_role(auth.uid(),'admin')))
);

-- ============ TRIGGERS for updated_at ============
DROP TRIGGER IF EXISTS trg_leave_types_updated ON public.leave_types;
CREATE TRIGGER trg_leave_types_updated BEFORE UPDATE ON public.leave_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_leave_balances_updated ON public.leave_balances;
CREATE TRIGGER trg_leave_balances_updated BEFORE UPDATE ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_leave_requests_updated ON public.leave_requests;
CREATE TRIGGER trg_leave_requests_updated BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_projects_updated ON public.projects;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tasks_updated ON public.tasks;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_task_comments_updated ON public.task_comments;
CREATE TRIGGER trg_task_comments_updated BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-add owner as project_member 'owner' on insert
CREATE OR REPLACE FUNCTION public.add_project_owner_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'owner';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_project_owner_member ON public.projects;
CREATE TRIGGER trg_project_owner_member AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.add_project_owner_member();

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments','task-attachments', false) ON CONFLICT (id) DO NOTHING;

-- Avatars: public read, authenticated upload to own folder, admins manage
DO $$ BEGIN
  CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (
    bucket_id = 'avatars' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth delete own avatar" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'avatars' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Task attachments: project members read/write
DO $$ BEGIN
  CREATE POLICY "Members read task files" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'task-attachments' AND (
      public.has_role(auth.uid(),'admin') OR
      EXISTS (SELECT 1 FROM public.task_attachments ta WHERE ta.file_path = name AND EXISTS (
        SELECT 1 FROM public.tasks t WHERE t.id = ta.task_id AND public.is_project_member(auth.uid(), t.project_id)
      ))
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth upload task files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'task-attachments' AND auth.uid()::text = (storage.foldername(name))[1]
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth delete own task files" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'task-attachments' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
