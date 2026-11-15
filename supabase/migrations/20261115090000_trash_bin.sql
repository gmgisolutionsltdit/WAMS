-- Trash Bin: deleting an Overtime/Manual Time/Loan/Expense history row no
-- longer destroys it immediately — the app moves a full snapshot here
-- first, restorable for 30 days by an admin from the Trash page, after
-- which it's gone for good (purged automatically, or the moment an admin
-- opens Trash past that window). Late Time and Leave are deliberately
-- excluded — restoring either would re-insert the row without replaying
-- the attendance-stamp / leave-balance side effect that only fires
-- through the real approval code path, never on a raw insert — so those
-- two always go straight to a permanent delete instead (see
-- Approvals.tsx's deleteLate/deleteLeave).
CREATE TABLE IF NOT EXISTS public.trash_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('overtime','manual_time','loan','expense')),
  source_table text NOT NULL,
  original_id uuid NOT NULL,
  data jsonb NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_reason text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

ALTER TABLE public.trash_bin ENABLE ROW LEVEL SECURITY;

-- Whoever the source table's own RLS already lets delete a row can also
-- move it to Trash — the app always does both in the same action, as
-- themselves.
CREATE POLICY "Authenticated insert into trash" ON public.trash_bin
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = deleted_by);

-- Only admins can see, restore from, or permanently empty the bin.
CREATE POLICY "Admins manage trash" ON public.trash_bin
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_trash_bin_entity_type ON public.trash_bin(entity_type);
CREATE INDEX IF NOT EXISTS idx_trash_bin_expires_at ON public.trash_bin(expires_at);

-- Deletes anything past its 30-day restore window. Called by the daily
-- pg_cron job below when available, and also by the Trash page itself on
-- every load so expired rows disappear immediately even on a project
-- where pg_cron isn't enabled.
CREATE OR REPLACE FUNCTION public.purge_expired_trash()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.trash_bin WHERE expires_at < now();
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_trash() TO authenticated;

-- Try to enable pg_cron so Trash purges itself daily even if nobody opens
-- the page. Some hosting tiers don't permit this from a migration — never
-- let that fail the whole deploy; it just means expired rows only clear
-- out the next time an admin visits Trash instead.
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
EXCEPTION WHEN insufficient_privilege OR feature_not_supported THEN
  RAISE NOTICE 'pg_cron could not be enabled from this migration — enable it from the Supabase dashboard so Trash purges automatically.';
END $$;

-- Run once a day. Re-running this migration must not create a second
-- schedule for the same job name.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-expired-trash';
    PERFORM cron.schedule('purge-expired-trash', '0 3 * * *', 'SELECT public.purge_expired_trash();');
  END IF;
END $$;
