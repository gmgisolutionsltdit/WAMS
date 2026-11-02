-- Trello-style card "Dates" popover needs a due time (not just a date) and
-- storage for the Recurring / "Set due date reminder" selections. These are
-- UI + stored-value only for now — nothing reads recurring/reminder to
-- actually spawn cards or send reminders yet, so both are plain nullable
-- text columns holding the selected option (e.g. "daily", "1_day_before").
ALTER TABLE public.tasks
  ALTER COLUMN due_date TYPE timestamptz USING due_date::timestamptz,
  ADD COLUMN IF NOT EXISTS recurring text,
  ADD COLUMN IF NOT EXISTS reminder text;
