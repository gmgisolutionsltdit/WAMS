-- Approving a leave request debits leave_balances (Approvals.tsx ->
-- applyLeaveBalance). That insert/update was silently blocked by RLS
-- whenever a MANAGER approved (rather than an admin), since the only
-- write policy on leave_balances was admin-only — a leftover from before
-- the flat approval hierarchy let managers approve leave directly. The
-- leave_requests.status update still succeeded (covered separately), so
-- the request looked approved while the employee's Leave Management
-- balance cards never reflected it.

CREATE POLICY "Approvers manage leave balances"
  ON public.leave_balances FOR ALL TO authenticated
  USING (public.can_approve(auth.uid(), user_id))
  WITH CHECK (public.can_approve(auth.uid(), user_id));
