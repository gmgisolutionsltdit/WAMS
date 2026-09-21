-- SOP (Standard Operating Procedure) segment: versioned PDF documents
-- everyone can read, admin-only upload of new versions, plus text-only
-- rule-update notes admins can post between formal SOP publications.

CREATE TABLE public.sop_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  version_label text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_documents TO authenticated;
GRANT ALL ON public.sop_documents TO service_role;
ALTER TABLE public.sop_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone reads SOP documents"
  ON public.sop_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage SOP documents"
  ON public.sop_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.sop_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_updates TO authenticated;
GRANT ALL ON public.sop_updates TO service_role;
ALTER TABLE public.sop_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone reads SOP rule updates"
  ON public.sop_updates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage SOP rule updates"
  ON public.sop_updates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.sop_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sop_updates;

-- Storage: SOP PDFs, public read (same convention as avatars), admin write.
INSERT INTO storage.buckets (id, name, public) VALUES ('sop-documents', 'sop-documents', true) ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Public read SOP documents" ON storage.objects FOR SELECT USING (bucket_id = 'sop-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins upload SOP documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'sop-documents' AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins delete SOP documents" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'sop-documents' AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
