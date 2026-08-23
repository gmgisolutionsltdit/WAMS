DROP POLICY IF EXISTS "Auth upload task files" ON storage.objects;

CREATE POLICY "Auth upload task files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-attachments'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (
    -- personal uploads (e.g. expense receipts) live directly in the user's own folder
    array_length(storage.foldername(name), 1) = 1
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    -- task uploads must use <uid>/<task_id>/<file> and require project membership
    OR EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
        AND t.id = ((storage.foldername(name))[2])::uuid
        AND public.is_project_member(auth.uid(), t.project_id)
    )
  )
);