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
import { Plus, Pencil, Users } from "lucide-react";

const EMPLOYMENT_TYPES = ["Permanent", "Contractual", "Pay-per-Hour", "Short Term", "Intern"];

const EmployeeManagement = () => {
  const { role } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "", email: "", department: "", role: "employee" as string,
    reporting_manager_id: "" as string, employment_type: "Permanent",
  });

  const fetchEmployees = useCallback(async () => {
    // Fetch profiles and roles separately to avoid FK join issues
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    // Merge roles into profiles
    const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));
    const merged = (profiles || []).map(p => ({
      ...p,
      _role: roleMap.get(p.id) || "employee",
    }));
    setEmployees(merged);

    // Get managers/admins for the reporting dropdown
    const managerIds = (roles || []).filter(r => r.role === "manager" || r.role === "admin").map(r => r.user_id);
    if (managerIds.length > 0) {
      const { data: managerProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", managerIds);
      setManagers(managerProfiles || []);
    }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const resetForm = () => {
    setForm({ full_name: "", email: "", department: "", role: "employee", reporting_manager_id: "", employment_type: "Permanent" });
    setEditingId(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (emp: any) => {
    setForm({
      full_name: emp.full_name || "",
      email: emp.email || "",
      department: emp.department || "",
      role: emp._role || "employee",
      reporting_manager_id: emp.reporting_manager_id || "",
      employment_type: emp.employment_type || "Permanent",
    });
    setEditingId(emp.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name || !form.email) { toast.error("Name and email are required"); return; }

    if (editingId) {
      const { error } = await supabase.from("profiles").update({
        full_name: form.full_name, email: form.email, department: form.department,
        reporting_manager_id: form.reporting_manager_id || null,
      }).eq("id", editingId);
      if (error) { toast.error(error.message); return; }

      // Update role
      await supabase.from("user_roles").update({ role: form.role as any }).eq("user_id", editingId);
      toast.success("Employee updated");
    } else {
      const newId = crypto.randomUUID();
      const { error } = await supabase.from("profiles").insert({
        id: newId, full_name: form.full_name, email: form.email,
        department: form.department, reporting_manager_id: form.reporting_manager_id || null,
      });
      if (error) { toast.error(error.message); return; }

      const { error: roleError } = await supabase.from("user_roles").insert({ user_id: newId, role: form.role as any });
      if (roleError) { toast.error(roleError.message); return; }
      toast.success("Employee created");
    }

    setDialogOpen(false);
    resetForm();
    fetchEmployees();
  };

  if (role !== "admin") {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Only Admins can access Employee Management.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Employee Management</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}><Plus className="mr-1 h-4 w-4" /> Add Employee</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editingId ? "Edit Employee" : "Add New Employee"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))} /></div>
                <div>
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v }))}>
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
                  <Select value={form.reporting_manager_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, reporting_manager_id: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {managers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Employment Type</Label>
                  <Select value={form.employment_type} onValueChange={(v) => setForm(f => ({ ...f, employment_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSave} className="w-full">{editingId ? "Update" : "Create"} Employee</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No employees</TableCell></TableRow>
              ) : employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.full_name || "—"}</TableCell>
                  <TableCell>{emp.email || "—"}</TableCell>
                  <TableCell>{emp.department || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={emp._role === "admin" ? "default" : emp._role === "manager" ? "secondary" : "outline"}>
                      {emp._role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => openEdit(emp)}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeManagement;
