-- Office time change requests may now be submitted for any effective date -
-- remove the lead-time/window restriction entirely (previously: at least 1
-- day ahead, then narrowed to a 2-day window).
DROP TRIGGER IF EXISTS trg_late_time_lead_time ON public.late_time_requests;
DROP FUNCTION IF EXISTS public.enforce_office_time_lead_time();
