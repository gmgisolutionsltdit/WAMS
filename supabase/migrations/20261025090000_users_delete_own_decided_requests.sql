-- Employees could previously only delete their own manual time / late / OT
-- requests while status = 'pending'. Once an approver decided the request
-- (Approved or Rejected), the requester lost the ability to remove it from
-- their own Notice Board "Requests Activity" feed, even though no other
-- employee's data is affected by that delete. Add an additive owner-delete
-- policy that drops the pending-only restriction; RLS policies for the same
-- command (DELETE) on the same table are OR'd together, so this only grants
-- more access and never revokes the existing pending-only policy.

CREATE POLICY "Users delete own manual time requests"
  ON public.manual_time_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own late requests"
  ON public.late_time_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own OT requests"
  ON public.overtime_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
