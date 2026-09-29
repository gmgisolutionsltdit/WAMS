-- Three additions:
-- 1) Extra contact fields shown on the "Team Member Details" page.
-- 2) A per-employee "Contract Documents" store (SOP/certificates/CV/NID/
--    photo/nominee/bank files), each category with its own accepted types
--    and size limit enforced client-side; the bucket itself just holds
--    whatever was uploaded, scoped to the owner + admins.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personal_email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS official_gmail text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS official_onedrive text;

CREATE TABLE public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('sop', 'certificate', 'cv', 'nid', 'photo', 'nominee', 'bank')),
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins read employee documents"
  ON public.employee_documents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Owners and admins upload employee documents"
  ON public.employee_documents FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Owners and admins delete employee documents"
  ON public.employee_documents FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.employee_documents;

-- Storage: private bucket (NID/bank documents are sensitive), read/write/
-- delete scoped to the owning employee's own folder plus admins.
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents', 'employee-documents', false) ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Owners and admins read employee document files" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'employee-documents'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owners and admins upload employee document files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'employee-documents'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owners and admins delete employee document files" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'employee-documents'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
