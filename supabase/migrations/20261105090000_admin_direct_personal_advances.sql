-- Lets an admin issue a personal advance (loan) directly for any employee,
-- already approved, from the HR "Employee Loans" page — previously that
-- page wrote to a separate, unconnected employee_loans table, so a loan
-- issued there never showed up in the employee's own Payment > Loans tab or
-- their My Payments Loan Due card, both of which read personal_advances.
-- The existing "Users create own personal advances" policy only allows a
-- user to insert their own pending request; this adds a second INSERT
-- policy (OR'd with it) letting an admin insert for any user_id and any
-- status, so an admin-issued loan can start life already 'approved'.
CREATE POLICY "Admins create personal advances for any employee" ON public.personal_advances
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
