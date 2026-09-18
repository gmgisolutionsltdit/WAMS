-- Replace the mix of management-chain-based, supervisor-based, and
-- admin-only approval policies across the four request tables with one
-- flat, uniform role hierarchy, independent of reporting lines:
--   employee              -> approvable by manager or admin
--   manager (or supervisor) -> approvable by admin
--   admin (or hr)          -> approvable by executive ("management")
-- Implemented as a numeric tier per user (highest tier across their roles)
-- so any approver strictly above the requester's tier can decide it.

CREATE OR REPLACE FUNCTION public.approval_tier(_user_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(
    CASE role
      WHEN 'executive' THEN 4
      WHEN 'admin' THEN 3
      WHEN 'hr' THEN 3
      WHEN 'manager' THEN 2
      WHEN 'supervisor' THEN 2
      ELSE 1
    END
  ), 1)
  FROM public.user_roles
  WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.can_approve(_approver_id uuid, _requester_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.approval_tier(_approver_id) > public.approval_tier(_requester_id);
$$;

-- Overtime requests
DROP POLICY IF EXISTS "Managers can view chain OT requests" ON public.overtime_requests;
DROP POLICY IF EXISTS "Managers can update chain OT requests" ON public.overtime_requests;
DROP POLICY IF EXISTS "Admins can view all OT requests" ON public.overtime_requests;
DROP POLICY IF EXISTS "Admins can manage all OT requests" ON public.overtime_requests;
DROP POLICY IF EXISTS "Supervisors view downline OT" ON public.overtime_requests;
DROP POLICY IF EXISTS "Supervisors update downline OT" ON public.overtime_requests;

CREATE POLICY "Approvers view OT requests"
  ON public.overtime_requests FOR SELECT TO authenticated
  USING (public.can_approve(auth.uid(), user_id));

CREATE POLICY "Approvers decide OT requests"
  ON public.overtime_requests FOR UPDATE TO authenticated
  USING (public.can_approve(auth.uid(), user_id))
  WITH CHECK (public.can_approve(auth.uid(), user_id));

-- Leave requests
DROP POLICY IF EXISTS "Managers view chain leave" ON public.leave_requests;
DROP POLICY IF EXISTS "Managers update chain leave" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins manage all leave" ON public.leave_requests;
DROP POLICY IF EXISTS "Supervisors view downline leave" ON public.leave_requests;
DROP POLICY IF EXISTS "Supervisors update downline leave" ON public.leave_requests;

CREATE POLICY "Approvers view leave requests"
  ON public.leave_requests FOR SELECT TO authenticated
  USING (public.can_approve(auth.uid(), user_id));

CREATE POLICY "Approvers decide leave requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (public.can_approve(auth.uid(), user_id))
  WITH CHECK (public.can_approve(auth.uid(), user_id));

-- Manual time requests
DROP POLICY IF EXISTS "Approvers view manual time requests" ON public.manual_time_requests;
DROP POLICY IF EXISTS "Approvers decide manual time requests" ON public.manual_time_requests;

CREATE POLICY "Approvers view manual time requests"
  ON public.manual_time_requests FOR SELECT TO authenticated
  USING (public.can_approve(auth.uid(), user_id));

CREATE POLICY "Approvers decide manual time requests"
  ON public.manual_time_requests FOR UPDATE TO authenticated
  USING (public.can_approve(auth.uid(), user_id))
  WITH CHECK (public.can_approve(auth.uid(), user_id));

-- Late time (office-time-change) requests
DROP POLICY IF EXISTS "Approvers view late requests" ON public.late_time_requests;
DROP POLICY IF EXISTS "Approvers decide late requests" ON public.late_time_requests;

CREATE POLICY "Approvers view late requests"
  ON public.late_time_requests FOR SELECT TO authenticated
  USING (public.can_approve(auth.uid(), user_id));

CREATE POLICY "Approvers decide late requests"
  ON public.late_time_requests FOR UPDATE TO authenticated
  USING (public.can_approve(auth.uid(), user_id))
  WITH CHECK (public.can_approve(auth.uid(), user_id));
