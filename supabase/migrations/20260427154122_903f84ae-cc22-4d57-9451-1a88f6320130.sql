
-- OT: track original hours + who modified
ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS original_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS modified_by UUID,
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ;

-- Leave: track original dates / type / day_type + who modified
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS original_start_date DATE,
  ADD COLUMN IF NOT EXISTS original_end_date DATE,
  ADD COLUMN IF NOT EXISTS original_leave_type_id UUID,
  ADD COLUMN IF NOT EXISTS original_day_type leave_day_type,
  ADD COLUMN IF NOT EXISTS original_total_days NUMERIC,
  ADD COLUMN IF NOT EXISTS modified_by UUID,
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ;

-- Add 'modified' value to leave_status enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'leave_status' AND e.enumlabel = 'modified'
  ) THEN
    ALTER TYPE public.leave_status ADD VALUE 'modified';
  END IF;
END$$;

-- Notifications: add route for click-through
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS route TEXT;
