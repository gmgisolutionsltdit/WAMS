import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Banknote, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// This page is the HR/admin view of the same loans ("personal advances")
// an employee requests from Payment > Loans — both read and write
// public.personal_advances, so a loan issued here shows up there (and in
// the employee's own My Payments Loan Due card) immediately, and vice
// versa. Issuing a loan here skips the request/approval step: it's
// inserted already status 'approved', same end state a request reaches
// once an admin/manager approves it from the Payment > Loans tab.
const Loans = () => {
  const { user, role } = useAuth();
  const canManage = role === "admin";
  const [loans, setLoans] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ user_id: "", principal_amount: "", monthly_deduction: "", installments: "1", start_date: format(new Date(), "yyyy-MM-dd"), reason: "" });

  const fetchLoans = async () => {
    const { data, error } = await supabase
      .from("personal_advances")
      .select("*, profiles!personal_advances_user_id_fkey(full_name,email)")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setLoans(data || []);
  };
  const fetchEmployees = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
    setEmployees(data || []);
  };

  useEffect(() => { fetchLoans(); if (canManage) fetchEmployees(); }, [canManage]);

  const create = async () => {
    if (!user) return;
    if (!form.user_id || !form.principal_amount || !form.monthly_deduction) return toast.error("Fill required fields");
    const principal = Number(form.principal_amount);
    const monthly = Number(form.monthly_deduction);
    const installments = Math.max(1, Math.round(Number(form.installments) || 1));
    const { data: inserted, error } = await supabase.from("personal_advances").insert({
      user_id: form.user_id,
      amount: principal,
      monthly_deduction: monthly,
      installments,
      remaining_balance: principal,
      reason: form.reason || null,
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    }).select().single();
    if (error) {
      if (error.code === "23505") return toast.error("This employee already has an active loan.");
      return toast.error(error.message);
    }
    // Same ledger entry the Payment > Loans tab's own approval writes, so
    // this loan's history reads the same regardless of how it started.
    await supabase.from("personal_advance_actions").insert({
      personal_advance_id: inserted.id, user_id: form.user_id, action_type: "issued",
      amount: principal, remaining_after: principal, created_by: user.id,
    });
    toast.success("Loan created");
    setOpen(false);
    setForm({ user_id: "", principal_amount: "", monthly_deduction: "", installments: "1", start_date: format(new Date(), "yyyy-MM-dd"), reason: "" });
    fetchLoans();
  };

  const closeLoan = async (id: string) => {
    await supabase.from("personal_advances").update({ status: "closed", remaining_balance: 0 }).eq("id", id);
    toast.success("Loan closed");
    fetchLoans();
  };

  const totalActive = loans.filter(l => l.status === "approved").reduce((s, l) => s + Number(l.remaining_balance), 0);
  const monthlyDeduction = loans.filter(l => l.status === "approved").reduce((s, l) => s + Number(l.monthly_deduction), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Employee Loans</h1>
          <p className="text-sm text-muted-foreground">Track active loans and monthly payroll deductions.</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Loan</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Issue Loan</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Employee</Label>
                  <Select value={form.user_id} onValueChange={(v)=>setForm({...form, user_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Principal</Label><Input type="number" value={form.principal_amount} onChange={(e)=>setForm({...form, principal_amount: e.target.value})} /></div>
                  <div><Label>Monthly Deduction</Label><Input type="number" value={form.monthly_deduction} onChange={(e)=>setForm({...form, monthly_deduction: e.target.value})} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Installments</Label><Input type="number" min="1" value={form.installments} onChange={(e)=>setForm({...form, installments: e.target.value})} /></div>
                  <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e)=>setForm({...form, start_date: e.target.value})} /></div>
                </div>
                <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e)=>setForm({...form, reason: e.target.value})} /></div>
              </div>
              <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardDescription>Active Loans</CardDescription><CardTitle className="text-2xl">{loans.filter(l => l.status === "approved").length}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Outstanding Balance</CardDescription><CardTitle className="text-2xl">{totalActive.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Next Payroll Deduction</CardDescription><CardTitle className="text-2xl text-warning">{monthlyDeduction.toLocaleString()}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5 text-primary" />Loan Ledger</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead><TableHead>Principal</TableHead><TableHead>Remaining</TableHead><TableHead>Monthly</TableHead><TableHead>Progress</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loans.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No loans yet</TableCell></TableRow> :
                loans.map(l => {
                  const pct = l.amount > 0 ? ((l.amount - l.remaining_balance) / l.amount) * 100 : 0;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{l.profiles?.full_name || l.profiles?.email || "—"}</TableCell>
                      <TableCell>{Number(l.amount).toLocaleString()}</TableCell>
                      <TableCell className="font-semibold">{Number(l.remaining_balance).toLocaleString()}</TableCell>
                      <TableCell>{Number(l.monthly_deduction).toLocaleString()}</TableCell>
                      <TableCell className="w-40"><Progress value={pct} /><span className="text-xs text-muted-foreground">{pct.toFixed(0)}% paid</span></TableCell>
                      <TableCell>
                        {l.status === "approved" ? <Badge className="bg-success text-white"><AlertCircle className="h-3 w-3 mr-1" />Active</Badge> :
                          l.status === "pending" ? <Badge variant="outline">Pending</Badge> :
                          l.status === "rejected" ? <Badge className="bg-destructive text-white">Rejected</Badge> :
                          <Badge variant="outline"><CheckCircle2 className="h-3 w-3 mr-1" />Closed</Badge>}
                      </TableCell>
                      <TableCell>{canManage && l.status === "approved" && <Button size="sm" variant="outline" onClick={()=>closeLoan(l.id)}>Close</Button>}</TableCell>
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

export default Loans;
