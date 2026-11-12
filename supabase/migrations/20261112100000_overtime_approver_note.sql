-- Rejecting an overtime request is about to become mandatory-note, like
-- manual time requests already are, but overtime_requests never had a
-- column to store that note.
ALTER TABLE public.overtime_requests ADD COLUMN IF NOT EXISTS approver_note TEXT;
