-- Expense Claims tab needs to distinguish an advance taken (money given
-- ahead of spending) from an actual incurred expense, so their totals can
-- be summarized and netted against each other (Net Amount = Expense -
-- Advance).
ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'expense' CHECK (entry_type IN ('advance', 'expense'));
