-- "Admins manage manual time requests" / "Admins manage late time
-- requests" were FOR ALL admin-blanket policies predating the
-- reporting-manager-scoped can_approve() policies. They were never
-- dropped when those were introduced, so — being permissive policies
-- that OR together with everything else on the table — every admin
-- could still see and act on every manual-time and late-time request
-- no matter who the employee's assigned reporting manager was. The
-- can_approve()-based policies already fall back to admin when a
-- requester has no reporting manager set, so these are now pure
-- over-grants and are removed.
DROP POLICY IF EXISTS "Admins manage manual time requests" ON public.manual_time_requests;
DROP POLICY IF EXISTS "Admins manage late time requests" ON public.late_time_requests;
