-- Approval rights now follow each employee's own chosen "Reporting To"
-- manager(s), not a flat "any manager or admin" tier rule. Concretely:
--   - can_approve(approver, requester) is true when approver is one of
--     requester's assigned reporting_manager_ids.
--   - If the requester has no reporting manager assigned at all, any
--     admin is the fallback approver (so nothing gets stuck unowned).
-- This governs the SELECT/UPDATE/DELETE policies already built on
-- can_approve() for overtime_requests, leave_requests,
-- manual_time_requests and late_time_requests — no policy changes
-- needed here, just the function they all call.
CREATE OR REPLACE FUNCTION public.can_approve(_approver_id uuid, _requester_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _requester_id
      AND (
        _approver_id = ANY(COALESCE(p.reporting_manager_ids, '{}'))
        OR (
          COALESCE(array_length(p.reporting_manager_ids, 1), 0) = 0
          AND public.has_role(_approver_id, 'admin'::public.app_role)
        )
      )
  );
$$;
