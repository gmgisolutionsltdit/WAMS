-- One-off data cleanup. Ayon Pal's expense/advance test data accumulated an
-- inconsistent recovered_amount (drifted up to ~29,000) from many rounds of
-- manually testing the My Payments carry-forward/recovery feature tonight,
-- predating the reverseSettlementLedgers net-reversal fix — every delete +
-- re-record cycle before that fix re-reversed rounds an earlier delete had
-- already reversed, compounding the drift each time. That fix stops it
-- happening again, but can't retroactively repair data it already corrupted.
-- Resets this one test employee's ledger (and the test settlements/recovery
-- log built on top of it) back to a clean baseline; nothing else is touched.
do $$
declare
  target_id uuid;
begin
  select id into target_id from public.profiles where full_name = 'Ayon Pal' limit 1;
  if target_id is not null then
    delete from public.expense_recovery_actions where user_id = target_id;
    delete from public.payroll_settlements where user_id = target_id;
    update public.expense_claims
      set recovered_amount = 0, recovery_status = 'open'
      where user_id = target_id;
  end if;
end $$;
