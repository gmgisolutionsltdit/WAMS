-- Restoring from Trash by upserting the stored snapshot straight from the
-- client ran as the admin's own auth session, which hit each table's own
-- INSERT policy — "insert your own row" in most cases, since
-- overtime_requests and expense_claims never got an admin-insert-for-
-- anyone-else policy the way personal_advances and manual_time_requests
-- did. Restoring someone else's trashed OT or expense claim as an admin
-- was silently blocked by RLS ("new row violates row-level security
-- policy for table overtime_requests").
--
-- A SECURITY DEFINER function sidesteps this cleanly instead of auditing
-- and patching INSERT policies across four separate tables (and whichever
-- more join Trash later): it checks the caller is an admin itself, then
-- writes the row with elevated privileges regardless of the source
-- table's own policies.
CREATE OR REPLACE FUNCTION public.restore_from_trash(_trash_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.trash_bin;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can restore from Trash';
  END IF;

  SELECT * INTO _row FROM public.trash_bin WHERE id = _trash_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trash entry not found';
  END IF;

  -- jsonb_populate_record maps the stored snapshot onto the real table's
  -- column set, silently ignoring any extra keys (a joined "profiles" or
  -- "approver" object the admin UI's own select embedded for display) —
  -- so this works even if a future caller forgets to strip those first.
  EXECUTE format(
    'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
    _row.source_table, _row.source_table
  ) USING _row.data;

  DELETE FROM public.trash_bin WHERE id = _trash_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_from_trash(uuid) TO authenticated;
