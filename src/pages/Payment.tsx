import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X, FileText, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { notifyManagersAndAdmins, notifyEmployee } from "@/lib/notifications";
import { MONTHS, applyDuePersonalAdvanceDeduction, type PayrollProfile } from "@/lib/payroll";
import { PayrollAdjustments } from "@/components/PayrollAdjustments";
import { monthsInRange, fmtBDT } from "@/lib/payrollAdjustments";
import { computeMonthlySalaryRows, type SalaryMonthRow } from "@/lib/salaryMonthly";

const Payment = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  // canApprove per-row is determined by can_approve() via RLS visibility — for
  // showing approve/reject buttons client-side, treat any row visible in the
  // approvable list as approvable by the current viewer (RLS already filtered
  // what they can see/update).
  const canApprove = role === "admin" || role === "manager";

  const [loans, setLoans] = useState<any[]>([]);

  const [requestOpen, setRequestOpen] = useState(false);
  const [loanRequestForm, setLoanRequestForm] = useState({ amount: "", reason: "", installments: "1" });

  const [deductDialogId, setDeductDialogId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const fetchAll = async () => {
    const { data, error } = await supabase
      .from("personal_advances")
      .select("*, profiles!personal_advances_user_id_fkey(full_name,email,photo_url,employee_status)")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setLoans(data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const mine = loans.filter((l) => l.user_id === user?.id);
  // Loans tab: an approver sees everyone's requests (with approve/reject
  // built into each row); everyone else sees only their own.
  const loanRows = canApprove ? loans : mine;

  const hasActiveLoan = loans.some((l) => l.user_id === user?.id && ["pending", "approved"].includes(l.status));

  const submitLoanRequest = async () => {
    if (!user) return;
    const amount = Number(loanRequestForm.amount);
    const installments = Math.max(1, Math.round(Number(loanRequestForm.installments) || 1));
    if (!amount || amount <= 0) return toast.error("Amount must be greater than 0");
    if (hasActiveLoan) return toast.error("You already have an active loan request.");
    const monthlyDeduction = Math.round((amount / installments) * 100) / 100;
    const { data: inserted, error } = await supabase.from("personal_advances").insert({
      user_id: user.id,
      amount,
      reason: loanRequestForm.reason || null,
      installments,
      monthly_deduction: monthlyDeduction,
      remaining_balance: amount,
    }).select().single();
    if (error) {
      if ((error as any).code === "23505") return toast.error("You already have an active loan request.");
      return toast.error(error.message);
    }
    toast.success("Loan requested");
    setRequestOpen(false);
    setLoanRequestForm({ amount: "", reason: "", installments: "1" });
    await notifyManagersAndAdmins(
      "Loan Requested",
      `${user.email} requested a loan of ${amount}.`,
      inserted?.id,
      { route: "/payment", type: "personal_advance", requesterId: user.id },
    );
    fetchAll();
  };

  const decide = async (loan: any, status: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase.from("personal_advances").update({
      status, approved_by: user.id, approved_at: new Date().toISOString(),
    }).eq("id", loan.id);
    if (error) return toast.error(error.message);

    if (status === "approved") {
      await supabase.from("personal_advance_actions").insert({
        personal_advance_id: loan.id, user_id: loan.user_id, action_type: "issued",
        amount: loan.amount, remaining_after: loan.amount, created_by: user.id,
      });
    }
    // Rejection: no ledger row — rejecting is terminal and no balance ever
    // existed, so an 'issued' row would misrepresent the event, and
    // 'rejected' is not among the documented personal_advance_actions
    // action_type values.

    toast.success(`Loan ${status}`);
    await notifyEmployee(
      loan.user_id,
      `Loan ${status === "approved" ? "Approved" : "Rejected"}`,
      `Your loan request of ${loan.amount} was ${status}.`,
      loan.id,
      { route: "/payment", type: "personal_advance_update" },
    );
    fetchAll();
  };

  // Kept as a manual fallback for off-cycle corrections — Personal Advance
  // deductions are now applied automatically whenever payroll is generated
  // (see applyDuePersonalAdvanceDeduction, called from PayrollTab below).
  // Both paths share that same function, so whichever runs first for a given
  // month "wins" and the other becomes a no-op — never a double deduction.
  const recordDeduction = async (loan: any) => {
    if (!user) return;
    setRecording(true);
    try {
      const { data: profileRow, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, designation, department, company_wing, joining_date, base_salary, hourly_overtime_rate, pf_contribution_pct, employee_status")
        .eq("id", loan.user_id)
        .single();
      if (profErr || !profileRow) { toast.error(profErr?.message || "Employee profile not found"); return; }
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const result = await applyDuePersonalAdvanceDeduction(profileRow as PayrollProfile, year, month, user.id);
      if (result.status === "already_recorded") {
        toast.error("This month's deduction was already recorded (possibly via payroll generation).");
        return;
      }
      if (result.status === "no_active_advance") {
        toast.error("No active loan found for this employee.");
        return;
      }
      if (result.status === "nothing_due") {
        toast.error("Nothing could be deducted — net pay for this month is 0 or less.");
        return;
      }
      toast.success(`Recorded deduction of ${result.amount.toFixed(2)}`);
      setDeductDialogId(null);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record deduction");
    } finally {
      setRecording(false);
    }
  };

  const isResigned = (loan: any) => loan.profiles?.employee_status === "Resigned";

  const renderRow = (loan: any, showEmployee: boolean) => (
    <TableRow key={loan.id}>
      {showEmployee && <TableCell>{loan.profiles?.full_name || loan.profiles?.email || "—"}</TableCell>}
      <TableCell>{format(new Date(loan.created_at), "MMM d, yyyy")}</TableCell>
      <TableCell className="font-semibold">{Number(loan.amount).toLocaleString()}</TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{loan.reason || "—"}</TableCell>
      <TableCell>{loan.installments} installment{loan.installments === 1 ? "" : "s"} · {Number(loan.monthly_deduction).toLocaleString()}/mo</TableCell>
      <TableCell>{Number(loan.remaining_balance).toLocaleString()} left</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 flex-wrap">
          <Badge className={
            loan.status === "approved" ? "bg-success text-white" :
            loan.status === "rejected" ? "bg-destructive text-white" : ""
          } variant={loan.status === "pending" ? "outline" : undefined}>{loan.status}</Badge>
          {loan.admin_flag && (
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Flagged</Badge>
          )}
          {isResigned(loan) && Number(loan.remaining_balance) > 0 && (
            <Badge variant="destructive">Outstanding — employee resigned</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {canApprove && loan.status === "pending" && loan.user_id !== user?.id && (
            <>
              <Button size="icon" variant="outline" onClick={() => decide(loan, "approved")}><Check className="h-4 w-4 text-success" /></Button>
              <Button size="icon" variant="outline" onClick={() => decide(loan, "rejected")}><X className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
          {loan.status === "approved" && Number(loan.remaining_balance) > 0 && canApprove && loan.user_id !== user?.id && (
            <Button size="sm" variant="outline" onClick={() => setDeductDialogId(loan.id)}>Record This Month's Deduction</Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  const deductLoan = deductDialogId ? loans.find((l) => l.id === deductDialogId) : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Payment</h1>
          <p className="text-sm text-muted-foreground">Loans, Salary and Expense — one place for payment and payroll.</p>
        </div>
      </div>

      <Tabs defaultValue="loans">
        <TabsList>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="expense">Expense</TabsTrigger>
          {isAdmin && <TabsTrigger value="my-payments">My Payments</TabsTrigger>}
        </TabsList>

        <TabsContent value="loans" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={requestOpen} onOpenChange={(o) => { setRequestOpen(o); if (!o) setLoanRequestForm({ amount: "", reason: "", installments: "1" }); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Request Loan</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Request a Loan</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount</Label><Input type="number" value={loanRequestForm.amount} onChange={(e) => setLoanRequestForm((f) => ({ ...f, amount: e.target.value }))} /></div>
                    <div><Label>Installments</Label><Input type="number" min="1" value={loanRequestForm.installments} onChange={(e) => setLoanRequestForm((f) => ({ ...f, installments: e.target.value }))} /></div>
                  </div>
                  <div><Label>Reason</Label><Textarea value={loanRequestForm.reason} onChange={(e) => setLoanRequestForm((f) => ({ ...f, reason: e.target.value }))} /></div>
                </div>
                <DialogFooter><Button onClick={submitLoanRequest}>Submit</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    {canApprove && <TableHead>Employee</TableHead>}
                    <TableHead>Date</TableHead><TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead><TableHead>Installments</TableHead><TableHead>Balance</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loanRows.length === 0 ? (
                    <TableRow><TableCell colSpan={canApprove ? 8 : 7} className="text-center text-muted-foreground">No loan requests</TableCell></TableRow>
                  ) : loanRows.map((loan) => renderRow(loan, canApprove))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {isAdmin && <AdminLoanSituationTable />}
        </TabsContent>

        <TabsContent value="salary">
          <PayrollTab />
        </TabsContent>

        <TabsContent value="expense">
          <ExpenseClaimsTab />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="my-payments">
            <MyPaymentsTab />
          </TabsContent>
        )}
      </Tabs>

      {/* Record This Month's Deduction dialog */}
      <Dialog open={!!deductDialogId} onOpenChange={(o) => { if (!o) setDeductDialogId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record This Month's Deduction</DialogTitle></DialogHeader>
          {deductLoan && (
            <div className="space-y-2 text-sm">
              <p>Month: {format(new Date(), "MMMM yyyy")}</p>
              <p>Monthly deduction: {Number(deductLoan.monthly_deduction).toLocaleString()}</p>
              <p>Remaining balance: {Number(deductLoan.remaining_balance).toLocaleString()}</p>
              <p className="text-muted-foreground">Proposed amount: {Math.min(Number(deductLoan.monthly_deduction), Number(deductLoan.remaining_balance)).toLocaleString()} (may be further capped by this month's net pay)</p>
            </div>
          )}
          <DialogFooter><Button onClick={() => deductLoan && recordDeduction(deductLoan)} disabled={recording}>{recording ? "Recording..." : "Record Deduction"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payment;

/* =======================================================================
 * Loan Situation — admin-only summary of every employee's loan activity
 * (issued/repaid within a filtered range, plus current outstanding
 * balance), shown below the Loans table.
 * ===================================================================== */

type LoanSituationRow = {
  userId: string;
  name: string;
  issuedInRange: number;
  repaidInRange: number;
  currentRemaining: number;
};

function AdminLoanSituationTable() {
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<LoanSituationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchSeq = useRef(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      setEmployees(data || []);
      setSelectedIds((data || []).map((e) => e.id));
    })();
  }, []);

  // An explicit date range is more specific than Month From/To, same
  // convention as the Expense tab's own filter.
  const effectiveRange = useMemo(() => {
    if (dateFrom || dateTo) return { from: dateFrom, to: dateTo };
    return monthFilterToRange(monthFrom, monthTo);
  }, [monthFrom, monthTo, dateFrom, dateTo]);

  useEffect(() => {
    if (selectedIds.length === 0) { setRows([]); setLoading(false); return; }
    const seq = ++fetchSeq.current;
    setLoading(true);
    (async () => {
      const [{ data: advances }, { data: actions }] = await Promise.all([
        supabase.from("personal_advances").select("user_id, remaining_balance").in("user_id", selectedIds).eq("status", "approved"),
        (() => {
          let q = supabase.from("personal_advance_actions").select("user_id, action_type, amount, created_at").in("user_id", selectedIds);
          if (effectiveRange.from) q = q.gte("created_at", `${effectiveRange.from}T00:00:00`);
          if (effectiveRange.to) q = q.lte("created_at", `${effectiveRange.to}T23:59:59`);
          return q;
        })(),
      ]);
      if (seq !== fetchSeq.current) return;

      const remainingByUser = new Map<string, number>();
      (advances || []).forEach((a) => remainingByUser.set(a.user_id, (remainingByUser.get(a.user_id) || 0) + Number(a.remaining_balance)));

      const issuedByUser = new Map<string, number>();
      const repaidByUser = new Map<string, number>();
      (actions || []).forEach((a) => {
        if (a.action_type === "issued") issuedByUser.set(a.user_id, (issuedByUser.get(a.user_id) || 0) + Number(a.amount));
        if (a.action_type === "payroll_deduction") repaidByUser.set(a.user_id, (repaidByUser.get(a.user_id) || 0) + Number(a.amount));
      });

      const employeeMap = new Map(employees.map((e) => [e.id, e]));
      const result: LoanSituationRow[] = selectedIds
        .map((id) => {
          const e = employeeMap.get(id);
          return {
            userId: id,
            name: e?.full_name || e?.email || "—",
            issuedInRange: issuedByUser.get(id) || 0,
            repaidInRange: repaidByUser.get(id) || 0,
            currentRemaining: remainingByUser.get(id) || 0,
          };
        })
        .filter((r) => r.issuedInRange > 0 || r.repaidInRange > 0 || r.currentRemaining > 0);

      setRows(result.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    })();
  }, [selectedIds, effectiveRange, employees]);

  const toggleEmployee = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Loan Situation — All Employees</CardTitle>
        <CardDescription>Issued and repaid within the selected range, plus each employee's current outstanding balance.</CardDescription>
        <div className="flex flex-wrap items-start gap-3 pt-2">
          <div className="space-y-1"><Label className="text-xs">Month From</Label><Input type="month" value={monthFrom} disabled={!!(dateFrom || dateTo)} onChange={(e) => setMonthFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Month To</Label><Input type="month" value={monthTo} disabled={!!(dateFrom || dateTo)} onChange={(e) => setMonthTo(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">From Date</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">To Date</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
          {(monthFrom || monthTo || dateFrom || dateTo) && (
            <Button size="sm" variant="ghost" className="self-end" onClick={() => { setMonthFrom(""); setMonthTo(""); setDateFrom(""); setDateTo(""); }}>Clear</Button>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Employees ({selectedIds.length} selected)</Label>
            <div className="rounded-md border p-2 max-h-36 w-64 overflow-y-auto space-y-1">
              <label className="flex items-center gap-2 text-sm px-1 py-0.5 font-medium border-b pb-1 mb-1">
                <Checkbox
                  checked={employees.length > 0 && selectedIds.length === employees.length}
                  onCheckedChange={() => setSelectedIds(selectedIds.length === employees.length ? [] : employees.map((e) => e.id))}
                />
                Select all
              </label>
              {employees.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm px-1 py-0.5">
                  <Checkbox checked={selectedIds.includes(e.id)} onCheckedChange={() => toggleEmployee(e.id)} />
                  {e.full_name || e.email}
                </label>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Issued (range)</TableHead>
                <TableHead className="text-right">Repaid (range)</TableHead>
                <TableHead className="text-right">Current Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No loan activity</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.userId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.issuedInRange.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.repaidInRange.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-semibold">{r.currentRemaining.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* =======================================================================
 * My Payments — admin's disbursement tab. Combines this month's Net Hours
 * payment, outstanding Expense balance and Loan due into one decision per
 * employee: how much of each to pay now vs leave outstanding. Net Hours is
 * a binary pay-now/carry-forward choice (matching the "Carry Forward"
 * option OT/Due decisions already have in the Salary tab); Expense and
 * Loan amounts can be paid in full or in part.
 *
 * Recording a settlement here reduces the Loan's remaining_balance through
 * the same personal_advance_actions ledger "Record This Month's Deduction"
 * already uses, and the Expense balance shown is always net of every prior
 * settlement's expense_amount_paid for that employee - so once paid, it
 * drops out of what's still owed the next time this tab is opened, for
 * both admin and the employee.
 * ===================================================================== */

function MyPaymentsTab() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [netHours, setNetHours] = useState(0);
  const [loan, setLoan] = useState<{ id: string; monthly_deduction: number; remaining_balance: number } | null>(null);
  const [expenseOutstanding, setExpenseOutstanding] = useState(0);
  const [existingSettlement, setExistingSettlement] = useState<any>(null);

  const [netHoursPaidNow, setNetHoursPaidNow] = useState(true);
  const [expenseAmount, setExpenseAmount] = useState("0");
  const [loanAmount, setLoanAmount] = useState("0");
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      setEmployees(data || []);
      if (data && data.length > 0) setSelectedUserId((v) => v || data[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedUserId || !month) return;
    setLoading(true);
    (async () => {
      const [rows, { data: loanRow }, { data: settlement }, { data: claims }, { data: priorSettlements }] = await Promise.all([
        computeMonthlySalaryRows([selectedUserId], [month]),
        supabase.from("personal_advances").select("id, monthly_deduction, remaining_balance")
          .eq("user_id", selectedUserId).eq("status", "approved").gt("remaining_balance", 0)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("payroll_settlements").select("*").eq("user_id", selectedUserId).eq("month", `${month}-01`).maybeSingle(),
        supabase.from("expense_claims").select("amount, entry_type, recovered_amount").eq("user_id", selectedUserId).eq("status", "approved"),
        supabase.from("payroll_settlements").select("expense_amount_paid").eq("user_id", selectedUserId),
      ]);

      const row = rows[0];
      setNetHours(row ? row.netAdjustment : 0);
      setLoan(loanRow || null);
      setExistingSettlement(settlement || null);
      setNetHoursPaidNow(settlement ? settlement.net_hours_paid : true);
      const loanDue = Math.min(Number(loanRow?.monthly_deduction || 0), Number(loanRow?.remaining_balance || 0));
      setLoanAmount(String(settlement ? settlement.loan_amount_paid : loanDue));

      // Lifetime Expense net balance (every approved claim, not just this
      // month) minus every prior settlement's expense_amount_paid - so a
      // partial payment last month reduces what's still outstanding now.
      const expenseTotal = (claims || []).filter((c) => c.entry_type !== "advance").reduce((s, c) => s + Number(c.amount), 0);
      const advanceOutstanding = (claims || []).filter((c) => c.entry_type === "advance").reduce((s, c) => s + Math.max(0, Number(c.amount) - Number(c.recovered_amount || 0)), 0);
      const paidSoFar = (priorSettlements || []).reduce((s, p) => s + Number(p.expense_amount_paid || 0), 0);
      const outstanding = expenseTotal - advanceOutstanding - paidSoFar;
      setExpenseOutstanding(outstanding);
      setExpenseAmount(String(settlement ? settlement.expense_amount_paid : Math.max(0, outstanding)));
      setNote(settlement?.note || "");
      setLoading(false);
    })();
  }, [selectedUserId, month]);

  const submit = async () => {
    if (!user || !selectedUserId) return;
    setSaving(true);
    try {
      const loanPaid = Math.max(0, Number(loanAmount) || 0);
      const expensePaid = Math.max(0, Number(expenseAmount) || 0);
      const { error } = await supabase.from("payroll_settlements").upsert({
        user_id: selectedUserId,
        month: `${month}-01`,
        net_hours_amount: netHours,
        net_hours_paid: netHoursPaidNow,
        expense_amount_paid: expensePaid,
        loan_amount_paid: loanPaid,
        note: note || null,
        paid_by: user.id,
      }, { onConflict: "user_id,month" });
      if (error) throw error;

      // Apply the loan portion to the ledger immediately, same mechanism as
      // the existing "Record This Month's Deduction" flow - only the delta
      // vs what this settlement already recorded, so re-saving the same
      // month doesn't double-deduct.
      const alreadyRecorded = Number(existingSettlement?.loan_amount_paid || 0);
      const delta = loanPaid - alreadyRecorded;
      if (delta !== 0 && loan) {
        const newRemaining = Math.max(0, Number(loan.remaining_balance) - delta);
        await supabase.from("personal_advances").update({
          remaining_balance: newRemaining, status: newRemaining === 0 ? "closed" : "approved",
        }).eq("id", loan.id);
        await supabase.from("personal_advance_actions").insert({
          personal_advance_id: loan.id, user_id: selectedUserId, action_type: "payroll_deduction",
          amount: delta, remaining_after: newRemaining, month: `${month}-01`, created_by: user.id,
          note: "Recorded via My Payments",
        });
      }

      toast.success("Payment recorded");
      await notifyEmployee(
        selectedUserId,
        "Payment Recorded",
        `Your ${format(new Date(`${month}-01`), "MMMM yyyy")} payment was recorded: Net Hours ${netHoursPaidNow ? "paid" : "carried to next month"}, Expense ${fmtBDT(expensePaid)}, Loan ${fmtBDT(loanPaid)}.`,
        undefined,
        { route: "/payment", type: "payroll_settlement" },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const employeeName = employees.find((e) => e.id === selectedUserId)?.full_name || employees.find((e) => e.id === selectedUserId)?.email;

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Payments</CardTitle>
        <CardDescription>Decide how much of this month's Net Hours, Expense balance and Loan due to pay now.</CardDescription>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Employee</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !selectedUserId ? (
          <p className="text-sm text-muted-foreground">Select an employee.</p>
        ) : (
          <div className="space-y-4">
            {existingSettlement && (
              <p className="text-xs text-muted-foreground">
                A payment for {format(new Date(`${month}-01`), "MMMM yyyy")} was already recorded — saving again updates it.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Net Hours{employeeName ? "" : ""}</div>
                <div className="text-lg font-semibold">{fmtBDT(netHours)}</div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={netHoursPaidNow} onCheckedChange={(v) => setNetHoursPaidNow(!!v)} />
                  Pay now (unchecked = carry to next month)
                </label>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Expense Balance</div>
                <div className="text-lg font-semibold">{fmtBDT(expenseOutstanding)}</div>
                <Label className="text-xs">Pay now</Label>
                <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} />
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Loan Due</div>
                <div className="text-lg font-semibold">
                  {loan ? fmtBDT(Math.min(Number(loan.monthly_deduction), Number(loan.remaining_balance))) : "No active loan"}
                </div>
                <Label className="text-xs">Pay now</Label>
                <Input type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} disabled={!loan} />
                {loan && <p className="text-xs text-muted-foreground">{fmtBDT(loan.remaining_balance)} remaining balance</p>}
              </div>
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button onClick={submit} disabled={saving}>{saving ? "Recording..." : "Record Payment"}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =======================================================================
 * Salary tab (formerly Payroll) — moved from the former src/pages/Payroll.tsx
 * (now deleted). Self-contained: reads its own auth/role so its internals
 * never leak into (or collide with) Payment's own state/handlers.
 *
 * Only the Salary Summary segment (PayrollAdjustments) is shown here, plus
 * a monthly breakdown table of the same figures: every month for an
 * employee's own view, or every selected employee × month for admin.
 * Payroll generation, payslips, incentives and the gratuity calculator have
 * been removed from this tab entirely.
 * ===================================================================== */

function PayrollTab() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  return (
    <div className="space-y-6">
      <PayrollAdjustments isAdmin={isAdmin} />
      {isAdmin ? <AdminSalaryMonthlyTable /> : <MySalaryMonthlyTable />}
    </div>
  );
}

const fmtMonthLabel = (month: string) => format(new Date(`${month}-01T00:00:00`), "MMM yyyy");

function SalaryMonthlyTableView({ rows, showEmployee, loading }: { rows: SalaryMonthRow[]; showEmployee: boolean; loading: boolean }) {
  const colCount = showEmployee ? 12 : 10;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showEmployee && <TableHead>Employee</TableHead>}
            <TableHead>Month</TableHead>
            {showEmployee && <TableHead className="text-right">Gross</TableHead>}
            <TableHead className="text-right">Basic (50%)</TableHead>
            <TableHead className="text-right">House Rent (35%)</TableHead>
            <TableHead className="text-right">Conveyance (10%)</TableHead>
            <TableHead className="text-right">Medical (5%)</TableHead>
            <TableHead className="text-right">+ OT Payment</TableHead>
            <TableHead className="text-right">- Due Deduction</TableHead>
            <TableHead className="text-right">Net Adjustment</TableHead>
            <TableHead className="text-right">- Expense</TableHead>
            <TableHead className="text-right">Final</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={colCount} className="text-center text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={colCount} className="text-center text-muted-foreground py-8">No records</TableCell></TableRow>
          ) : rows.map((r) => (
            <TableRow key={`${r.userId}-${r.month}`}>
              {showEmployee && <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>}
              <TableCell className="whitespace-nowrap">{fmtMonthLabel(r.month)}</TableCell>
              {showEmployee && <TableCell className="text-right">{fmtBDT(r.gross)}</TableCell>}
              <TableCell className="text-right">{fmtBDT(r.basic)}</TableCell>
              <TableCell className="text-right">{fmtBDT(r.houseRent)}</TableCell>
              <TableCell className="text-right">{fmtBDT(r.conveyance)}</TableCell>
              <TableCell className="text-right">{fmtBDT(r.medical)}</TableCell>
              <TableCell className="text-right">{fmtBDT(r.otPayment)}</TableCell>
              <TableCell className="text-right">{fmtBDT(-r.dueDeduction)}</TableCell>
              <TableCell className="text-right">{fmtBDT(r.netAdjustment)}</TableCell>
              <TableCell className="text-right">{fmtBDT(-r.recoveryTotal)}</TableCell>
              <TableCell className="text-right font-semibold">{fmtBDT(r.final)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Shared Month From/To range -> "yyyy-MM-dd" bounds, same convention as Reports' Performance Summary. */
const monthFilterToRange = (monthFrom: string, monthTo: string): { from: string; to: string } => {
  if (!monthFrom && !monthTo) return { from: "", to: "" };
  const startMonth = monthFrom || monthTo;
  const endMonth = monthTo || monthFrom;
  const [ys, ms] = startMonth.split("-").map(Number);
  const [ye, me] = endMonth.split("-").map(Number);
  return { from: format(new Date(ys, ms - 1, 1), "yyyy-MM-dd"), to: format(new Date(ye, me, 0), "yyyy-MM-dd") };
};

function MySalaryMonthlyTable() {
  const { user } = useAuth();
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [rows, setRows] = useState<SalaryMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchSeq = useRef(0);

  const effectiveRange = useMemo(() => monthFilterToRange(monthFrom, monthTo), [monthFrom, monthTo]);

  useEffect(() => {
    if (!user) return;
    const seq = ++fetchSeq.current;
    setLoading(true);
    (async () => {
      // With no filter, show every month that actually has attendance —
      // derived from this employee's own records instead of staying empty.
      let months = monthsInRange(effectiveRange.from, effectiveRange.to);
      if (months.length === 0) {
        const { data } = await supabase.from("attendance_logs").select("date").eq("user_id", user.id);
        months = Array.from(new Set((data || []).map((r) => r.date.slice(0, 7)))).sort();
      }
      const result = await computeMonthlySalaryRows([user.id], months);
      if (seq !== fetchSeq.current) return;
      setRows(result.sort((a, b) => b.month.localeCompare(a.month)));
      setLoading(false);
    })();
  }, [user, effectiveRange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly Salary Summary</CardTitle>
        <CardDescription>Every month's breakdown — the same figures as Salary Summary above.</CardDescription>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1"><Label className="text-xs">Month From</Label><Input type="month" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Month To</Label><Input type="month" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} /></div>
          {(monthFrom || monthTo) && <Button size="sm" variant="ghost" onClick={() => { setMonthFrom(""); setMonthTo(""); }}>Clear</Button>}
        </div>
      </CardHeader>
      <CardContent>
        <SalaryMonthlyTableView rows={rows} showEmployee={false} loading={loading} />
      </CardContent>
    </Card>
  );
}

function AdminSalaryMonthlyTable() {
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [monthFrom, setMonthFrom] = useState(() => format(new Date(), "yyyy-MM"));
  const [monthTo, setMonthTo] = useState("");
  const [rows, setRows] = useState<SalaryMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchSeq = useRef(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      setEmployees(data || []);
      setSelectedIds((data || []).map((e) => e.id));
    })();
  }, []);

  const effectiveRange = useMemo(() => monthFilterToRange(monthFrom, monthTo), [monthFrom, monthTo]);

  useEffect(() => {
    if (selectedIds.length === 0) { setRows([]); setLoading(false); return; }
    const seq = ++fetchSeq.current;
    setLoading(true);
    (async () => {
      let months = monthsInRange(effectiveRange.from, effectiveRange.to);
      if (months.length === 0) {
        const { data } = await supabase.from("attendance_logs").select("date").in("user_id", selectedIds);
        months = Array.from(new Set((data || []).map((r) => r.date.slice(0, 7)))).sort();
      }
      const result = await computeMonthlySalaryRows(selectedIds, months);
      if (seq !== fetchSeq.current) return;
      setRows(result.sort((a, b) => a.name.localeCompare(b.name) || b.month.localeCompare(a.month)));
      setLoading(false);
    })();
  }, [selectedIds, effectiveRange]);

  const toggleEmployee = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly Salary Summary — All Employees</CardTitle>
        <CardDescription>Every selected employee's month-wise breakdown — the same figures as the Salary Summary segment above.</CardDescription>
        <div className="flex flex-wrap items-start gap-3 pt-2">
          <div className="space-y-1"><Label className="text-xs">Month From</Label><Input type="month" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Month To</Label><Input type="month" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} /></div>
          {(monthFrom || monthTo) && <Button size="sm" variant="ghost" className="self-end" onClick={() => { setMonthFrom(""); setMonthTo(""); }}>Clear</Button>}
          <div className="space-y-1">
            <Label className="text-xs">Employees ({selectedIds.length} selected)</Label>
            <div className="rounded-md border p-2 max-h-36 w-64 overflow-y-auto space-y-1">
              <label className="flex items-center gap-2 text-sm px-1 py-0.5 font-medium border-b pb-1 mb-1">
                <Checkbox
                  checked={employees.length > 0 && selectedIds.length === employees.length}
                  onCheckedChange={() => setSelectedIds(selectedIds.length === employees.length ? [] : employees.map((e) => e.id))}
                />
                Select all
              </label>
              {employees.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">No employees found</p>
              ) : employees.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm px-1 py-0.5">
                  <Checkbox checked={selectedIds.includes(e.id)} onCheckedChange={() => toggleEmployee(e.id)} />
                  {e.full_name || e.email}
                </label>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <SalaryMonthlyTableView rows={rows} showEmployee loading={loading} />
      </CardContent>
    </Card>
  );
}


/* =======================================================================
 * Expense Claims tab — moved from the former src/pages/Expenses.tsx (now
 * deleted). Self-contained: reads its own auth/role so its internals never
 * leak into (or collide with) Payment's own state/handlers.
 * ===================================================================== */

const FALLBACK_CATEGORIES: ExpenseType[] = [
  { name: "Travel", entry_type: "expense" }, { name: "Meals", entry_type: "expense" },
  { name: "Office Supplies", entry_type: "expense" }, { name: "Software", entry_type: "expense" },
  { name: "Training", entry_type: "expense" }, { name: "Client Entertainment", entry_type: "expense" },
  { name: "Other", entry_type: "expense" },
];

const ENTRY_TYPES = [
  { value: "expense", label: "Expense" },
  { value: "advance", label: "Advance" },
];

type ExpenseType = { name: string; entry_type: "expense" | "advance" };

function ExpenseClaimsTab() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const canApprove = role === "admin" || role === "manager";
  const [claims, setClaims] = useState<any[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>(FALLBACK_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<"expense" | "advance">("expense");
  const [open, setOpen] = useState(false);
  // Entry Type comes first - it decides which category list applies, so the
  // category must be picked (or re-picked) after it, not independently.
  const [form, setForm] = useState({
    entry_type: "expense" as "expense" | "advance", category: "Travel",
    amount: "", claim_date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterFromDate, setFilterFromDate] = useState<string>("");
  const [filterToDate, setFilterToDate] = useState<string>("");

  const fetchClaims = async () => {
    const { data, error } = await supabase.from("expense_claims").select(
      "*, profiles!expense_claims_user_id_fkey(full_name,email,photo_url), approver:profiles!expense_claims_approver_id_fkey(full_name,email)"
    ).order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setClaims(data || []);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from("expense_types").select("name, entry_type").order("created_at", { ascending: true });
    if (data && data.length > 0) setExpenseTypes(data as ExpenseType[]);
  };

  useEffect(() => { fetchClaims(); fetchCategories(); }, []);

  const categoriesForType = useMemo(
    () => expenseTypes.filter((t) => t.entry_type === form.entry_type).map((t) => t.name),
    [expenseTypes, form.entry_type],
  );

  const setEntryType = (entry_type: "expense" | "advance") => {
    const list = expenseTypes.filter((t) => t.entry_type === entry_type).map((t) => t.name);
    setForm((f) => ({ ...f, entry_type, category: list[0] || "" }));
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    const { error } = await supabase.from("expense_types").insert({ name, entry_type: newCategoryType });
    if (error) { toast.error(error.message); return; }
    toast.success("Expense type added");
    setNewCategory("");
    fetchCategories();
  };

  const uploadReceipt = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("task-attachments").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
    setForm(f => ({ ...f, receipt_url: data?.signedUrl || "" }));
    setUploading(false);
  };

  const submit = async () => {
    if (!form.amount) return toast.error("Amount required");
    if (!form.category) return toast.error("Category required");
    const amount = Number(form.amount);
    // Direction used to be a separate field the employee picked by hand; it's
    // now implied by Entry Type - an Advance is cash given up front that the
    // employee owes back, an Expense is a reimbursement the company owes them.
    const direction = form.entry_type === "advance" ? "employee_owes_company" : "company_pays_employee";
    const { data: inserted, error } = await supabase.from("expense_claims").insert({
      user_id: user?.id,
      category: form.category,
      amount,
      claim_date: form.claim_date,
      description: form.description,
      receipt_url: form.receipt_url || null,
      direction,
      entry_type: form.entry_type,
      recoverable_total: direction === "employee_owes_company" ? amount : null,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Expense submitted");
    setOpen(false);
    setForm({ entry_type: "expense", category: categoriesForType[0] || "Travel", amount: "", claim_date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "" });
    await notifyManagersAndAdmins(
      "Expense Claim Submitted",
      `${user?.email} submitted a ${form.category} claim for ${form.amount}.`,
      inserted?.id,
      { route: "/expenses", type: "expense_claim", requesterId: user?.id },
    );
    fetchClaims();
  };

  const decide = async (id: string, status: "approved" | "rejected") => {
    const claim = claims.find((c) => c.id === id);
    const { error } = await supabase.from("expense_claims").update({ status, approver_id: user?.id, approved_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Claim ${status}`);
    if (claim) {
      await notifyEmployee(
        claim.user_id,
        `Expense Claim ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your ${claim.category} claim for ${claim.amount} was ${status}.`,
        id,
        { route: "/expenses", type: "expense_claim_update" },
      );
    }
    fetchClaims();
  };

  const markPaid = async (id: string) => {
    const { error } = await supabase.from("expense_claims").update({
      payment_status: "paid", paid_date: format(new Date(), "yyyy-MM-dd"),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked paid");
    fetchClaims();
  };

  const filteredClaims = claims.filter((c) => {
    // An explicit date range is more specific than Month/Year, so it takes
    // over whenever either end is set — the two controls are not combined.
    if (filterFromDate || filterToDate) {
      if (!c.claim_date) return false;
      if (filterFromDate && c.claim_date < filterFromDate) return false;
      if (filterToDate && c.claim_date > filterToDate) return false;
      return true;
    }
    if (!c.claim_date) return filterMonth === "all";
    const d = new Date(`${c.claim_date}T00:00:00`);
    if (d.getFullYear() !== filterYear) return false;
    if (filterMonth !== "all" && d.getMonth() + 1 !== Number(filterMonth)) return false;
    return true;
  });

  const myClaims = filteredClaims.filter(c => c.user_id === user?.id);
  const pendingApprovals = filteredClaims.filter(c => c.status === "pending" && c.user_id !== user?.id);
  const allOthers = filteredClaims.filter(c => c.user_id !== user?.id);

  const totals = expenseTypes.map(({ name: cat }) => ({
    cat,
    total: filteredClaims.filter(c => c.category === cat && c.status === "approved").reduce((s,c)=>s+Number(c.amount), 0)
  })).filter(t => t.total > 0);

  const advanceTotal = filteredClaims.filter(c => c.entry_type === "advance" && c.status === "approved").reduce((s, c) => s + Number(c.amount), 0);
  const expenseTotal = filteredClaims.filter(c => c.entry_type !== "advance" && c.status === "approved").reduce((s, c) => s + Number(c.amount), 0);
  const netAmount = expenseTotal - advanceTotal;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Expense Claims</h1>
          <p className="text-sm text-muted-foreground">Submit and track reimbursement requests.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Claim</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit Expense Claim</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Entry Type</Label>
                <Select value={form.entry_type} onValueChange={(v) => setEntryType(v as "expense" | "advance")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ENTRY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={(v)=>setForm({...form, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoriesForType.length === 0 ? (
                      <SelectItem value="none" disabled>No categories for this entry type yet</SelectItem>
                    ) : categoriesForType.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e)=>setForm({...form, amount: e.target.value})} /></div>
                <div><Label>Date</Label><Input type="date" value={form.claim_date} onChange={(e)=>setForm({...form, claim_date: e.target.value})} /></div>
              </div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})} /></div>
              <div>
                <Label>Receipt</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e)=>e.target.files?.[0] && uploadReceipt(e.target.files[0])} disabled={uploading} />
                {form.receipt_url && <a className="text-xs text-primary underline" href={form.receipt_url} target="_blank" rel="noreferrer">View attached</a>}
              </div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={uploading}>{uploading ? "Uploading..." : "Submit"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2">
          <Input className="max-w-[220px]" placeholder="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <Select value={newCategoryType} onValueChange={(v) => setNewCategoryType(v as "expense" | "advance")}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{ENTRY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={addCategory}>Add Category</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>Advance</CardDescription><CardTitle>{advanceTotal.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Expense</CardDescription><CardTitle>{expenseTotal.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Net Amount</CardDescription><CardTitle className={netAmount < 0 ? "text-destructive" : ""}>{netAmount.toLocaleString()}</CardTitle></CardHeader></Card>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Month</Label>
          <Select value={filterMonth} onValueChange={setFilterMonth} disabled={!!(filterFromDate || filterToDate)}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Year</Label>
          <Input type="number" className="w-[100px]" value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value) || filterYear)} disabled={!!(filterFromDate || filterToDate)} />
        </div>
        <div>
          <Label className="text-xs">From Date</Label>
          <Input type="date" className="w-[160px]" value={filterFromDate} onChange={(e) => setFilterFromDate(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To Date</Label>
          <Input type="date" className="w-[160px]" value={filterToDate} onChange={(e) => setFilterToDate(e.target.value)} />
        </div>
        {(filterFromDate || filterToDate) && (
          <Button size="sm" variant="ghost" onClick={() => { setFilterFromDate(""); setFilterToDate(""); }}>Clear Dates</Button>
        )}
      </div>

      {totals.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {totals.map(t => (
            <Card key={t.cat}><CardHeader className="pb-2"><CardDescription>{t.cat}</CardDescription><CardTitle>{t.total.toLocaleString()}</CardTitle></CardHeader></Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My Claims</TabsTrigger>
          {canApprove && <TabsTrigger value="pending">Pending Approval ({pendingApprovals.length})</TabsTrigger>}
          {canApprove && <TabsTrigger value="all">Team History</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine">
          <ClaimTable claims={myClaims} showEmployee={false} isAdmin={isAdmin} onTogglePaid={markPaid} />
        </TabsContent>
        {canApprove && (
          <TabsContent value="pending">
            <ClaimTable claims={pendingApprovals} showEmployee onApprove={(id)=>decide(id,"approved")} onReject={(id)=>decide(id,"rejected")} isAdmin={isAdmin} onTogglePaid={markPaid} />
          </TabsContent>
        )}
        {canApprove && (
          <TabsContent value="all">
            <ClaimTable claims={allOthers} showEmployee isAdmin={isAdmin} onTogglePaid={markPaid} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

const ClaimTable = ({ claims, showEmployee, onApprove, onReject, onTogglePaid, isAdmin }: any) => (
  <Card>
    <CardContent className="pt-6">
      <Table>
        <TableHeader>
          <TableRow>
            {showEmployee && <TableHead>Employee</TableHead>}
            <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Entry Type</TableHead><TableHead>Direction</TableHead><TableHead>Amount</TableHead><TableHead>Description</TableHead><TableHead>Receipt</TableHead><TableHead>Status</TableHead><TableHead>Approved/Rejected By</TableHead>
            {(onApprove || onReject) && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.length === 0 ? <TableRow><TableCell colSpan={showEmployee ? 11 : 10} className="text-center text-muted-foreground">No claims</TableCell></TableRow> :
            claims.map((c: any) => (
              <TableRow key={c.id}>
                {showEmployee && <TableCell>{c.profiles?.full_name || c.profiles?.email || "—"}</TableCell>}
                <TableCell>{format(new Date(c.claim_date), "MMM d, yyyy")}</TableCell>
                <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                <TableCell><Badge variant={c.entry_type === "advance" ? "secondary" : "outline"}>{c.entry_type === "advance" ? "Advance" : "Expense"}</Badge></TableCell>
                <TableCell>
                  {c.direction === "employee_owes_company" ? (
                    <Badge variant="outline">Employee Owes</Badge>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Badge className={c.payment_status === "paid" ? "bg-success text-white" : ""} variant={c.payment_status === "paid" ? undefined : "outline"}>{c.payment_status === "paid" ? "Paid" : "Not Paid"}</Badge>
                      {isAdmin && c.payment_status !== "paid" && (
                        <Button size="sm" variant="ghost" onClick={() => onTogglePaid?.(c.id)}>Mark Paid</Button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-semibold">{Number(c.amount).toLocaleString()}</TableCell>
                <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">{c.description || "—"}</TableCell>
                <TableCell>{c.receipt_url ? <a href={c.receipt_url} target="_blank" rel="noreferrer" className="text-primary"><FileText className="h-4 w-4 inline" /></a> : "—"}</TableCell>
                <TableCell>
                  <Badge className={c.status === "approved" ? "bg-success text-white" : c.status === "rejected" ? "bg-destructive text-white" : ""} variant={c.status === "pending" ? "outline" : undefined}>{c.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.status === "pending" ? "—" : (c.approver?.full_name || c.approver?.email || "—")}
                </TableCell>
                {(onApprove || onReject) && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" onClick={()=>onApprove?.(c.id)}><Check className="h-4 w-4 text-success" /></Button>
                      <Button size="icon" variant="outline" onClick={()=>onReject?.(c.id)}><X className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);
