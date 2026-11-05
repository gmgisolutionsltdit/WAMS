-- employee_loans.user_id was defined without a foreign key to profiles, but
-- Loans.tsx's fetchLoans() embeds profiles via the name Postgres/PostgREST
-- would auto-generate for one ("employee_loans_user_id_fkey"). Without the
-- actual constraint, that embed can't be resolved, so the select errors out
-- (silently — the caller discards the error) and the Loan Ledger never shows
-- anything, including a loan that was just successfully created.
ALTER TABLE public.employee_loans
  ADD CONSTRAINT employee_loans_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
