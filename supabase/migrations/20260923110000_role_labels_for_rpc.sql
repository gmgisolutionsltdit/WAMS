-- Notice Board's activity feed shows an employee who decided their leave
-- or late-time request (by role: Manager/Admin). Looking that decider's
-- role up via a plain `user_roles` select was blocked by RLS for anyone
-- but the decider themselves or an admin ("Users can view their own
-- roles" / "Admins can manage all roles"), so employees never got a role
-- back and the "by Manager/Admin" suffix silently never appeared.
--
-- This function only exposes role labels for the specific ids the caller
-- already has (decider ids off their own visible requests) — not a
-- general roster lookup.
CREATE OR REPLACE FUNCTION public.role_labels_for(_user_ids uuid[])
RETURNS TABLE(user_id uuid, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.user_id, ur.role::text
  FROM public.user_roles ur
  WHERE ur.user_id = ANY(_user_ids)
$$;

GRANT EXECUTE ON FUNCTION public.role_labels_for(uuid[]) TO authenticated;
