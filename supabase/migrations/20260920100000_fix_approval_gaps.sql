-- Fixes reported after the flat approval hierarchy rollout:
--
-- 1. Top-tier requests (e.g. an admin's own OT/leave/manual-time/late-time
--    request) could never be approved, rejected or modified, because
--    can_approve() required a STRICTLY higher tier than the requester, and
--    there is often nobody above admin (no "executive" account). Same
--    problem for a manager approving another manager's request. Fixed by
--    allowing same-tier approval for tier >= 2 (manager and above), as
--    long as the approver isn't the requester themselves.
-- 2. overtime_requests never had a DELETE policy at all (the old
--    "Admins can manage all OT requests" FOR ALL policy covered delete,
--    but it was dropped by the flat-hierarchy migration and never
--    replaced), so the Delete button on the Approvals page silently did
--    nothing for every request regardless of who submitted it.

CREATE OR REPLACE FUNCTION public.can_approve(_approver_id uuid, _requester_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _approver_id <> _requester_id
    AND (
      public.approval_tier(_approver_id) > public.approval_tier(_requester_id)
      OR (
        public.approval_tier(_approver_id) = public.approval_tier(_requester_id)
        AND public.approval_tier(_approver_id) >= 2
      )
    );
$$;

CREATE POLICY "Approvers delete OT requests"
  ON public.overtime_requests FOR DELETE TO authenticated
  USING (public.can_approve(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Users cancel own pending OT requests"
  ON public.overtime_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending'::ot_status);
