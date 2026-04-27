import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Users, Search } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const SERVICE_STATUS = ["Permanent", "Contractual", "Intern", "Short-Term", "Consultant"];
const EMPLOYEE_STATUS = ["Active", "Inactive", "Resigned"];
const WINGS = ["GMGI", "MORU"];

const EmployeeManagement = () => {
  const { role } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterWing, setFilterWing] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const initialForm = {
    full_name: "", email: "", department: "", designation: "", phone: "",
    role: "employee" as string, reporting_manager_id: "" as string,
    company_wing: "GMGI", service_status: "Permanent", employee_status: "Active",
    joining_date: "", promotion_date: "", resign_date: "",
    daily_ot_cap: "4", monthly_ot_cap: "40",
  };
  const [form, setForm] = useState(initialForm);

  const fetchEmployees = useCallback(async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role]));
    const merged = (profiles || []).map((p) => ({ ...p, _role: roleMap.get(p.id) || "employee" }));
    setEmployees(merged);

    const managerIds = (roles || []).filter((r) => r.role === "manager" || r.role === "admin").map((r) => r.user_id);
    setManagers(merged.filter((m) => managerIds.includes(m.id)));
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useRealtimeSubscription("profiles", fetchEmployees, "emp-mgmt-profiles");
  useRealtimeSubscription("user_roles", fetchEmployees, "emp-mgmt-roles");

  const resetForm = () => { setForm(initialForm); setEditingId(null); };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (emp: any) => {
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
    });
    setEditingId(emp.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name || !form.email) { toast.error("Name and email are required"); return; }
    const payload: any = {
      full_name: form.full_name, email: form.email,
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
    };

    if (editingId) {
      const { error } = await supabase.from("profiles").update(payload).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
      // Upsert role
      const { data: existing } = await supabase.from("user_roles").select("id").eq("user_id", editingId).maybeSingle();
      if (existing) await supabase.from("user_roles").update({ role: form.role as any }).eq("user_id", editingId);
      else await supabase.from("user_roles").insert({ user_id: editingId, role: form.role as any });
      toast.success("Employee updated");
    } else {
      toast.error("New employees must sign up themselves; assign role/details after they create their account.");
      return;
    }
    setDialogOpen(false); resetForm(); fetchEmployees();
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

  if (role !== "admin") {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Only Admins can access Employee Management.</p>
      </CardContent></Card>
    );
  }

  const statusBadge = (s: string) => {
    if (s === "Active") return "bg-green-100 text-green-700 border-green-300";
    if (s === "Resigned") return "bg-red-100 text-red-700 border-red-300";
    return "bg-gray-100 text-gray-700 border-gray-300";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Employee Management</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate} disabled><Plus className="mr-1 h-4 w-4" /> Add Employee</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Employee" : "Add New Employee"}</DialogTitle></DialogHeader>
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
            <Button onClick={handleSave} className="w-full mt-3">{editingId ? "Update" : "Create"} Employee</Button>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          New employees join by signing up with their email; once they exist here you can edit their wing, role, manager, and OT caps.
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
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Wing</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Reporting Boss</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>OT Cap (D/M)</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground">No employees found</TableCell></TableRow>
            ) : filtered.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.full_name || "—"}</TableCell>
                <TableCell className="text-xs">{emp.email}</TableCell>
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
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => openEdit(emp)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default EmployeeManagement;
