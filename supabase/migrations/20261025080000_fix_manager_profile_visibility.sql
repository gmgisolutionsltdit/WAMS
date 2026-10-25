-- "Managers can view chain profiles" is gated on is_in_management_chain(),
-- which recursively walks the single legacy reporting_manager_id column —
-- general employee-picker/directory reads (e.g. useVisibleEmployees, used
-- by TaskBoard's assignee and project-member pickers) rely on that
-- multi-level reach and must keep it.
--
-- Every approval-request table (overtime_requests, leave_requests,
-- manual_time_requests, late_time_requests) was switched over to
-- can_approve(), which checks the newer reporting_manager_ids array instead
-- (see 20260927100000_approval_scoped_to_reporting_manager.sql) and is not
-- recursive. A manager assigned only via that array can therefore see a
-- pending request row but not the requester's profile, so the name
-- resolves to "Unknown" on the Approvals / Notice Board pages. Add a
-- second, additive SELECT policy for that case rather than replacing the
-- chain policy — RLS policies for the same command are OR'd, so this only
-- grants more visibility, never less.
CREATE POLICY "Approvers can view requester profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager')
    AND public.can_approve(auth.uid(), id)
  );
