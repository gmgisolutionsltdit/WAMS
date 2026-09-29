import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { DEFAULT_GRACE_MINUTES, DEFAULT_OFFICE_END, DEFAULT_OFFICE_START } from "@/lib/officeTime";
import { DEFAULT_WORKING_DAYS } from "@/lib/workSchedule";

const SERVICE_STATUS = ["Permanent", "Contractual", "Intern", "Short-Term", "Consultant"];
const EMPLOYEE_STATUS = ["Active", "Inactive", "Resigned"];
const LEGACY_WINGS = ["GMGI", "MORU"];
const DOW = [
  { v: 0, label: "Sun" }, { v: 1, label: "Mon" }, { v: 2, label: "Tue" }, { v: 3, label: "Wed" },
  { v: 4, label: "Thu" }, { v: 5, label: "Fri" }, { v: 6, label: "Sat" },
];

type WingRow = { id: string; name: string; code: string; active: boolean };

interface Props {
  employee: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  canEditPayroll: boolean;
  onSaved?: () => void;
}

/**
 * Full employee-editing form — the fields formerly in Employee Management's
 * "Edit Employee" popup — now used from an employee's own directory page.
 */
export const EmployeeEditDialog = ({ employee, open, onOpenChange, isAdmin, canEditPayroll, onSaved }: Props) => {
  const [managers, setManagers] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [wings, setWings] = useState<WingRow[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; key: string }[]>([]);
  const [memberProjectIds, setMemberProjectIds] = useState<string[]>([]);
  const [addWingOpen, setAddWingOpen] = useState(false);
  const [newWing, setNewWing] = useState({ name: "", code: "" });
  const [savingWing, setSavingWing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManageWings = isAdmin;

  const [form, setForm] = useState({
    full_name: "", department: "", designation: "", phone: "",
    role: "employee" as string, reporting_manager_ids: [] as string[],
    company_wing: "GMGI", wing_id: "" as string,
    service_status: "Permanent", employee_status: "Active",
    joining_date: "", promotion_date: "", resign_date: "",
    daily_ot_cap: "4", monthly_ot_cap: "40",
    photo_url: "" as string,
    base_salary: "0", hourly_overtime_rate: "0", pf_contribution_pct: "0",
    project_ids: [] as string[],
    office_start_time: DEFAULT_OFFICE_START, office_end_time: DEFAULT_OFFICE_END,
    standard_daily_hours: "8", unpaid_break_minutes: "60",
    late_grace_minutes: String(DEFAULT_GRACE_MINUTES),
    working_days: [...DEFAULT_WORKING_DAYS] as number[],
  });

  const wingIdFor = (emp: { wing_id?: string | null; company_wing?: string | null }) =>
    emp.wing_id || wings.find((w) => w.name === emp.company_wing)?.id || "";

  useEffect(() => {
    if (!open || !employee) return;
    (async () => {
      const [{ data: mgrs }, { data: wingRows }, { data: projectRows }, { data: memberRows }] = await Promise.all([
        supabase.rpc("manager_candidates"),
        supabase.from("company_wings").select("id, name, code, active").order("name", { ascending: true }),
        supabase.from("projects").select("id, name, key").eq("archived", false).order("name", { ascending: true }),
        supabase.from("project_members").select("project_id").eq("user_id", employee.id),
      ]);
      setManagers(mgrs || []);
      const wingList = (wingRows || []) as WingRow[];
      setWings(wingList);
      setProjects((projectRows || []) as { id: string; name: string; key: string }[]);
      setMemberProjectIds((memberRows || []).map((m: { project_id: string }) => m.project_id));

      const wingId = employee.wing_id || wingList.find((w) => w.name === employee.company_wing)?.id || "";
      setForm({
        full_name: employee.full_name || "", department: employee.department || "",
        designation: employee.designation || "", phone: employee.phone || "",
        role: employee._role || "employee",
        reporting_manager_ids: employee.reporting_manager_ids?.length
          ? employee.reporting_manager_ids
          : (employee.reporting_manager_id ? [employee.reporting_manager_id] : []),
        company_wing: employee.company_wing || "GMGI",
        wing_id: wingId,
        service_status: employee.service_status || "Permanent",
        employee_status: employee.employee_status || "Active",
        joining_date: employee.joining_date || "", promotion_date: employee.promotion_date || "",
        resign_date: employee.resign_date || "",
        daily_ot_cap: String(employee.daily_ot_cap ?? 4),
        monthly_ot_cap: String(employee.monthly_ot_cap ?? 40),
        photo_url: employee.photo_url || "",
        base_salary: String(employee.base_salary ?? 0),
        hourly_overtime_rate: String(employee.hourly_overtime_rate ?? 0),
        pf_contribution_pct: String(employee.pf_contribution_pct ?? 0),
        project_ids: (memberRows || []).map((m: { project_id: string }) => m.project_id),
        office_start_time: (employee.office_start_time || DEFAULT_OFFICE_START).slice(0, 5),
        office_end_time: (employee.office_end_time || DEFAULT_OFFICE_END).slice(0, 5),
        standard_daily_hours: String(employee.standard_daily_hours ?? 8),
        unpaid_break_minutes: String(employee.unpaid_break_minutes ?? 60),
        late_grace_minutes: String(employee.late_grace_minutes ?? DEFAULT_GRACE_MINUTES),
        working_days: (employee.working_days?.length ? employee.working_days.map(Number) : [...DEFAULT_WORKING_DAYS]),
      });
    })();
  }, [open, employee]);

  const activeWings = wings.filter((w) => w.active);

  const handlePhotoSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("Image must be under 3MB"); return; }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${employee.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm((f) => ({ ...f, photo_url: pub.publicUrl }));
      await supabase.from("profiles").update({ photo_url: pub.publicUrl }).eq("id", employee.id);
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCreateWing = async () => {
    const name = newWing.name.trim();
    const code = (newWing.code.trim() || name.slice(0, 4)).toUpperCase();
    if (!name) { toast.error("Wing name is required"); return; }
    setSavingWing(true);
    try {
      const { data, error } = await supabase
        .from("company_wings")
        .insert({ name, code, active: true })
        .select("id, name, code, active")
        .single();
      if (error) { toast.error(error.message); return; }
      const created = data as WingRow;
      setWings((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({
        ...f,
        wing_id: created.id,
        company_wing: LEGACY_WINGS.includes(created.name) ? created.name : f.company_wing,
      }));
      setNewWing({ name: "", code: "" });
      setAddWingOpen(false);
      toast.success(`Wing "${created.name}" created`);
    } finally {
      setSavingWing(false);
    }
  };

  const syncProjectMembers = async () => {
    const current = memberProjectIds;
    const selected = form.project_ids;
    const added = selected.filter((id) => !current.includes(id));
    const removed = current.filter((id) => !selected.includes(id));
    if (added.length) {
      const { error } = await supabase
        .from("project_members")
        .upsert(added.map((project_id) => ({ project_id, user_id: employee.id })), { onConflict: "project_id,user_id" });
      if (error) toast.error(`Project assignment failed: ${error.message}`);
    }
    if (removed.length) {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("user_id", employee.id)
        .in("project_id", removed);
      if (error) toast.error(`Project removal failed: ${error.message}`);
    }
  };

  const handleSave = async () => {
    if (!form.full_name) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const selectedWing = wings.find((w) => w.id === form.wing_id);
      const legacyWing = selectedWing && LEGACY_WINGS.includes(selectedWing.name)
        ? selectedWing.name
        : form.company_wing;
      const profilePayload: any = {
        full_name: form.full_name,
        department: form.department || null, designation: form.designation || null,
        phone: form.phone || null,
        reporting_manager_id: form.reporting_manager_ids[0] || null,
        reporting_manager_ids: form.reporting_manager_ids,
        company_wing: legacyWing as any,
        wing_id: form.wing_id || null,
        service_status: form.service_status as any,
        employee_status: form.employee_status as any,
        joining_date: form.joining_date || null,
        promotion_date: form.promotion_date || null,
        resign_date: form.resign_date || null,
        daily_ot_cap: parseFloat(form.daily_ot_cap) || 4,
        monthly_ot_cap: parseFloat(form.monthly_ot_cap) || 40,
        photo_url: form.photo_url || null,
        office_start_time: `${form.office_start_time}:00`,
        office_end_time: `${form.office_end_time}:00`,
        standard_daily_hours: parseFloat(form.standard_daily_hours) || 8,
        unpaid_break_minutes: parseInt(form.unpaid_break_minutes, 10) || 0,
        late_grace_minutes: parseInt(form.late_grace_minutes, 10) || 0,
        working_days: form.working_days.length ? [...form.working_days].sort((a, b) => a - b) : [...DEFAULT_WORKING_DAYS],
      };
      if (canEditPayroll) {
        profilePayload.base_salary = parseFloat(form.base_salary) || 0;
        profilePayload.hourly_overtime_rate = parseFloat(form.hourly_overtime_rate) || 0;
        profilePayload.pf_contribution_pct = parseFloat(form.pf_contribution_pct) || 0;
      }

      const { error } = await supabase.from("profiles").update(profilePayload).eq("id", employee.id);
      if (error) { toast.error(error.message); return; }
      const { data: existing } = await supabase.from("user_roles").select("id").eq("user_id", employee.id).maybeSingle();
      if (existing) await supabase.from("user_roles").update({ role: form.role as any }).eq("user_id", employee.id);
      else await supabase.from("user_roles").insert({ user_id: employee.id, role: form.role as any });
      await syncProjectMembers();
      toast.success("Employee updated");
      onOpenChange(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
          <DialogDescription>Update employee profile, role, OT caps, photo, and reporting structure.</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-4 mb-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={form.photo_url || undefined} />
            <AvatarFallback>{(form.full_name || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhotoSelect(f);
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
              <Camera className="mr-1 h-4 w-4" />
              {uploadingPhoto ? "Uploading…" : "Upload Photo"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">JPG / PNG, up to 3MB</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Full Name *</Label><Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} /></div>
          <div><Label>Email</Label><Input type="email" value={employee.email || ""} disabled /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} /></div>
          <div><Label>Designation</Label><Input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} /></div>
          <div>
            <Label>Wing</Label>
            <Select
              value={form.wing_id || "none"}
              onValueChange={(v) => {
                if (v === "__add__") { setAddWingOpen(true); return; }
                const w = wings.find((x) => x.id === v);
                setForm((f) => ({
                  ...f,
                  wing_id: v === "none" ? "" : v,
                  company_wing: w && LEGACY_WINGS.includes(w.name) ? w.name : f.company_wing,
                }));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select wing" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {activeWings.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                {canManageWings && <SelectItem value="__add__">+ Add new wing</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Projects</Label>
            {projects.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                No active projects yet — create one on the Projects page to assign it here.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-2 rounded-md border p-2 max-h-32 overflow-y-auto">
                {projects.map((p) => {
                  const checked = form.project_ids.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm cursor-pointer ${checked ? "bg-primary/10 border-primary/40" : ""}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          setForm((f) => ({
                            ...f,
                            project_ids: checked
                              ? f.project_ids.filter((id) => id !== p.id)
                              : [...f.project_ids, p.id],
                          }))
                        }
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))} disabled={!isAdmin}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager / Reporting Boss</SelectItem>
                <SelectItem value="employee">Employee</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reporting To <span className="text-xs text-muted-foreground">(select one or more)</span></Label>
            <div className="rounded-md border p-2 max-h-36 overflow-y-auto space-y-1">
              {managers.filter((m) => m.id !== employee.id).length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">No managers/admins available</p>
              ) : managers.filter((m) => m.id !== employee.id).map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm px-1 py-0.5">
                  <Checkbox
                    checked={form.reporting_manager_ids.includes(m.id)}
                    onCheckedChange={() =>
                      setForm((f) => ({
                        ...f,
                        reporting_manager_ids: f.reporting_manager_ids.includes(m.id)
                          ? f.reporting_manager_ids.filter((x) => x !== m.id)
                          : [...f.reporting_manager_ids, m.id],
                      }))
                    }
                  />
                  {m.full_name || m.email}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>Service Status</Label>
            <Select value={form.service_status} onValueChange={(v) => setForm((f) => ({ ...f, service_status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Employee Status</Label>
            <Select value={form.employee_status} onValueChange={(v) => setForm((f) => ({ ...f, employee_status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EMPLOYEE_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Joining Date</Label><Input type="date" value={form.joining_date} onChange={(e) => setForm((f) => ({ ...f, joining_date: e.target.value }))} /></div>
          <div><Label>Promotion Date</Label><Input type="date" value={form.promotion_date} onChange={(e) => setForm((f) => ({ ...f, promotion_date: e.target.value }))} /></div>
          <div><Label>Resign Date</Label><Input type="date" value={form.resign_date} onChange={(e) => setForm((f) => ({ ...f, resign_date: e.target.value }))} /></div>
          <div></div>
          <div><Label>Daily OT Cap (hrs)</Label><Input type="number" step="0.5" value={form.daily_ot_cap} onChange={(e) => setForm((f) => ({ ...f, daily_ot_cap: e.target.value }))} /></div>
          <div><Label>Monthly OT Cap (hrs)</Label><Input type="number" step="1" value={form.monthly_ot_cap} onChange={(e) => setForm((f) => ({ ...f, monthly_ot_cap: e.target.value }))} /></div>
        </div>

        <div className="mt-5 rounded-md border p-3 bg-muted/30">
          <Label className="text-sm font-semibold">Office Hours &amp; Work Schedule</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            This employee's own schedule. Attendance, late arrival, due time, overtime and leave are all
            calculated against these values.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Office Start</Label>
              <Input type="time" value={form.office_start_time}
                onChange={(e) => setForm((f) => ({ ...f, office_start_time: e.target.value }))} />
            </div>
            <div>
              <Label>Office End</Label>
              <Input type="time" value={form.office_end_time}
                onChange={(e) => setForm((f) => ({ ...f, office_end_time: e.target.value }))} />
            </div>
            <div>
              <Label>Standard Shift Hours</Label>
              <Input type="number" step="0.5" min="0.5" max="24" value={form.standard_daily_hours}
                onChange={(e) => setForm((f) => ({ ...f, standard_daily_hours: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground mt-1">Office window length, break included.</p>
            </div>
            <div>
              <Label>Daily Break Allowance (minutes)</Label>
              <Input type="number" step="5" min="0" value={form.unpaid_break_minutes}
                onChange={(e) => setForm((f) => ({ ...f, unpaid_break_minutes: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground mt-1">Unpaid break inside the office window.</p>
            </div>
            <div>
              <Label>Late Grace (minutes)</Label>
              <Input type="number" step="1" min="0" value={form.late_grace_minutes}
                onChange={(e) => setForm((f) => ({ ...f, late_grace_minutes: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground mt-1">Arriving later than this counts as late.</p>
            </div>
            <div className="col-span-2">
              <Label>Working Days <span className="text-xs text-muted-foreground">(unchecked days count as weekend)</span></Label>
              <div className="flex flex-wrap gap-3 mt-1">
                {DOW.map((d) => (
                  <label key={d.v} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={form.working_days.includes(d.v)}
                      onCheckedChange={() =>
                        setForm((f) => ({
                          ...f,
                          working_days: f.working_days.includes(d.v)
                            ? f.working_days.filter((x) => x !== d.v)
                            : [...f.working_days, d.v].sort((a, b) => a - b),
                        }))
                      }
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {canEditPayroll && (
          <div className="mt-5 rounded-md border p-3 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Compensation</Label>
              <Badge variant="outline" className="text-[10px]">Admin only</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Update base salary on promotion or revision. Changes take effect on the next payroll generation.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Base Salary (monthly)</Label>
                <Input type="number" step="0.01" min="0" value={form.base_salary}
                  onChange={(e) => setForm((f) => ({ ...f, base_salary: e.target.value }))} />
              </div>
              <div>
                <Label>Hourly OT Rate</Label>
                <Input type="number" step="0.01" min="0" value={form.hourly_overtime_rate}
                  onChange={(e) => setForm((f) => ({ ...f, hourly_overtime_rate: e.target.value }))} />
              </div>
              <div>
                <Label>PF Contribution (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={form.pf_contribution_pct}
                  onChange={(e) => setForm((f) => ({ ...f, pf_contribution_pct: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full mt-3">
            {saving ? "Saving..." : "Update Employee"}
          </Button>
        </DialogFooter>

        {/* Add wing dialog */}
        <Dialog open={addWingOpen} onOpenChange={(o) => { setAddWingOpen(o); if (!o) setNewWing({ name: "", code: "" }); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add New Wing</DialogTitle>
              <DialogDescription>Create a company wing and assign it to this employee.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Wing Name *</Label>
                <Input value={newWing.name} onChange={(e) => setNewWing((w) => ({ ...w, name: e.target.value }))} placeholder="e.g. Logistics" />
              </div>
              <div>
                <Label>Short Code</Label>
                <Input value={newWing.code} onChange={(e) => setNewWing((w) => ({ ...w, code: e.target.value }))} placeholder="e.g. LOG" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddWingOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateWing} disabled={savingWing}>{savingWing ? "Saving…" : "Create Wing"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeEditDialog;
