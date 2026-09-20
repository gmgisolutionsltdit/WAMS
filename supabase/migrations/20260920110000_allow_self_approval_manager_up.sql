-- The previous fix allowed same-tier approval (manager and above) but
-- still blocked an approver from deciding their own request. In practice
-- an admin's own OT request, or a manager's own manual-time request, still
-- got stuck on "pending" whenever there was nobody else at that tier or
-- above to approve it. Since employees can never self-approve anyway
-- (that would require tier >= 2 while their own tier is 1), it's safe to
-- drop the self-exclusion for manager tier and up: managers/admins can
-- now approve, reject, or modify their own submitted requests.

CREATE OR REPLACE FUNCTION public.can_approve(_approver_id uuid, _requester_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.approval_tier(_approver_id) > public.approval_tier(_requester_id)
    OR (
      public.approval_tier(_approver_id) = public.approval_tier(_requester_id)
      AND public.approval_tier(_approver_id) >= 2
    );
$$;
