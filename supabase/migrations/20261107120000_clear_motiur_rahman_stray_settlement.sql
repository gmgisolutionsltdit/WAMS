-- Second attempt at the root cause of Motiur Rahman's persistent
-- -BDT 1,000.00 Expense Balance (the first attempt, 20261107090000, zeroed
-- an outstanding advance claim but matched 0 rows, so that wasn't it).
--
-- The Expense Balance formula also subtracts, forever, every *past* month's
-- payroll_settlements.expense_amount_paid where expense_paid = true
-- (MyPaymentsTab/MyPaymentsSummary's "priorPaid" term) — on the theory that
-- once a reimbursement is recorded as paid, it should keep reducing what's
-- still outstanding in every later month. If an earlier month was recorded
-- with expense_paid = true and expense_amount_paid = 1000 for him with no
-- real expense claim behind it (test data), that alone would show up as a
-- permanent -1,000 in every later month, exactly matching what's seen,
-- without needing any row in expense_claims at all — which is why the first
-- fix, scoped to expense_claims, touched nothing.
--
-- Resets expense_paid/expense_amount_paid to "not paid" on every one of his
-- settlement rows (nothing else is touched — net salary/loan fields and
-- approval status are left exactly as they are).
do $$
declare
  target_id uuid;
begin
  select id into target_id from public.profiles where full_name = 'Motiur Rahman' limit 1;
  if target_id is not null then
    update public.payroll_settlements
      set expense_paid = false, expense_amount_paid = 0
      where user_id = target_id
        and (expense_paid = true or coalesce(expense_amount_paid, 0) <> 0);
  end if;
end $$;
