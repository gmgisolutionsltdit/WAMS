-- Admin "Delete" on a Payment History row (Payment > My Payments) had no
-- way to actually succeed: payroll_settlements granted authenticated users
-- only SELECT/INSERT/UPDATE and had no DELETE policy, so the request was
-- rejected outright. Add an admin-only delete policy, matching the existing
-- insert/update policies on this table.
GRANT DELETE ON public.payroll_settlements TO authenticated;

CREATE POLICY "Admins delete payroll settlements"
  ON public.payroll_settlements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
