import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Cpu, Plus, RefreshCw, Trash2, Wifi, ServerCog, Inbox, Loader2 } from "lucide-react";

type Device = {
  id: string;
  name: string;
  model: string;
  protocol: string;
  ip_address: string;
  port: number;
  serial_number: string;
  branch: string | null;
  status: string;
  last_sync_at: string | null;
};

const MODELS = ["ZKTeco F18", "ZKTeco K40", "ZKTeco F22", "MultiBio 700"];

const deviceSchema = z.object({
  name: z.string().trim().min(2, "Name required").max(60),
  model: z.string().min(1, "Pick a model"),
  protocol: z.enum(["tcp", "adms"]),
  ip_address: z.string().trim().min(3, "IP/Domain required").max(120),
  port: z.coerce.number().int().min(1).max(65535),
  serial_number: z.string().trim().min(3, "Serial required").max(60),
  branch: z.string().trim().min(2, "Branch required").max(60),
});

type FormState = z.input<typeof deviceSchema>;
const empty: FormState = { name: "", model: MODELS[0], protocol: "tcp", ip_address: "", port: 4370, serial_number: "", branch: "" };

export function BiometricDevicePanel() {
  const { user, role } = useAuth();
  const canManage = role === "admin" || role === "hr";
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("biometric_devices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDevices((data || []) as Device[]);
    } catch (err) {
      console.error("[BiometricDevicePanel] fetch failed", err);
      toast.error("Failed to load biometric devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const submit = async () => {
    const parsed = deviceSchema.safeParse(form);
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { if (i.path[0]) map[String(i.path[0])] = i.message; });
      setErrors(map);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload = {
        name: parsed.data.name,
        model: parsed.data.model,
        protocol: parsed.data.protocol,
        ip_address: parsed.data.ip_address,
        port: parsed.data.port,
        serial_number: parsed.data.serial_number,
        branch: parsed.data.branch,
        status: "offline",
        created_by: user?.id ?? null,
      };
      const { error } = await supabase.from("biometric_devices").insert(payload);
      if (error) throw error;
      toast.success("Biometric device registered");
      setForm(empty);
      fetchDevices();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Insert failed";
      console.error("[BiometricDevicePanel] insert failed", err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const ping = async (d: Device) => {
    try {
      const { error } = await supabase
        .from("biometric_devices")
        .update({ status: "online", last_sync_at: new Date().toISOString() })
        .eq("id", d.id);
      if (error) throw error;
      toast.success(`Synced ${d.name}`);
      fetchDevices();
    } catch (err) {
      console.error("[BiometricDevicePanel] sync failed", err);
      toast.error("Sync failed");
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await supabase.from("biometric_devices").delete().eq("id", id);
      if (error) throw error;
      toast.success("Device removed");
      setDevices((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      console.error("[BiometricDevicePanel] delete failed", err);
      toast.error("Delete failed");
    }
  };

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-800">
          <ServerCog className="h-5 w-5 text-emerald-600" /> Biometric & Hardware Configuration
        </CardTitle>
        <CardDescription>Register ZKTeco / MultiBio terminals stored in the production database.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canManage ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <Field label="Device Custom Name" error={errors.name}>
              <Input value={form.name} placeholder="Main Lobby F18" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Device Model" error={errors.model}>
              <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Connection Protocol" error={errors.protocol}>
              <Select value={form.protocol} onValueChange={(v: "tcp" | "adms") => setForm({ ...form, protocol: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tcp">Standalone IP / TCP</SelectItem>
                  <SelectItem value="adms">Cloud Webhook (ADMS)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Field label="IP Address / Domain" error={errors.ip_address}>
                  <Input value={form.ip_address} placeholder="192.168.1.201" onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
                </Field>
              </div>
              <Field label="Port" error={errors.port}>
                <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Serial Number" error={errors.serial_number}>
              <Input value={form.serial_number} placeholder="CKM9234500123" onChange={(e) => setForm({ ...form, serial_number: e.target.value })} />
            </Field>
            <Field label="Office Branch / Location" error={errors.branch}>
              <Input value={form.branch} placeholder="HQ — Floor 3" onChange={(e) => setForm({ ...form, branch: e.target.value })} />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={submit} disabled={submitting} className="bg-slate-900 hover:bg-slate-800 text-white">
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Register Device
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-muted-foreground">
            Only Admin or HR roles can register new biometric devices.
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Cpu className="h-4 w-4" /> Registered Terminals
          </h3>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : devices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground">
              <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-400" />
              No biometric devices registered yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {devices.map((d) => (
                <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.model} · {d.branch ?? "—"}</div>
                    </div>
                    <Badge className={d.status === "online" ? "bg-emerald-600" : d.status === "syncing" ? "bg-amber-500" : "bg-slate-400"}>
                      <Wifi className="h-3 w-3 mr-1" />
                      {d.status}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="text-muted-foreground">Protocol</div><div className="text-slate-700 font-mono">{d.protocol.toUpperCase()}</div>
                    <div className="text-muted-foreground">Endpoint</div><div className="text-slate-700 font-mono">{d.ip_address}:{d.port}</div>
                    <div className="text-muted-foreground">Serial</div><div className="text-slate-700 font-mono">{d.serial_number}</div>
                    {d.last_sync_at && (<>
                      <div className="text-muted-foreground">Last Sync</div>
                      <div className="text-slate-700 font-mono">{new Date(d.last_sync_at).toLocaleString()}</div>
                    </>)}
                  </div>
                  {canManage && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => ping(d)}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium text-slate-600">{label}</Label>
    {children}
    {error && <p className="text-[11px] text-red-600">{error}</p>}
  </div>
);
