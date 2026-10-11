-- personal_advances had SELECT/INSERT/UPDATE policies but no DELETE policy
-- at all, so an admin deleting a loan history row from the app silently
-- matched 0 rows (RLS default-denies with no error) instead of failing
-- loudly or succeeding. Let admins delete it; personal_advance_actions rows
-- for it are removed automatically via its existing ON DELETE CASCADE.
CREATE POLICY "Admins delete personal advances" ON public.personal_advances
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
