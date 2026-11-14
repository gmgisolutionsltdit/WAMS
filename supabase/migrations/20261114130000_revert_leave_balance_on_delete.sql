-- An approved leave_requests row debits leave_balances.used via plain
-- application code at approval time (Approvals.tsx's applyLeaveBalance),
-- not a trigger. Deleting the request afterward (admin "Delete this leave
-- request") only removed the request row — the days it had debited stayed
-- consumed on leave_balances forever, same bug class as the late-time one
-- fixed in 20261114120000.
--
-- This reverts that debit automatically whenever an approved leave_requests
-- row is deleted, regardless of which delete path was used.
CREATE OR REPLACE FUNCTION public.revert_leave_balance_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    UPDATE public.leave_balances
    SET used = GREATEST(0, used - COALESCE(OLD.total_days, 0))
    WHERE user_id = OLD.user_id
      AND leave_type_id = OLD.leave_type_id
      AND year = EXTRACT(YEAR FROM OLD.start_date)::int;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_revert_leave_balance_on_delete ON public.leave_requests;
CREATE TRIGGER trg_revert_leave_balance_on_delete
  AFTER DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.revert_leave_balance_on_delete();

-- No backfill here (unlike the late-time fix): leave_balances.used is a
-- single running total with no per-request attribution left behind once a
-- request is deleted, so there's no reliable signal to find and correct
-- past over-counts the way approved_start_time let us for attendance_logs.
