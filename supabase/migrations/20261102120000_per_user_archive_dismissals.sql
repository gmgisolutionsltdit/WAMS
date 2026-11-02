-- Archiving a notice or a Requests Activity item previously flipped a single
-- shared column (notices.is_active / <table>.archived), so one person
-- archiving something hid it for every viewer. Replace that for Notice
-- Board with a personal dismissal: each person's own archive state, kept
-- entirely separate from the shared row and from anyone else's view of it.
-- The existing is_active/archived columns are left untouched (still used by
-- NoticeBoardWidget's dashboard feed and ReportsSummary's latest-correction
-- selection) — Notice Board now reads/writes only these new tables.

CREATE TABLE public.notice_dismissals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notice_id uuid NOT NULL REFERENCES public.notices(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notice_id)
);

ALTER TABLE public.notice_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own notice dismissals"
  ON public.notice_dismissals FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.notice_dismissals TO authenticated;

CREATE TABLE public.activity_dismissals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('leave', 'late', 'manual', 'ot')),
  item_id uuid NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, item_id)
);

ALTER TABLE public.activity_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own activity dismissals"
  ON public.activity_dismissals FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.activity_dismissals TO authenticated;
