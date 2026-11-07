-- Diagnostic only (no data changed). The prior migration
-- (20261107090000) tried to zero out Motiur Rahman's outstanding advance
-- but the card still shows -BDT 1,000.00 — meaning that migration's WHERE
-- clause matched nothing, so the real source of the figure is still
-- unknown. Dumps his expense_claims rows (via RAISE NOTICE, visible in the
-- GitHub Actions "Apply migrations" log) so the actual cause can be
-- identified before writing a real fix.
do $$
declare
  target_id uuid;
  r record;
begin
  select id into target_id from public.profiles where full_name = 'Motiur Rahman' limit 1;
  raise notice 'target_id = %', target_id;
  if target_id is not null then
    for r in
      select id, entry_type, status, amount, recovered_amount, recovery_status, claim_date, category
      from public.expense_claims
      where user_id = target_id
      order by claim_date
    loop
      raise notice 'claim id=% entry_type=% status=% amount=% recovered=% recovery_status=% date=% category=%',
        r.id, r.entry_type, r.status, r.amount, r.recovered_amount, r.recovery_status, r.claim_date, r.category;
    end loop;
  end if;
end $$;
