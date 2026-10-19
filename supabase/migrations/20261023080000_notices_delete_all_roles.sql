-- Notice deletion (multi-select bulk delete included) is now available to
-- every role, not just admin/hr. The existing "HR/Admin manage notices"
-- policy still gates title/body/pin/category edits — this function only
-- ever flips is_active to false, so it can't be used to alter a notice's
-- content or to resurrect one.
CREATE OR REPLACE FUNCTION public.soft_delete_notices(_ids UUID[])
RETURNS VOID
LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notices SET is_active = FALSE WHERE id = ANY(_ids);
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_notices(UUID[]) TO authenticated;
