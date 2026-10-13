-- Lets an admin attach supporting images (money receipt, transfer slip,
-- etc.) to a My Payments settlement — same multi-image attachment
-- convention already used by overtime/late/leave requests.
ALTER TABLE public.payroll_settlements
  ADD COLUMN IF NOT EXISTS attachments text[] NOT NULL DEFAULT '{}';
