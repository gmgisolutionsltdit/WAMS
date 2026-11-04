-- Admins can now remove an expense category from the New Claim dialog's
-- management list. expense_claims.category is a plain text snapshot (not a
-- foreign key to expense_types), so existing claims keep showing whatever
-- category they were submitted under even after that type is deleted.
CREATE POLICY "Admins delete expense types"
  ON public.expense_types FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT DELETE ON public.expense_types TO authenticated;
