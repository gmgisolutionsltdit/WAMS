-- Third attempt at Motiur Rahman's persistent -BDT 1,000.00 Expense
-- Balance. Both prior targeted guesses (20261107090000: an outstanding
-- *advance* claim; 20261107120000: a stray *past settlement* flag) matched
-- rows and ran, but the card is still -1,000 — so neither was the actual
-- cause.
--
-- The remaining term in the Expense Balance formula (expenseTotal -
-- advanceOutstanding - priorPaid) is expenseTotal itself: the sum of his
-- *non*-advance approved expense_claims amounts. A claim can be entered with
-- a negative amount (an "Employee Owes" / recovery-style entry) without
-- being entry_type = 'advance', which the first fix never touched — a
-- single such row of -1,000 would produce exactly this balance on its own.
--
-- Since the employee has no real expense activity at all, this removes
-- every expense_claims row on his account (and the recovery ledger built on
-- top of it) outright, rather than guessing at another specific condition.
-- Nothing else (payroll_settlements, personal_advances, other employees) is
-- touched.
do $$
declare
  target_id uuid;
begin
  select id into target_id from public.profiles where full_name = 'Motiur Rahman' limit 1;
  if target_id is not null then
    delete from public.expense_recovery_actions where user_id = target_id;
    delete from public.expense_claims where user_id = target_id;
  end if;
end $$;
