-- Archiving a notice (soft_delete_notices) is open to every role, but there
-- was no way to see what got archived or bring it back. Add visibility into
-- archived notices and a symmetric restore RPC, open to every role the same
-- way archiving already is.

CREATE POLICY "Authenticated can view archived notices" ON public.notices
  FOR SELECT TO authenticated USING (is_active = FALSE);

CREATE OR REPLACE FUNCTION public.restore_notices(_ids UUID[])
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.notices SET is_active = TRUE WHERE id = ANY(_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_notices(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_notices(UUID[]) TO authenticated;
