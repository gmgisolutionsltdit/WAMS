-- Requests Activity feed on Notice Board gets an "archive" concept (soft-hide,
-- same idea as notices' is_active) instead of the hard per-row delete: an
-- archived row keeps its data and can be restored, and is excluded from the
-- default feed in favor of a "View Archived Activity" toggle.

ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.late_time_requests ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.manual_time_requests ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.overtime_requests ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Whoever could already decide (admin/manager, via can_approve()) can change
-- any column via the existing "Approvers decide ... requests" UPDATE
-- policies. This adds the matching self-service case for an owner archiving
-- their own row at any status, including leave (archiving isn't destructive
-- the way delete was, so there's no reason to exclude it here).
--
-- RLS can't restrict which columns an UPDATE touches, and the frontend is
-- not a trust boundary — a user could otherwise call supabase.from(...).update
-- directly and self-approve a *decided* request by sending {status: 'approved'}
-- alongside {archived: true}. The trigger below closes that off: when the
-- actor is the row's own owner, not someone who could approve it (i.e. not
-- an admin/manager acting on themselves either — same "not their own
-- approver" rule used elsewhere in this schema), and the row is no longer
-- pending, every column except `archived` (and the auto-maintained
-- `updated_at`) must stay unchanged, or the update is rejected outright.
--
-- A still-pending row is deliberately exempted: the pre-existing
-- "Users update own pending X" policies already let an owner update their
-- own pending row more broadly (e.g. LeaveManagement.cancel sets
-- status: 'cancelled' on a pending request) — that's unchanged, legitimate
-- behavior this trigger must not break.
CREATE OR REPLACE FUNCTION public.enforce_owner_archive_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_j jsonb := to_jsonb(OLD) - 'archived' - 'updated_at';
  new_j jsonb := to_jsonb(NEW) - 'archived' - 'updated_at';
BEGIN
  IF auth.uid() = OLD.user_id AND NOT public.can_approve(auth.uid(), OLD.user_id) AND OLD.status <> 'pending' THEN
    IF old_j <> new_j THEN
      RAISE EXCEPTION 'Only the archived flag can be changed by the request owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE POLICY "Users archive own leave requests"
  ON public.leave_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users archive own late requests"
  ON public.late_time_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users archive own manual time requests"
  ON public.manual_time_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users archive own OT requests"
  ON public.overtime_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER enforce_owner_archive_only_leave
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_archive_only();

CREATE TRIGGER enforce_owner_archive_only_late
  BEFORE UPDATE ON public.late_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_archive_only();

CREATE TRIGGER enforce_owner_archive_only_manual
  BEFORE UPDATE ON public.manual_time_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_archive_only();

CREATE TRIGGER enforce_owner_archive_only_ot
  BEFORE UPDATE ON public.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_archive_only();
