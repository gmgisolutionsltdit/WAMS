DROP POLICY IF EXISTS "Admins manage wings" ON public.company_wings;
CREATE POLICY "Admins and HR manage wings"
ON public.company_wings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'hr'::public.app_role));