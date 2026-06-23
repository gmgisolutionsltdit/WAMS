import { useEffect, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Cpu, Plus, RefreshCw, Trash2, Wifi, ServerCog, Inbox } from "lucide-react";

type Device = {
  id: string;
  name: string;
  model: string;
  protocol: "tcp" | "adms";
  ip: string;
  port: number;
  serial: string;
  branch: string;
  status: "online" | "offline" | "syncing";
};

const MODELS = ["ZKTeco F18", "ZKTeco K40", "ZKTeco F22", "MultiBio 700"];
const STORAGE = "hrms_biometric_devices";

const deviceSchema = z.object({
  name: z.string().trim().min(2, "Name required").max(60),
  model: z.string().min(1, "Pick a model"),
  protocol: z.enum(["tcp", "adms"]),
  ip: z.string().trim().min(3, "IP/Domain required").max(120),
  port: z.coerce.number().int().min(1).max(65535),
  serial: z.string().trim().min(3, "Serial required").max(60),
  branch: z.string().trim().min(2, "Branch required").max(60),
});

type FormState = { name: string; model: string; protocol: "tcp" | "adms"; ip: string; port: number; serial: string; branch: string };
const empty: FormState = { name: "", model: MODELS[0], protocol: "tcp", ip: "", port: 4370, serial: "", branch: "" };

export function BiometricDevicePanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    try { setDevices(JSON.parse(localStorage.getItem(STORAGE) || "[]")); } catch { /* noop */ }
  }, []);

  const persist = (list: Device[]) => {
    setDevices(list);
    localStorage.setItem(STORAGE, JSON.stringify(list));
  };

  const submit = () => {
    const parsed = deviceSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { errs[i.path[0] as string] = i.message; });
      setErrors(errs);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    const dev: Device = { id: crypto.randomUUID(), ...parsed.data, status: "online" };
    persist([dev, ...devices]);
    setForm(empty);
    toast.success(`${dev.name} registered & online`);
  };

  const ping = (d: Device) => {
    persist(devices.map((x) => x.id === d.id ? { ...x, status: "syncing" } : x));
    setTimeout(() => {
      persist(devices.map((x) => x.id === d.id ? { ...x, status: "online" } : x));
      toast.success(`Synced attendance logs from ${d.name}`);
    }, 1400);
  };

  const remove = (id: string) => {
    persist(devices.filter((x) => x.id !== id));
    toast.success("Device removed");
  };

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-800">
          <ServerCog className="h-5 w-5 text-emerald-600" /> Biometric & Hardware Configuration
        </CardTitle>
        <CardDescription>Register ZKTeco / MultiBio terminals and monitor live sync status.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <Field label="Device Custom Name" error={errors.name}>
            <Input value={form.name} placeholder="Main Lobby F18"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
              <Field label="IP Address / Domain" error={errors.ip}>
                <Input value={form.ip} placeholder="192.168.1.201"
                  onChange={(e) => setForm({ ...form, ip: e.target.value })} />
              </Field>
            </div>
            <Field label="Port" error={errors.port}>
              <Input type="number" value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Serial Number" error={errors.serial}>
            <Input value={form.serial} placeholder="CKM9234500123"
              onChange={(e) => setForm({ ...form, serial: e.target.value })} />
          </Field>
          <Field label="Office Branch / Location" error={errors.branch}>
            <Input value={form.branch} placeholder="HQ — Floor 3"
              onChange={(e) => setForm({ ...form, branch: e.target.value })} />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={submit} className="bg-slate-900 hover:bg-slate-800 text-white">
              <Plus className="h-4 w-4 mr-1" /> Register Device
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Cpu className="h-4 w-4" /> Registered Terminals
          </h3>
          {devices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground">
              <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-400" />
              No biometric devices registered yet. Add one above to begin syncing attendance logs.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {devices.map((d) => (
                <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.model} · {d.branch}</div>
                    </div>
                    <Badge className={d.status === "online" ? "bg-emerald-600" : d.status === "syncing" ? "bg-amber-500" : "bg-slate-400"}>
                      <Wifi className="h-3 w-3 mr-1" />
                      {d.status === "online" ? "Online" : d.status === "syncing" ? "Syncing…" : "Offline"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="text-muted-foreground">Protocol</div><div className="text-slate-700 font-mono">{d.protocol.toUpperCase()}</div>
                    <div className="text-muted-foreground">Endpoint</div><div className="text-slate-700 font-mono">{d.ip}:{d.port}</div>
                    <div className="text-muted-foreground">Serial</div><div className="text-slate-700 font-mono">{d.serial}</div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => ping(d)} disabled={d.status === "syncing"}>
                      <RefreshCw className={`h-3.5 w-3.5 mr-1 ${d.status === "syncing" ? "animate-spin" : ""}`} />
                      Sync Logs
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => remove(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
