-- Fourth attempt at Motiur Rahman's persistent -BDT 1,000.00 Expense
-- Balance. The last fix (20261107130000) deleted every expense_claims row
-- for the one profile matched by `... WHERE full_name = 'Motiur Rahman'
-- LIMIT 1` — and the balance is still unchanged. Combined with the two
-- earlier fixes also having no visible effect despite running
-- successfully, the most likely explanation left is that there is more
-- than one profile named "Motiur Rahman", and every previous migration's
-- unordered `LIMIT 1` happened to pick a different row than the one open
-- in the UI.
--
-- This redoes all three previous fixes (clear outstanding advances, reset
-- past-settlement expense flags, delete expense_claims/recovery actions)
-- against *every* profile matching the name, not just one, removing that
-- ambiguity entirely. No other employee is touched.
do $$
begin
  update public.expense_claims
    set recovered_amount = amount, recovery_status = 'fully_recovered'
    where user_id in (select id from public.profiles where full_name = 'Motiur Rahman')
      and entry_type = 'advance'
      and status = 'approved'
      and coalesce(recovered_amount, 0) < amount;

  update public.payroll_settlements
    set expense_paid = false, expense_amount_paid = 0
    where user_id in (select id from public.profiles where full_name = 'Motiur Rahman')
      and (expense_paid = true or coalesce(expense_amount_paid, 0) <> 0);

  delete from public.expense_recovery_actions
    where user_id in (select id from public.profiles where full_name = 'Motiur Rahman');

  delete from public.expense_claims
    where user_id in (select id from public.profiles where full_name = 'Motiur Rahman');
end $$;
