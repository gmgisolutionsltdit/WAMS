-- can_approve() only let an admin decide a request when the requester had
-- NO reporting manager assigned at all (the "fallback" case) — once any
-- manager was assigned, an admin's approve/reject/modify on that request
-- was silently rejected by RLS (0 rows updated, no error), which the UI
-- then reported as a false success. An admin should always be able to
-- decide any request, same as every other admin-bypass in this schema
-- (RoleGate allow=["admin"], canBypass48h, etc.) — widen the admin case
-- from "only when unowned" to unconditional, on top of the existing
-- reporting-manager chain.
CREATE OR REPLACE FUNCTION public.can_approve(_approver_id uuid, _requester_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_approver_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _requester_id
        AND _approver_id = ANY(COALESCE(p.reporting_manager_ids, '{}'))
    );
$$;
