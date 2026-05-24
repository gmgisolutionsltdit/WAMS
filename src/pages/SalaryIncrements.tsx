import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Wallet, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Increment = {
  id: string;
  user_id: string;
  cycle_label: string;
  effective_from: string;
  effective_to: string | null;
  base_salary: number;
  increment_amount: number;
  increment_pct: number;
  reason: string | null;
  approved_by: string | null;
  created_at: string;
};

type Profile = { id: string; full_name: string | null; email: string | null };

const emptyForm = () => ({
  user_id: "",
  cycle_label: "",
  effective_from: "",
  effective_to: "",
  base_salary: 0,
  increment_amount: 0,
  increment_pct: 0,
  reason: "",
});

const SalaryIncrements = () => {
  const { user, role } = useAuth();
  const canManage = role === "admin" || role === "hr" || role === "executive";

  const [records, setRecords] = useState<Increment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [filterUser, setFilterUser] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles]);

  const fetchAll = useCallback(async () => {
    const [{ data: recs }, { data: pf }] = await Promise.all([
      supabase.from("salary_increments").select("*").order("effective_from", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
    ]);
    setRecords((recs || []) as Increment[]);
    setProfiles((pf || []) as Profile[]);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const visible = useMemo(() => {
    if (filterUser === "all") return records;
    return records.filter((r) => r.user_id === filterUser);
  }, [records, filterUser]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (rec: Increment) => {
    setEditId(rec.id);
    setForm({
      user_id: rec.user_id,
      cycle_label: rec.cycle_label,
      effective_from: rec.effective_from,
      effective_to: rec.effective_to || "",
      base_salary: Number(rec.base_salary),
      increment_amount: Number(rec.increment_amount),
      increment_pct: Number(rec.increment_pct),
      reason: rec.reason || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.user_id || !form.cycle_label || !form.effective_from) {
      toast.error("Employee, cycle label and effective-from date are required");
      return;
    }
    setLoading(true);
    const payload = {
      user_id: form.user_id,
      cycle_label: form.cycle_label,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      base_salary: Number(form.base_salary) || 0,
      increment_amount: Number(form.increment_amount) || 0,
      increment_pct: Number(form.increment_pct) || 0,
      reason: form.reason || null,
      approved_by: user?.id || null,
    };
    const { error } = editId
      ? await supabase.from("salary_increments").update(payload).eq("id", editId)
      : await supabase.from("salary_increments").insert(payload);
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? "Salary increment updated" : "Salary increment added");
    setOpen(false);
    fetchAll();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this salary increment record?")) return;
    const { error } = await supabase.from("salary_increments").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); fetchAll(); }
  };

  const fmtMoney = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Salary Increment Ledger
          </h2>
          <p className="text-sm text-muted-foreground">
            Historical record of salary changes per employee. Cycles can overlap for audit & projection.
          </p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Increment</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editId ? "Edit Salary Increment" : "Add Salary Increment"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Employee</Label>
                  <Select value={form.user_id} onValueChange={(v) => setForm((f) => ({ ...f, user_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cycle Label</Label>
                  <Input placeholder="e.g., Jan 25 – Dec 25"
                    value={form.cycle_label}
                    onChange={(e) => setForm((f) => ({ ...f, cycle_label: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Effective From</Label>
                    <Input type="date" value={form.effective_from}
                      onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Effective To</Label>
                    <Input type="date" value={form.effective_to}
                      onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Base Salary</Label>
                    <Input type="number" step="0.01" value={form.base_salary}
                      onChange={(e) => setForm((f) => ({ ...f, base_salary: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label>Increment Amt</Label>
                    <Input type="number" step="0.01" value={form.increment_amount}
                      onChange={(e) => setForm((f) => ({ ...f, increment_amount: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label>Increment %</Label>
                    <Input type="number" step="0.01" value={form.increment_pct}
                      onChange={(e) => setForm((f) => ({ ...f, increment_pct: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div>
                  <Label>Reason / Note</Label>
                  <Textarea value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="Annual review, promotion, market adjustment…" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Increment History</CardTitle>
          <CardDescription>Overlapping cycles are supported.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs">
            <Label className="text-xs">Filter by employee</Label>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Increment</TableHead>
                <TableHead>Reason</TableHead>
                {canManage && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground">
                    No salary increment records
                  </TableCell>
                </TableRow>
              ) : visible.map((r) => {
                const p = profileMap[r.user_id];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{p?.full_name || p?.email || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.cycle_label}</Badge></TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(r.effective_from), "MMM d, yyyy")}
                      {r.effective_to && <> → {format(new Date(r.effective_to), "MMM d, yyyy")}</>}
                    </TableCell>
                    <TableCell className="text-right">{fmtMoney(r.base_salary)}</TableCell>
                    <TableCell className="text-right">
                      +{fmtMoney(r.increment_amount)}
                      {r.increment_pct > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">({r.increment_pct}%)</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{r.reason || "—"}</TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SalaryIncrements;
