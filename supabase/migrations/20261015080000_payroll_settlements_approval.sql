-- My Payments: when an admin records a payment, the employee and their
-- manager are notified and can approve or reject it; the admin is notified
-- only (no action). Either the employee or their manager may act — whoever
-- acts first settles it, matching the flat-approval-hierarchy convention
-- already used for OT/Leave/Loan/Expense requests via can_approve().
ALTER TABLE public.payroll_settlements
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending_approval'
    CHECK (approval_status IN ('pending_approval', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Managers could not previously see a team member's settlement at all (SELECT
-- was owner + admin only) — needed now so they can review and act on it.
DROP POLICY IF EXISTS "Users view own payroll settlements" ON public.payroll_settlements;
CREATE POLICY "Users view own or approvable payroll settlements"
  ON public.payroll_settlements FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.can_approve(auth.uid(), user_id)
  );

-- The employee themselves or their manager can update a settlement's
-- approval fields (the app only ever writes approval_status/approved_by/
-- approved_at/rejection_reason from this path).
CREATE POLICY "Employee or manager approve payroll settlements"
  ON public.payroll_settlements FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.can_approve(auth.uid(), user_id));
