import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus, Pencil, Users, Search, KeyRound, Upload, Download, Trash2, Camera, Copy,
} from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const SERVICE_STATUS = ["Permanent", "Contractual", "Intern", "Short-Term", "Consultant"];
const EMPLOYEE_STATUS = ["Active", "Inactive", "Resigned"];
const WINGS = ["GMGI", "MORU"];

type EmployeeRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
  phone: string | null;
  photo_url: string | null;
  company_wing: string;
  service_status: string;
  employee_status: string;
  joining_date: string | null;
  promotion_date: string | null;
  resign_date: string | null;
  daily_ot_cap: number;
  monthly_ot_cap: number;
  reporting_manager_id: string | null;
  _role: string;
};

const EmployeeManagement = () => {
  const { role, user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [managers, setManagers] = useState<EmployeeRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterWing, setFilterWing] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [tempCredentials, setTempCredentials] = useState<{ email: string; password: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<any[] | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const initialForm = {
    full_name: "", email: "", department: "", designation: "", phone: "",
    role: "employee" as string, reporting_manager_id: "" as string,
    company_wing: "GMGI", service_status: "Permanent", employee_status: "Active",
    joining_date: "", promotion_date: "", resign_date: "",
    daily_ot_cap: "4", monthly_ot_cap: "40",
    photo_url: "" as string,
  };
  const [form, setForm] = useState(initialForm);

  const fetchEmployees = useCallback(async () => {
    setLoadingList(true);
    setFetchError(null);
    // Role-aware query: admins see all, managers see their direct reports only.
    let profilesQuery = supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (role === "manager" && user) {
      profilesQuery = profilesQuery.eq("reporting_manager_id", user.id);
    }
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      profilesQuery,
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr || rErr) {
      const msg = pErr?.message || rErr?.message || "Failed to load employees";
      console.error("[EmployeeManagement] Fetch error:", { pErr, rErr });
      setFetchError(msg);
      setLoadingList(false);
      return;
    }
    const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role as string]));
    const merged = (profiles || []).map((p: any) => ({ ...p, _role: roleMap.get(p.id) || "employee" })) as EmployeeRow[];
    setEmployees(merged);

    // Managers list = anyone in this scope who is admin/manager (used for "Reporting To" dropdown).
    // Admins additionally need full picker; fetch all when admin.
    if (role === "admin") {
      const managerIds = (roles || []).filter((r) => r.role === "manager" || r.role === "admin").map((r) => r.user_id);
      setManagers(merged.filter((m) => managerIds.includes(m.id)));
    } else {
      setManagers([]);
    }
    setLoadingList(false);
  }, [role, user]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useRealtimeSubscription("profiles", fetchEmployees, "emp-mgmt-profiles");
  useRealtimeSubscription("user_roles", fetchEmployees, "emp-mgmt-roles");

  const resetForm = () => { setForm(initialForm); setEditingId(null); };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (emp: EmployeeRow) => {
    setForm({
      full_name: emp.full_name || "", email: emp.email || "",
      department: emp.department || "", designation: emp.designation || "",
      phone: emp.phone || "", role: emp._role || "employee",
      reporting_manager_id: emp.reporting_manager_id || "",
      company_wing: emp.company_wing || "GMGI",
      service_status: emp.service_status || "Permanent",
      employee_status: emp.employee_status || "Active",
      joining_date: emp.joining_date || "", promotion_date: emp.promotion_date || "",
      resign_date: emp.resign_date || "",
      daily_ot_cap: String(emp.daily_ot_cap ?? 4),
      monthly_ot_cap: String(emp.monthly_ot_cap ?? 40),
      photo_url: emp.photo_url || "",
    });
    setEditingId(emp.id);
    setDialogOpen(true);
  };

  const handlePhotoSelect = async (file: File, userIdForPath: string) => {
    if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("Image must be under 3MB"); return; }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userIdForPath}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setForm((f) => ({ ...f, photo_url: pub.publicUrl }));
      if (editingId) {
        await supabase.from("profiles").update({ photo_url: pub.publicUrl }).eq("id", editingId);
        fetchEmployees();
      }
      toast.success("Photo uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!form.full_name || !form.email) { toast.error("Name and email are required"); return; }
    setSaving(true);
    try {
      const profilePayload: any = {
        full_name: form.full_name,
        department: form.department || null, designation: form.designation || null,
        phone: form.phone || null,
        reporting_manager_id: form.reporting_manager_id || null,
        company_wing: form.company_wing as any,
        service_status: form.service_status as any,
        employee_status: form.employee_status as any,
        joining_date: form.joining_date || null,
        promotion_date: form.promotion_date || null,
        resign_date: form.resign_date || null,
        daily_ot_cap: parseFloat(form.daily_ot_cap) || 4,
        monthly_ot_cap: parseFloat(form.monthly_ot_cap) || 40,
        photo_url: form.photo_url || null,
      };

      if (editingId) {
        const { error } = await supabase.from("profiles").update(profilePayload).eq("id", editingId);
        if (error) { toast.error(error.message); return; }
        const { data: existing } = await supabase.from("user_roles").select("id").eq("user_id", editingId).maybeSingle();
        if (existing) await supabase.from("user_roles").update({ role: form.role as any }).eq("user_id", editingId);
        else await supabase.from("user_roles").insert({ user_id: editingId, role: form.role as any });
        toast.success("Employee updated");
        setDialogOpen(false);
        resetForm();
        fetchEmployees();
      } else {
        // Admin create with temp password via edge function
        const { data, error } = await supabase.functions.invoke("admin-user-management", {
          body: {
            action: "create_user",
            payload: {
              email: form.email,
              full_name: form.full_name,
              department: form.department,
              designation: form.designation,
              phone: form.phone,
              company_wing: form.company_wing,
              service_status: form.service_status,
              employee_status: form.employee_status,
              joining_date: form.joining_date || null,
              reporting_manager_id: form.reporting_manager_id || null,
              daily_ot_cap: parseFloat(form.daily_ot_cap) || 4,
              monthly_ot_cap: parseFloat(form.monthly_ot_cap) || 40,
              role: form.role,
            },
          },
        });
        if (error || (data as any)?.error) {
          toast.error((data as any)?.error || error?.message || "Create failed"); return;
        }
        const created = data as any;
        // Apply photo if uploaded before saving
        if (form.photo_url) {
          await supabase.from("profiles").update({ photo_url: form.photo_url }).eq("id", created.userId);
        }
        setTempCredentials({ email: created.email, password: created.tempPassword });
        toast.success("Employee created");
        setDialogOpen(false);
        resetForm();
        fetchEmployees();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (emp: EmployeeRow) => {
    const { data, error } = await supabase.functions.invoke("admin-user-management", {
      body: { action: "reset_password", user_id: emp.id },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Reset failed"); return;
    }
    setTempCredentials({ email: emp.email || "", password: (data as any).tempPassword });
    toast.success("Password reset");
  };

  const handleDelete = async (emp: EmployeeRow) => {
    const { data, error } = await supabase.functions.invoke("admin-user-management", {
      body: { action: "delete_user", user_id: emp.id },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Delete failed"); return;
    }
    toast.success("Employee deleted");
    fetchEmployees();
  };

  const downloadTemplate = () => {
    const headers = [
      "full_name", "email", "department", "designation", "phone",
      "company_wing", "service_status", "employee_status",
      "joining_date", "daily_ot_cap", "monthly_ot_cap", "role",
    ];
    const sample = [
      "John Doe", "john@example.com", "Engineering", "Senior Developer", "+8801712345678",
      "GMGI", "Permanent", "Active", "2024-01-15", "4", "40", "employee",
    ];
    const csv = headers.join(",") + "\n" + sample.map((s) => `"${s}"`).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "employee_bulk_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkUpload = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast.error("CSV has no data rows"); return; }
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map((line) => {
      // simple CSV parse, supports quoted commas
      const cells: string[] = [];
      let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; continue; }
        if (c === "," && !inQ) { cells.push(cur); cur = ""; continue; }
        cur += c;
      }
      cells.push(cur);
      const obj: any = {};
      headers.forEach((h, idx) => { obj[h] = (cells[idx] || "").trim(); });
      return obj;
    });

    const payload = rows.map((r) => ({
      email: r.email,
      full_name: r.full_name,
      department: r.department,
      designation: r.designation,
      phone: r.phone,
      company_wing: r.company_wing || "GMGI",
      service_status: r.service_status || "Permanent",
      employee_status: r.employee_status || "Active",
      joining_date: r.joining_date || null,
      daily_ot_cap: parseFloat(r.daily_ot_cap) || 4,
      monthly_ot_cap: parseFloat(r.monthly_ot_cap) || 40,
      role: r.role || "employee",
    }));

    toast.info(`Uploading ${payload.length} employees...`);
    const { data, error } = await supabase.functions.invoke("admin-user-management", {
      body: { action: "bulk_create", payload },
    });
    if (error) { toast.error(error.message); return; }
    setBulkResults((data as any).results || []);
    fetchEmployees();
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return "—";
    const mgr = employees.find((e) => e.id === managerId);
    return mgr?.full_name || mgr?.email || "—";
  };

  const filtered = employees.filter((emp) => {
    const matchesSearch = !searchQuery ||
      (emp.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.department || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === "all" || emp._role === filterRole;
    const matchesWing = filterWing === "all" || emp.company_wing === filterWing;
    const matchesStatus = filterStatus === "all" || emp.employee_status === filterStatus;
    return matchesSearch && matchesRole && matchesWing && matchesStatus;
  });

  if (role !== "admin" && role !== "manager") {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Only Admins and Reporting Managers can access Employee Management.</p>
      </CardContent></Card>
    );
  }
  const isAdmin = role === "admin";

  const statusBadge = (s: string) => {
    if (s === "Active") return "bg-green-100 text-green-700 border-green-300";
    if (s === "Resigned") return "bg-red-100 text-red-700 border-red-300";
    return "bg-gray-100 text-gray-700 border-gray-300";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Employee Management</CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadTemplate}>
            <Download className="mr-1 h-4 w-4" /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => csvInputRef.current?.click()}>
            <Upload className="mr-1 h-4 w-4" /> Bulk Upload
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setBulkOpen(true); handleBulkUpload(f); }
              if (csvInputRef.current) csvInputRef.current.value = "";
            }}
          />
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> Add Employee</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Employee" : "Add New Employee"}</DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Update employee profile, role, OT caps, photo, and reporting structure."
                    : "Account is created with a temporary password shown after save. Share it securely; the user can change it after first login."}
                </DialogDescription>
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
                      if (f) handlePhotoSelect(f, editingId || crypto.randomUUID());
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
                <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} disabled={!!editingId} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} /></div>
                <div><Label>Designation</Label><Input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} /></div>
                <div>
                  <Label>Wing</Label>
                  <Select value={form.company_wing} onValueChange={(v) => setForm((f) => ({ ...f, company_wing: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{WINGS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager / Reporting Boss</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reporting To</Label>
                  <Select value={form.reporting_manager_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, reporting_manager_id: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {managers.filter((m) => m.id !== editingId).map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <DialogFooter>
                <Button onClick={handleSave} disabled={saving} className="w-full mt-3">
                  {saving ? "Saving..." : editingId ? "Update Employee" : "Create Employee"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Admin can create accounts directly with a temporary password, reset passwords, and bulk-upload via CSV.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, email, department..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterWing} onValueChange={setFilterWing}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Wings</SelectItem>
              {WINGS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {EMPLOYEE_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Wing</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Reporting Boss</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>OT Cap (D/M)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No employees found</TableCell></TableRow>
            ) : filtered.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={emp.photo_url || undefined} />
                      <AvatarFallback>{(emp.full_name || emp.email || "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{emp.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">{emp.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{emp.company_wing}</Badge></TableCell>
                <TableCell>{emp.department || "—"}</TableCell>
                <TableCell>{emp.designation || "—"}</TableCell>
                <TableCell>
                  <Badge variant={emp._role === "admin" ? "default" : emp._role === "manager" ? "secondary" : "outline"}>
                    {emp._role}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{getManagerName(emp.reporting_manager_id)}</TableCell>
                <TableCell className="text-xs">{emp.service_status}</TableCell>
                <TableCell><Badge variant="outline" className={statusBadge(emp.employee_status)}>{emp.employee_status}</Badge></TableCell>
                <TableCell className="text-xs">{emp.daily_ot_cap}h / {emp.monthly_ot_cap}h</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => openEdit(emp)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" title="Reset password">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset password?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A new temporary password will be generated for <strong>{emp.email}</strong>.
                            You'll see it once and need to share it securely.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleResetPassword(emp)}>Reset</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" title="Delete">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete employee?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes <strong>{emp.full_name || emp.email}</strong> and their login.
                            This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(emp)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Temp credentials dialog */}
      <Dialog open={!!tempCredentials} onOpenChange={(o) => !o && setTempCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary Password</DialogTitle>
            <DialogDescription>
              Share these credentials securely with the user. They can change the password after first sign-in.
            </DialogDescription>
          </DialogHeader>
          {tempCredentials && (
            <div className="space-y-3">
              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={tempCredentials.email} />
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(tempCredentials.email); toast.success("Copied"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Temporary Password</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={tempCredentials.password} className="font-mono" />
                  <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(tempCredentials.password); toast.success("Copied"); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTempCredentials(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk results dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Upload Results</DialogTitle>
            <DialogDescription>
              {bulkResults
                ? `${bulkResults.filter((r) => r.ok).length} succeeded, ${bulkResults.filter((r) => !r.ok).length} failed.`
                : "Processing..."}
            </DialogDescription>
          </DialogHeader>
          {bulkResults && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Temp Password / Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulkResults.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={r.ok ? "default" : "destructive"}>{r.ok ? "OK" : "Failed"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.tempPassword || r.error}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EmployeeManagement;
