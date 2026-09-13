-- expense_claims.user_id was never given a foreign key to profiles, so the
-- PostgREST embed `profiles!expense_claims_user_id_fkey(...)` used by the
-- Expenses page could not resolve — every select on the table errored, and
-- because the client only read `data` (not `error`), the claims list simply
-- rendered empty. Submitting a claim always worked; only reading it back
-- failed, which looked identical to "nothing was created" from the UI.
--
-- Backfill any orphaned rows first so the constraint can be added cleanly.
DELETE FROM public.expense_claims ec
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ec.user_id);

ALTER TABLE public.expense_claims
  DROP CONSTRAINT IF EXISTS expense_claims_user_id_fkey;
ALTER TABLE public.expense_claims
  ADD CONSTRAINT expense_claims_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.expense_claims
  DROP CONSTRAINT IF EXISTS expense_claims_approver_id_fkey;
ALTER TABLE public.expense_claims
  ADD CONSTRAINT expense_claims_approver_id_fkey
  FOREIGN KEY (approver_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
