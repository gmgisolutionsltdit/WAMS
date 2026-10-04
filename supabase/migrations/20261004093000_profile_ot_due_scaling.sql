-- Per-employee default scaling factors for Overtime and Due Time payroll
-- calculations, settable from the Employee Profile's Setup tab (Office
-- Hours & Work Schedule). Default 1 (no scaling) for every existing and
-- new employee. Additive only: new columns on the existing profiles table.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS overtime_scaling NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (overtime_scaling > 0),
  ADD COLUMN IF NOT EXISTS due_time_scaling NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (due_time_scaling > 0);
