-- Allow an employee to report to more than one manager. The single-value
-- reporting_manager_id column is kept (and kept in sync with the first
-- entry of the new array) since the management-chain / supervisor RLS
-- helpers and existing reporting-based queries still key off it; the new
-- array column is what the "Reporting To" multi-select in Employee
-- Management now reads and writes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reporting_manager_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE public.profiles
SET reporting_manager_ids = ARRAY[reporting_manager_id]
WHERE reporting_manager_id IS NOT NULL AND reporting_manager_ids = '{}';
