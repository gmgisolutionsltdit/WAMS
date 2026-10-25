-- "Managers can view chain profiles" still gated on is_in_management_chain(),
-- which only walks the single legacy reporting_manager_id column. Every
-- approval-request table (overtime_requests, leave_requests,
-- manual_time_requests, late_time_requests) was switched over to
-- can_approve(), which checks the newer reporting_manager_ids array instead
-- (see 20260927100000_approval_scoped_to_reporting_manager.sql). A manager
-- assigned only via that array can therefore see a pending request row but
-- not the requester's profile, so the name resolves to "Unknown" on the
-- Approvals / Notice Board pages. Bring the profile policy in line with the
-- same function the request tables already use.
DROP POLICY IF EXISTS "Managers can view chain profiles" ON public.profiles;
CREATE POLICY "Approvers can view requester profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager')
    AND public.can_approve(auth.uid(), id)
  );
