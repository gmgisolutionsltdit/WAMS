-- Payment: Personal Advance (a loan recovered by payroll deduction in
-- installments) and Expense Advance (a float for company work, settled by
-- receipts, never auto-deducted).
--
-- Additive only, following the append-only-ledger convention established by
-- 20261002090000_payroll_adjustments.sql: every "edit" to an advance's
-- running state after creation is recorded as a new row in its *_actions
-- ledger table, which carries no UPDATE/DELETE policy at all (SELECT +
-- INSERT only) — nothing already written there is ever changed or removed
-- by policy. The advance rows themselves (personal_advances /
-- expense_advances) do get UPDATE policies, because their status/balance
-- fields are mutable summaries whose full history lives in the ledger.
--
-- user_id columns reference public.profiles(id) explicitly (inline
-- REFERENCES, default constraint name "<table>_user_id_fkey") so the
-- PostgREST embed `profiles!personal_advances_user_id_fkey(...)` /
-- `profiles!expense_advances_user_id_fkey(...)` resolves for the app,
-- mirroring the fix applied to expense_claims in
-- 20260913100000_expense_claims_user_fk.sql.

-- Personal Advance (a loan recovered by payroll deduction in installments)
CREATE TABLE IF NOT EXISTS public.personal_advances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT,
  installments INTEGER NOT NULL CHECK (installments > 0),
  monthly_deduction NUMERIC(12,2) NOT NULL CHECK (monthly_deduction > 0),
  remaining_balance NUMERIC(12,2) NOT NULL CHECK (remaining_balance >= 0),
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'closed'
  approved_by UUID,
  approver_note TEXT,
  approved_at TIMESTAMPTZ,
  admin_flag BOOLEAN NOT NULL DEFAULT FALSE,
  admin_flag_note TEXT,
  converted_from_expense_advance_id UUID, -- set when this row was auto-created by the settle_by-missed conversion; FK added after expense_advances exists
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.personal_advance_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  personal_advance_id UUID NOT NULL REFERENCES public.personal_advances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'issued' | 'payroll_deduction' | 'closed' | 'admin_flag' | 'resignation_flag'
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_after NUMERIC(12,2),
  month DATE, -- first of month, for 'payroll_deduction' rows
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expense Advance (a float for company work, not a loan, not auto-deducted)
CREATE TABLE IF NOT EXISTS public.expense_advances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  purpose TEXT,
  settle_by DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'settled' | 'converted'
  approved_by UUID,
  approver_note TEXT,
  approved_at TIMESTAMPTZ,
  receipts JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{url, amount, uploaded_at}]
  spent_total NUMERIC(12,2),
  settlement_direction TEXT, -- 'refund_to_company' | 'reimburse_to_employee' | NULL (exact match, no excess/shortfall)
  settlement_amount NUMERIC(12,2),
  settled_at TIMESTAMPTZ,
  converted_to_personal_advance_id UUID REFERENCES public.personal_advances(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_advances
  ADD CONSTRAINT personal_advances_converted_from_fkey
  FOREIGN KEY (converted_from_expense_advance_id) REFERENCES public.expense_advances(id);

CREATE TABLE IF NOT EXISTS public.expense_advance_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_advance_id UUID NOT NULL REFERENCES public.expense_advances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'issued' | 'approved' | 'rejected' | 'receipt_added' | 'settled' | 'converted_to_personal_advance'
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Duplicate/overlap guard: one active advance of each type per employee at a time.
CREATE UNIQUE INDEX IF NOT EXISTS personal_advances_one_active_per_user
  ON public.personal_advances(user_id) WHERE status IN ('pending','approved');
CREATE UNIQUE INDEX IF NOT EXISTS expense_advances_one_active_per_user
  ON public.expense_advances(user_id) WHERE status IN ('pending','approved');

GRANT SELECT, INSERT, UPDATE ON public.personal_advances TO authenticated;
GRANT SELECT, INSERT ON public.personal_advance_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.expense_advances TO authenticated;
GRANT SELECT, INSERT ON public.expense_advance_actions TO authenticated;
GRANT ALL ON public.personal_advances, public.personal_advance_actions, public.expense_advances, public.expense_advance_actions TO service_role;

ALTER TABLE public.personal_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_advance_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_advance_actions ENABLE ROW LEVEL SECURITY;

-- personal_advances
CREATE POLICY "Users view own or approvable personal advances" ON public.personal_advances
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.can_approve(auth.uid(), user_id)
  );
CREATE POLICY "Users create own personal advances" ON public.personal_advances
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "Approvers update personal advances" ON public.personal_advances
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.can_approve(auth.uid(), user_id)
  );

-- personal_advance_actions (append-only: SELECT + INSERT, no UPDATE/DELETE policy at all)
CREATE POLICY "View personal advance ledger" ON public.personal_advance_actions
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.can_approve(auth.uid(), user_id)
  );
CREATE POLICY "Record personal advance ledger entries" ON public.personal_advance_actions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.can_approve(auth.uid(), user_id)
  );

-- expense_advances
CREATE POLICY "Users view own or approvable expense advances" ON public.expense_advances
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.can_approve(auth.uid(), user_id)
  );
CREATE POLICY "Users create own expense advances" ON public.expense_advances
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "Approvers update expense advances" ON public.expense_advances
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'admin') OR public.can_approve(auth.uid(), user_id)
  );
CREATE POLICY "Owner settles own approved expense advance" ON public.expense_advances
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'approved');

-- expense_advance_actions (append-only)
CREATE POLICY "View expense advance ledger" ON public.expense_advance_actions
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.can_approve(auth.uid(), user_id)
  );
CREATE POLICY "Record expense advance ledger entries" ON public.expense_advance_actions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.can_approve(auth.uid(), user_id)
  );

CREATE TRIGGER trg_personal_advances_updated BEFORE UPDATE ON public.personal_advances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_expense_advances_updated BEFORE UPDATE ON public.expense_advances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
