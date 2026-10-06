-- manual_time_requests and late_time_requests never had a DELETE policy for
-- approvers — only "Users cancel own pending ..." (the requester, pending
-- only). overtime_requests got this fixed in 20260920100000_fix_approval_gaps,
-- but manual/late time requests were missed, so the Delete button in their
-- request logs silently did nothing for admins and managers alike.
CREATE POLICY "Approvers delete manual time requests"
  ON public.manual_time_requests FOR DELETE TO authenticated
  USING (public.can_approve(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Approvers delete late time requests"
  ON public.late_time_requests FOR DELETE TO authenticated
  USING (public.can_approve(auth.uid(), user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role));
