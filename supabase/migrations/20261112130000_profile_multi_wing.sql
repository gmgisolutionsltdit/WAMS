-- An employee can belong to more than one company wing. profiles keeps its
-- existing wing_id/company_wing as the PRIMARY wing — every existing
-- attendance/payroll/overtime/holiday calculation keys off that single
-- value and keeps doing so unchanged. This table tracks the full set of
-- wings an employee belongs to (the primary wing included), editable from
-- the Profile Overview tab, admin-only.
CREATE TABLE IF NOT EXISTS public.profile_wings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wing_id UUID NOT NULL REFERENCES public.company_wings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, wing_id)
);

CREATE INDEX IF NOT EXISTS profile_wings_profile_idx ON public.profile_wings (profile_id);

-- Backfill: every profile's existing single wing becomes its first
-- membership row, so nothing regresses for employees who never get edited
-- again under the new multi-select UI.
INSERT INTO public.profile_wings (profile_id, wing_id)
SELECT p.id, p.wing_id FROM public.profiles p
WHERE p.wing_id IS NOT NULL
ON CONFLICT (profile_id, wing_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_wings TO authenticated;
ALTER TABLE public.profile_wings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wing memberships"
  ON public.profile_wings FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

CREATE POLICY "Managers view their direct reports' wing memberships"
  ON public.profile_wings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = profile_wings.profile_id
        AND (pr.reporting_manager_id = auth.uid() OR pr.reporting_manager_ids @> ARRAY[auth.uid()])
    )
  );

CREATE POLICY "Admins manage wing memberships"
  ON public.profile_wings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
