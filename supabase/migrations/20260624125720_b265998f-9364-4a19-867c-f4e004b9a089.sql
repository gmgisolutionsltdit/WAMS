
CREATE TABLE IF NOT EXISTS public.biometric_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  model text NOT NULL,
  protocol text NOT NULL DEFAULT 'tcp',
  ip_address text NOT NULL,
  port integer NOT NULL DEFAULT 4370,
  serial_number text NOT NULL UNIQUE,
  branch text,
  status text NOT NULL DEFAULT 'offline',
  last_sync_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.biometric_devices TO authenticated;
GRANT ALL ON public.biometric_devices TO service_role;

ALTER TABLE public.biometric_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view biometric devices"
  ON public.biometric_devices FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/HR can insert biometric devices"
  ON public.biometric_devices FOR INSERT
  TO authenticated WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
  );

CREATE POLICY "Admin/HR can update biometric devices"
  ON public.biometric_devices FOR UPDATE
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
  );

CREATE POLICY "Admin/HR can delete biometric devices"
  ON public.biometric_devices FOR DELETE
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr'::public.app_role)
  );

CREATE TRIGGER trg_biometric_devices_updated
  BEFORE UPDATE ON public.biometric_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
