-- Notice deletion (multi-select bulk delete included) is now available to
-- every role, not just admin/hr. The existing "HR/Admin manage notices"
-- policy still gates title/body/pin/category edits — this function only
-- ever flips is_active to false, so it can't be used to alter a notice's
-- content or to resurrect one.
CREATE OR REPLACE FUNCTION public.soft_delete_notices(_ids UUID[])
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.notices SET is_active = FALSE WHERE id = ANY(_ids);
END;
$$;

-- A new SECURITY DEFINER function grants EXECUTE to PUBLIC by default,
-- which (combined with SECURITY DEFINER) would let an unauthenticated
-- caller on the public API invoke it directly. Lock it down to
-- `authenticated` only — the auth.uid() check above is belt-and-braces
-- on top of that grant, not a substitute for it.
REVOKE EXECUTE ON FUNCTION public.soft_delete_notices(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_notices(UUID[]) TO authenticated;
