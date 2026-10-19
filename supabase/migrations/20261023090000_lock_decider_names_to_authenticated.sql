-- Same gap as soft_delete_notices (see 20261023080000_notices_delete_all_roles.sql):
-- a SECURITY DEFINER function grants EXECUTE to PUBLIC by default, so the
-- earlier GRANT ... TO authenticated never removed that. Low practical risk
-- here since every branch filters on auth.uid() (NULL for an anon caller
-- resolves to no rows), but close the gap the same way for consistency.
REVOKE EXECUTE ON FUNCTION public.my_request_decider_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_request_decider_names() TO authenticated;
