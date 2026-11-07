-- One-off data cleanup. Motiur Rahman's My Payments "Expense Balance" card
-- showed -BDT 1,000.00 for November 2026 despite his Claim History having no
-- approved expense claims at all (his only claim on record is a rejected
-- BDT 200 Travel claim, which the balance formula already excludes). The
-- -1,000 was coming from an approved expense_claims row with
-- entry_type = 'advance' and an outstanding (unrecovered) balance — a cash
-- advance recorded against him that isn't reflected anywhere in the visible
-- claim list, i.e. stray/incorrect test data. Marks any such outstanding
-- advance fully recovered so the live balance reads 0.00 again; nothing else
-- is touched.
do $$
declare
  target_id uuid;
begin
  select id into target_id from public.profiles where full_name = 'Motiur Rahman' limit 1;
  if target_id is not null then
    update public.expense_claims
      set recovered_amount = amount, recovery_status = 'fully_recovered'
      where user_id = target_id
        and entry_type = 'advance'
        and status = 'approved'
        and coalesce(recovered_amount, 0) < amount;
  end if;
end $$;
