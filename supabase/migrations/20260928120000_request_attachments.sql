-- Lets employees attach supporting images (receipts, screenshots, proof of
-- late arrival, etc.) to Overtime, Late Time and Leave requests.

ALTER TABLE public.overtime_requests ADD COLUMN IF NOT EXISTS attachments text[];
ALTER TABLE public.late_time_requests ADD COLUMN IF NOT EXISTS attachments text[];
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS attachments text[];

-- Storage: request attachment images, public read (same convention as
-- sop-documents), each user can upload/delete only inside their own folder
-- (bucket path is prefixed by the uploader's user id).
INSERT INTO storage.buckets (id, name, public) VALUES ('request-attachments', 'request-attachments', true) ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Public read request attachments" ON storage.objects FOR SELECT USING (bucket_id = 'request-attachments');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users upload own request attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'request-attachments' AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users delete own request attachments" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'request-attachments' AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
