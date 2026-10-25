-- The Notice Board activity feed only showed "by <decider>" on an
-- employee's own requests (my_request_decider_names() was scoped to just
-- those), and the frontend only rendered that suffix for the requester
-- themselves anyway. Admins/managers looking at their team's decided
-- requests never saw who actually approved/rejected it. Widen the RPC to
-- also resolve decider names for requests the caller can approve (so a
-- manager/admin viewing their team's activity gets the same names), still
-- scoped server-side (can_approve()/ownership baked into every branch, not
-- caller-supplied) so it can't be used to look up arbitrary profiles.
CREATE OR REPLACE FUNCTION public.my_request_decider_names()
RETURNS TABLE(user_id UUID, full_name TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.id, COALESCE(p.full_name, p.email)
  FROM public.profiles p
  WHERE p.id IN (
    SELECT approver_id FROM public.leave_requests
      WHERE approver_id IS NOT NULL AND (user_id = auth.uid() OR public.can_approve(auth.uid(), user_id))
    UNION
    SELECT approved_by FROM public.late_time_requests
      WHERE approved_by IS NOT NULL AND (user_id = auth.uid() OR public.can_approve(auth.uid(), user_id))
    UNION
    SELECT approved_by FROM public.manual_time_requests
      WHERE approved_by IS NOT NULL AND (user_id = auth.uid() OR public.can_approve(auth.uid(), user_id))
    UNION
    SELECT approved_by FROM public.overtime_requests
      WHERE approved_by IS NOT NULL AND (user_id = auth.uid() OR public.can_approve(auth.uid(), user_id))
  );
$$;
