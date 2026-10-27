import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Check, X, FileText, AlertTriangle, Loader2, Trash2, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { notifyManagersAndAdmins, notifyEmployee } from "@/lib/notifications";
import { applyDuePersonalAdvanceDeduction, downloadPaymentReceiptPDF, type PayrollProfile } from "@/lib/payroll";
import { PayrollAdjustments } from "@/components/PayrollAdjustments";
import { monthsInRange, fmtBDT } from "@/lib/payrollAdjustments";
import { computeMonthlySalaryRows, type SalaryMonthRow } from "@/lib/salaryMonthly";
import { uploadAttachments } from "@/lib/attachments";
import AttachmentsInput from "@/components/AttachmentsInput";
import AttachmentThumbnails from "@/components/AttachmentThumbnails";

type PayrollSettlementRow = {
  id: string;
  user_id: string;
  month: string;
  net_hours_amount: number;
  net_hours_paid: boolean;
  expense_amount_paid: number;
  expense_paid: boolean;
  loan_amount_paid: number;
  loan_paid: boolean;
  note: string | null;
  attachments: string[] | null;
  paid_by: string;
  approval_status: "pending_approval" | "approved" | "rejected";
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
};

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
  const [loanRequestForm, setLoanRequestForm] = useState({ amount: "", reason: "", installments: "1", month: format(new Date(), "yyyy-MM"), requestDate: format(new Date(), "yyyy-MM-dd") });

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
      month: loanRequestForm.month ? `${loanRequestForm.month}-01` : null,
      request_date: loanRequestForm.requestDate || format(new Date(), "yyyy-MM-dd"),
    }).select().single();
    if (error) {
      if ((error as any).code === "23505") return toast.error("You already have an active loan request.");
      return toast.error(error.message);
    }
    toast.success("Loan requested");
    setRequestOpen(false);
    setLoanRequestForm({ amount: "", reason: "", installments: "1", month: format(new Date(), "yyyy-MM"), requestDate: format(new Date(), "yyyy-MM-dd") });
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

  const deleteLoan = async (loanId: string) => {
    if (!window.confirm("Delete this loan request? This cannot be undone.")) return;
    // RLS blocking this doesn't error — it just matches 0 rows, which would
    // otherwise look like silent success while the row stays put.
    const { data, error } = await supabase.from("personal_advances").delete().eq("id", loanId).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("Delete didn't go through — you may not have permission to delete this."); return; }
    toast.success("Loan deleted");
    fetchAll();
  };

  const renderRow = (loan: any, showEmployee: boolean) => (
    <TableRow key={loan.id}>
      {showEmployee && <TableCell>{loan.profiles?.full_name || loan.profiles?.email || "—"}</TableCell>}
      <TableCell>{format(new Date(`${loan.request_date || loan.created_at}`), "MMM d, yyyy")}</TableCell>
      <TableCell className="font-semibold">{Number(loan.amount).toLocaleString()}</TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{loan.reason || "—"}</TableCell>
      <TableCell>
        {loan.installments} installment{loan.installments === 1 ? "" : "s"} · {Number(loan.monthly_deduction).toLocaleString()}
      </TableCell>
      <TableCell>{loan.month ? format(new Date(`${loan.month}T00:00:00`), "MMMM yyyy") : "—"}</TableCell>
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
          {isAdmin && (
            <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteLoan(loan.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
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
          <TabsTrigger value="my-payments">My Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="loans" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={requestOpen} onOpenChange={(o) => { setRequestOpen(o); if (!o) setLoanRequestForm({ amount: "", reason: "", installments: "1", month: format(new Date(), "yyyy-MM"), requestDate: format(new Date(), "yyyy-MM-dd") }); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Request Loan</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Request a Loan</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount</Label><Input type="number" value={loanRequestForm.amount} onChange={(e) => setLoanRequestForm((f) => ({ ...f, amount: e.target.value }))} /></div>
                    <div><Label>Installments</Label><Input type="number" min="1" value={loanRequestForm.installments} onChange={(e) => setLoanRequestForm((f) => ({ ...f, installments: e.target.value }))} /></div>
                  </div>
                  <div><Label>Request Date</Label><Input type="date" value={loanRequestForm.requestDate} onChange={(e) => setLoanRequestForm((f) => ({ ...f, requestDate: e.target.value }))} /></div>
                  <div><Label>Installment Month</Label><Input type="month" value={loanRequestForm.month} onChange={(e) => setLoanRequestForm((f) => ({ ...f, month: e.target.value }))} /></div>
                  <div><Label>Reason</Label><Textarea value={loanRequestForm.reason} onChange={(e) => setLoanRequestForm((f) => ({ ...f, reason: e.target.value }))} /></div>
                </div>
                <DialogFooter><Button onClick={submitLoanRequest}>Submit</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {isAdmin ? (
            <AdminLoanPanel loans={loans} renderRow={renderRow} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canApprove && <TableHead>Employee</TableHead>}
                      <TableHead>Date</TableHead><TableHead>Amount</TableHead>
                      <TableHead>Reason</TableHead><TableHead>Installments</TableHead><TableHead>Installment Month</TableHead><TableHead>Balance</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
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
          )}
        </TabsContent>

        <TabsContent value="salary">
          <PayrollTab />
        </TabsContent>

        <TabsContent value="expense">
          <ExpenseClaimsTab />
        </TabsContent>

        <TabsContent value="my-payments">
          {isAdmin ? <MyPaymentsTab /> : <MyPaymentsSummary />}
        </TabsContent>
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
 * Admin Loan Panel — filters, then summary cards, then the filterable all-
 * employees loan history table (reusing Payment's own renderRow/loans state,
 * no separate fetch). Order: filters, cards, history — in that order.
 * ===================================================================== */

function AdminLoanPanel({ loans, renderRow }: { loans: any[]; renderRow: (loan: any, showEmployee: boolean) => JSX.Element }) {
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  const toggleEmployee = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  // Active = approved with an outstanding balance to collect. Scoped to the
  // selected employees only, not the date range (same as before).
  const summary = useMemo(() => {
    let totalLoanBalance = 0, totalCurrentBalance = 0;
    loans.forEach((l) => {
      if (!selectedIds.includes(l.user_id)) return;
      if (l.status === "approved" && Number(l.remaining_balance) > 0) {
        totalLoanBalance += Number(l.amount);
        totalCurrentBalance += Number(l.remaining_balance);
      }
    });
    return { totalLoanBalance, totalCurrentBalance };
  }, [loans, selectedIds]);

  const filteredLoans = useMemo(() => loans
    .filter((l) => {
      if (!selectedIds.includes(l.user_id)) return false;
      if (effectiveRange.from && l.created_at < `${effectiveRange.from}T00:00:00`) return false;
      if (effectiveRange.to && l.created_at > `${effectiveRange.to}T23:59:59`) return false;
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  [loans, selectedIds, effectiveRange]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <div className="flex flex-wrap items-start gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Employees</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-64 justify-start font-normal">
                    Employees ({selectedIds.length} selected)
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2">
                  <div className="max-h-36 overflow-y-auto space-y-1">
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
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1"><Label className="text-xs">Month From</Label><Input type="month" value={monthFrom} disabled={!!(dateFrom || dateTo)} onChange={(e) => setMonthFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Month To</Label><Input type="month" value={monthTo} disabled={!!(dateFrom || dateTo)} onChange={(e) => setMonthTo(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">From Date</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">To Date</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
            {(monthFrom || monthTo || dateFrom || dateTo) && (
              <Button size="sm" variant="ghost" className="self-end" onClick={() => { setMonthFrom(""); setMonthTo(""); setDateFrom(""); setDateTo(""); }}>Clear</Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>Total Loan Balance</CardDescription><CardTitle>{summary.totalLoanBalance.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Total Current Balance</CardDescription><CardTitle>{summary.totalCurrentBalance.toLocaleString()}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Loan History</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead><TableHead>Installments</TableHead><TableHead>Installment Month</TableHead><TableHead>Balance</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLoans.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No loan requests</TableCell></TableRow>
                ) : filteredLoans.map((loan) => renderRow(loan, true))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
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

  const [grossSalary, setGrossSalary] = useState(0);
  const [netAdjustment, setNetAdjustment] = useState(0);
  const [finalSalaryNoExpense, setFinalSalaryNoExpense] = useState(0);
  const [loan, setLoan] = useState<{ id: string; monthly_deduction: number; remaining_balance: number } | null>(null);
  const [expenseOutstanding, setExpenseOutstanding] = useState(0);
  const [existingSettlement, setExistingSettlement] = useState<any>(null);

  const [netHoursPaidNow, setNetHoursPaidNow] = useState(true);
  const [expensePaidNow, setExpensePaidNow] = useState(true);
  const [loanPaidNow, setLoanPaidNow] = useState(true);
  const [expenseAmount, setExpenseAmount] = useState("0");
  const [loanAmount, setLoanAmount] = useState("0");
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PayrollSettlementRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);

  const fetchPaymentHistory = useCallback(async () => {
    const { data } = await supabase
      .from("payroll_settlements")
      .select("*, profiles!payroll_settlements_user_id_fkey(full_name, email)")
      .order("month", { ascending: false })
      .order("created_at", { ascending: false });
    setPaymentHistory(data || []);
  }, []);

  useEffect(() => { fetchPaymentHistory(); }, [fetchPaymentHistory]);

  const deletePaymentHistory = async (row: PayrollSettlementRow) => {
    if (!window.confirm("Delete this payment record? This cannot be undone.")) return;
    const { data, error } = await supabase.from("payroll_settlements").delete().eq("id", row.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("You're not allowed to delete this payment record."); return; }
    toast.success("Payment record deleted");
    fetchPaymentHistory();
  };

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
      // A claim/loan dated after the end of the viewed month hasn't happened
      // yet as of that month, so it's excluded — a month before either
      // existed naturally comes out to 0.00, and once it exists the balance
      // (paid or not) carries into every later month the same as before.
      const monthEndISO = format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0), "yyyy-MM-dd");
      const [rows, { data: loanRow }, { data: settlement }, { data: claims }, { data: priorSettlements }] = await Promise.all([
        computeMonthlySalaryRows([selectedUserId], [month]),
        supabase.from("personal_advances").select("id, monthly_deduction, remaining_balance, created_at")
          .eq("user_id", selectedUserId).eq("status", "approved").gt("remaining_balance", 0)
          .lte("created_at", `${monthEndISO}T23:59:59`)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("payroll_settlements").select("*").eq("user_id", selectedUserId).eq("month", `${month}-01`).maybeSingle(),
        supabase.from("expense_claims").select("amount, entry_type, recovered_amount").eq("user_id", selectedUserId).eq("status", "approved").lte("claim_date", monthEndISO),
        // Excludes the viewed month's own settlement — that's the one being
        // decided right now, not a prior payment to subtract out.
        supabase.from("payroll_settlements").select("expense_amount_paid").eq("user_id", selectedUserId).neq("month", `${month}-01`),
      ]);

      const row = rows[0];
      setGrossSalary(row ? row.gross : 0);
      setNetAdjustment(row ? row.netAdjustment : 0);
      setFinalSalaryNoExpense(row ? row.final + row.recoveryTotal : 0);
      setLoan(loanRow || null);
      setExistingSettlement(settlement || null);
      setNetHoursPaidNow(settlement ? settlement.net_hours_paid : true);
      setExpensePaidNow(settlement ? settlement.expense_paid : true);
      setLoanPaidNow(settlement ? settlement.loan_paid : true);
      // Both amount boxes always default to the live due figure, even when
      // a settlement already exists for this month — never to whatever was
      // last saved, so a since-changed balance (or an old, since-fixed save)
      // never gets stuck showing a stale number. Still fully editable from
      // there, and saving again overwrites the settlement either way.
      const loanDue = Math.min(Number(loanRow?.monthly_deduction || 0), Number(loanRow?.remaining_balance || 0));
      // Shown negative, same convention as the Loan Due badge and Expense's
      // own box — a deduction, not an addition.
      setLoanAmount(String(loanDue > 0 ? -loanDue : 0));

      // Expense net balance as of the viewed month (every approved claim
      // dated by then) minus every prior settlement's expense_amount_paid -
      // so a partial payment last month reduces what's still outstanding now.
      const expenseTotal = (claims || []).filter((c) => c.entry_type !== "advance").reduce((s, c) => s + Number(c.amount), 0);
      const advanceOutstanding = (claims || []).filter((c) => c.entry_type === "advance").reduce((s, c) => s + Math.max(0, Number(c.amount) - Number(c.recovered_amount || 0)), 0);
      // Only the positive (genuine expense reimbursement) portion of a prior
      // settlement counts here — a negative portion (advance recovery) is
      // now tracked directly on the claim via recovered_amount (applied in
      // submit() below), so including it here too would subtract it twice.
      const paidSoFar = (priorSettlements || []).reduce((s, p) => s + Math.max(0, Number(p.expense_amount_paid) || 0), 0);
      const outstanding = expenseTotal - advanceOutstanding - paidSoFar;
      setExpenseOutstanding(outstanding);
      setExpenseAmount(String(outstanding));
      setNote(settlement?.note || "");
      setExistingAttachments(settlement?.attachments || []);
      setAttachments([]);
      setLoading(false);
    })();
  }, [selectedUserId, month]);

  const loanDue = loan ? Math.min(Number(loan.monthly_deduction), Number(loan.remaining_balance)) : 0;
  // Each card's own full-balance figure counts only while its own Adjust Now
  // is checked; unchecked (carried to next month) drops out of Net Payment
  // entirely — Net Salary falls back to Gross Salary (Net Adjustment not
  // counted) rather than to 0, since the gross is being paid regardless.
  // Expense/Loan use the editable amount boxes (default to the full
  // outstanding balance) so a partial entry there is reflected here too.
  // Both are added directly — Loan's box is negative by convention (a
  // deduction), same as Expense's box can be.
  const netPayment = (netHoursPaidNow ? finalSalaryNoExpense : grossSalary)
    + (expensePaidNow ? (Number(expenseAmount) || 0) : 0)
    + (loanPaidNow ? (Number(loanAmount) || 0) : 0);

  const submit = async () => {
    if (!user || !selectedUserId) return;
    setSaving(true);
    try {
      setUploading(true);
      const newUrls = attachments.length ? await uploadAttachments(attachments, user.id) : [];
      setUploading(false);
      const allAttachments = [...existingAttachments, ...newUrls];

      // Stored as a positive magnitude — the box shows it negative, but the
      // ledger delta below and every other reader of loan_amount_paid
      // (receipts, history, the employee's own summary) expect a plain
      // amount paid, same as before this box started showing it negative.
      const loanPaid = loanPaidNow ? Math.abs(Number(loanAmount) || 0) : 0;
      // Expense can be negative (an outstanding advance recovery) — not
      // clamped to 0 like Loan, since that would silently drop it.
      const expensePaid = expensePaidNow ? (Number(expenseAmount) || 0) : 0;

      // A negative Expense amount recovers an outstanding cash advance —
      // fetch the employee's open advance claims as of the viewed month
      // (same month-end cutoff the live Expense Balance figure already
      // uses) up front, so a recovery larger than what's actually open as
      // of that month is rejected before anything is saved, rather than
      // silently saving a settlement the recovery ledger can't account for.
      const monthEndISO = format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0), "yyyy-MM-dd");
      const recoveryNow = Math.max(0, -expensePaid);
      // What's actually been applied to the advance ledger for this month so
      // far — read from expense_recovery_actions itself, not inferred from
      // the settlement's own previously saved expense_amount_paid. A
      // settlement recorded before this recovery-ledger existed carries a
      // negative expense_amount_paid that was never actually applied to any
      // claim, so trusting it here would make re-saving the same figure a
      // silent no-op (delta 0) instead of backfilling the recovery once.
      const { data: priorRecoveryActions } = await supabase
        .from("expense_recovery_actions")
        .select("amount")
        .eq("user_id", selectedUserId).eq("month", `${month}-01`).eq("note", "Recorded via My Payments");
      const recoveryAlready = (priorRecoveryActions || []).reduce((s, a) => s + Number(a.amount), 0);
      const recoveryDelta = recoveryNow - recoveryAlready;
      let advanceClaims: { id: string; amount: number; recovered_amount: number }[] = [];
      if (recoveryDelta > 0) {
        const { data } = await supabase
          .from("expense_claims")
          .select("id, amount, recovered_amount")
          .eq("user_id", selectedUserId).eq("entry_type", "advance").eq("status", "approved")
          .lte("claim_date", monthEndISO)
          .order("claim_date", { ascending: true });
        advanceClaims = data || [];
        const openTotal = advanceClaims.reduce((s, c) => s + Math.max(0, Number(c.amount) - (Number(c.recovered_amount) || 0)), 0);
        if (recoveryDelta > openTotal + 1e-9) {
          toast.error(`Only ${fmtBDT(openTotal)} in advances is open as of ${format(new Date(`${month}-01`), "MMMM yyyy")} — reduce the Expense amount.`);
          setSaving(false);
          setUploading(false);
          return;
        }
      }

      const { data: settlement, error } = await supabase.from("payroll_settlements").upsert({
        user_id: selectedUserId,
        month: `${month}-01`,
        net_hours_amount: finalSalaryNoExpense,
        net_hours_paid: netHoursPaidNow,
        expense_amount_paid: expensePaid,
        expense_paid: expensePaidNow,
        loan_amount_paid: loanPaid,
        loan_paid: loanPaidNow,
        note: note || null,
        attachments: allAttachments,
        paid_by: user.id,
        // Every (re-)recording opens a fresh approval round — a stale
        // approve/reject from a previous amount shouldn't carry over.
        approval_status: "pending_approval",
        approved_by: null,
        approved_at: null,
        rejection_reason: null,
      }, { onConflict: "user_id,month" }).select("*").single();
      if (error) throw error;
      setExistingAttachments(allAttachments);
      setAttachments([]);
      setExistingSettlement(settlement || null);

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

      // Apply a negative Expense amount — recovering an outstanding cash
      // advance (expense_claims.entry_type = "advance") — against the
      // employee's open advance claims, oldest first, so the Expense tab's
      // Advance total (and the Salary Summary's Expense/recovery column)
      // reflect it instead of showing the claim as still fully outstanding
      // forever. Only the delta vs what this settlement already recorded is
      // applied, same re-save guard as the loan ledger above; a *reduced*
      // recovery on re-save reverses the difference back off the most
      // recently recovered claims first (not bound by the month-end cutoff
      // above, since it's reversing a recovery already applied, not adding
      // a new one).
      if (recoveryDelta !== 0) {
        const claimsForDelta = recoveryDelta > 0
          ? advanceClaims
          : (await supabase
              .from("expense_claims")
              .select("id, amount, recovered_amount")
              .eq("user_id", selectedUserId).eq("entry_type", "advance").eq("status", "approved")
              .order("claim_date", { ascending: false })).data || [];
        let remaining = Math.abs(recoveryDelta);
        for (const claim of claimsForDelta) {
          if (remaining <= 0) break;
          const recovered = Number(claim.recovered_amount) || 0;
          const applied = recoveryDelta > 0
            ? Math.min(remaining, Number(claim.amount) - recovered)
            : -Math.min(remaining, recovered);
          if (applied === 0) continue;
          const newRecovered = recovered + applied;
          await supabase.from("expense_claims").update({
            recovered_amount: newRecovered,
            recovery_status: newRecovered <= 0 ? "open" : newRecovered >= Number(claim.amount) ? "fully_recovered" : "partially_recovered",
          }).eq("id", claim.id);
          await supabase.from("expense_recovery_actions").insert({
            expense_claim_id: claim.id, user_id: selectedUserId, action_type: "specific_amount",
            amount: applied, remaining_after: Number(claim.amount) - newRecovered,
            month: `${month}-01`, admin_id: user.id, note: "Recorded via My Payments",
          });
          remaining -= Math.abs(applied);
        }
      }

      toast.success("Payment recorded");
      fetchPaymentHistory();
      const monthLabel = format(new Date(`${month}-01`), "MMMM yyyy");
      const recordedEmployeeName = employees.find((e) => e.id === selectedUserId)?.full_name
        || employees.find((e) => e.id === selectedUserId)?.email || "An employee";
      const summary = `Net Salary ${netHoursPaidNow ? "paid" : "carried to next month"}, Expense ${fmtBDT(expensePaid)}, Loan ${fmtBDT(loanPaid)}.`;
      // Employee and their manager can both approve/reject it (whoever acts
      // first settles it) — admins are only informed, not asked to act.
      await notifyEmployee(
        selectedUserId,
        "Payment Recorded — Approval Needed",
        `Your ${monthLabel} payment was recorded: ${summary} Please review and approve.`,
        settlement?.id,
        { route: "/payment", type: "payroll_settlement_approval" },
      );
      await notifyManagersAndAdmins(
        `${recordedEmployeeName}'s Payment Recorded — Approval Needed`,
        `${recordedEmployeeName}'s ${monthLabel} payment was recorded: ${summary} Please review and approve.`,
        settlement?.id,
        { route: "/payment", type: "payroll_settlement_approval", requesterId: selectedUserId },
      );
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const adminRows = (admins || []).map((r) => ({
        user_id: r.user_id,
        type: "payroll_settlement",
        title: "Payment Recorded",
        message: `${recordedEmployeeName}'s ${monthLabel} payment was recorded: ${summary}`,
        related_id: settlement?.id || null,
        route: "/payment",
      }));
      if (adminRows.length) await supabase.from("notifications").insert(adminRows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const employeeName = employees.find((e) => e.id === selectedUserId)?.full_name || employees.find((e) => e.id === selectedUserId)?.email || "";

  const downloadReceipt = () => {
    downloadPaymentReceiptPDF({
      employeeName,
      monthLabel: format(new Date(`${month}-01`), "MMMM yyyy"),
      finalSalary: grossSalary,
      netAdjustment,
      finalSalaryNoExpense,
      expensePaid: Number(expenseAmount) || 0,
      loanPaid: Math.abs(Number(loanAmount) || 0),
      netPayment,
      note,
    });
  };

  // Net Payment for a recorded settlement: same "only counts while adjusted"
  // rule as the live card above, minus the live gross-salary fallback (not
  // stored on the settlement row itself) for an unchecked Net Salary.
  const netPaymentForHistoryRow = (h: PayrollSettlementRow) =>
    (h.net_hours_paid ? Number(h.net_hours_amount) || 0 : 0)
    + (h.expense_paid ? Number(h.expense_amount_paid) || 0 : 0)
    - (h.loan_paid ? Number(h.loan_amount_paid) || 0 : 0);

  const HISTORY_PAGE_SIZE = 10;
  const historyPageCount = Math.max(1, Math.ceil(paymentHistory.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedHistory = paymentHistory.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE);

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>My Payments</CardTitle>
        <CardDescription>Decide how much of this month's Net Salary, Expense balance and Loan due to pay now.</CardDescription>
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Net Salary</div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Gross Salary</span>
                    <span className="font-semibold">{fmtBDT(grossSalary)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-1">
                    <span className="text-muted-foreground">Net Adjustment</span>
                    <span className="font-semibold">{fmtBDT(netAdjustment)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-1">
                    <span className="text-muted-foreground">Final Salary (no Expense)</span>
                    <span className="font-semibold">{fmtBDT(finalSalaryNoExpense)}</span>
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={netHoursPaidNow} onCheckedChange={(v) => setNetHoursPaidNow(!!v)} />
                    Adjust Now (unchecked = carry to next month)
                  </label>
                </div>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Expense Balance</div>
                <div className="text-lg font-semibold">{fmtBDT(expenseOutstanding)}</div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={expensePaidNow} onCheckedChange={(v) => setExpensePaidNow(!!v)} />
                  Adjust Now (unchecked = carry to next month)
                </label>
                <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} disabled={!expensePaidNow || expenseOutstanding === 0} />
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Loan Due</div>
                <div className="text-lg font-semibold">
                  {loan ? fmtBDT(-loanDue) : "No active loan"}
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={loanPaidNow} onCheckedChange={(v) => setLoanPaidNow(!!v)} disabled={!loan} />
                  Adjust Now (unchecked = carry to next month)
                </label>
                <Input type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} disabled={!loan || !loanPaidNow || loanDue <= 0} />
                {loan && <p className="text-xs text-muted-foreground">{fmtBDT(loan.remaining_balance)} remaining balance</p>}
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Net Payment</div>
                <div className="text-lg font-semibold">{fmtBDT(netPayment)}</div>
                <p className="text-xs text-muted-foreground">
                  Only counts each card while its own Adjust Now is checked — unchecked Net Salary falls back to Gross Salary, unchecked Expense/Loan drop out entirely.
                </p>
              </div>
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div>
              {existingAttachments.length > 0 && (
                <div className="mb-1">
                  <Label className="text-xs">Attached</Label>
                  <AttachmentThumbnails urls={existingAttachments} />
                </div>
              )}
              <AttachmentsInput files={attachments} onChange={setAttachments} label="Attachment" buttonText="Upload" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={submit} disabled={saving || uploading}>{uploading ? "Uploading..." : saving ? "Recording..." : "Record Payment"}</Button>
              {existingSettlement && (
                <Button variant="outline" onClick={downloadReceipt}>Download Receipt</Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">Payment History</CardTitle>
          {paymentHistory.length > HISTORY_PAGE_SIZE && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" disabled={currentHistoryPage <= 1} onClick={() => setHistoryPage(currentHistoryPage - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground whitespace-nowrap">Page {currentHistoryPage} of {historyPageCount}</span>
              <Button variant="outline" size="sm" disabled={currentHistoryPage >= historyPageCount} onClick={() => setHistoryPage(currentHistoryPage + 1)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Month</TableHead>
                <TableHead>Net Salary</TableHead>
                <TableHead className="text-right">Expense Balance</TableHead>
                <TableHead className="text-right">Loan Due</TableHead>
                <TableHead className="text-right">Net Payment</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedHistory.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No payments recorded yet</TableCell></TableRow>
              ) : pagedHistory.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{h.profiles?.full_name || h.profiles?.email || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{format(new Date(h.month), "MMM yyyy")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{h.net_hours_paid ? `Paid ${fmtBDT(h.net_hours_amount)}` : "Carried forward"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{h.expense_paid ? fmtBDT(h.expense_amount_paid) : "—"}</TableCell>
                  <TableCell className="text-right">{h.loan_paid ? fmtBDT(-Number(h.loan_amount_paid)) : "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{fmtBDT(netPaymentForHistoryRow(h))}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deletePaymentHistory(h)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

/* =======================================================================
 * My Payments — employee's own read-only view of what admin has recorded
 * via MyPaymentsTab above: this month's Net Hours/Expense/Loan figures plus
 * a history of past settlements. No edit controls — admin is the only one
 * who records a settlement.
 * ===================================================================== */

function MyPaymentsSummary() {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [loading, setLoading] = useState(false);
  const [grossSalary, setGrossSalary] = useState(0);
  const [netAdjustment, setNetAdjustment] = useState(0);
  const [finalSalaryNoExpense, setFinalSalaryNoExpense] = useState(0);
  const [loan, setLoan] = useState<{ monthly_deduction: number; remaining_balance: number } | null>(null);
  const [expenseOutstanding, setExpenseOutstanding] = useState(0);
  const [settlement, setSettlement] = useState<PayrollSettlementRow | null>(null);
  const [history, setHistory] = useState<PayrollSettlementRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [employeeName, setEmployeeName] = useState("");
  const [teamPending, setTeamPending] = useState<PayrollSettlementRow[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!user?.id || !month) return;
    setLoading(true);
    (async () => {
      // Same month cutoff as the admin's My Payments tab: a claim/loan dated
      // after the viewed month hasn't happened yet as of that month.
      const monthEndISO = format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0), "yyyy-MM-dd");
      const [rows, { data: loanRow }, { data: settlementRow }, { data: claims }, { data: priorSettlements }, { data: historyRows }, { data: profile }] = await Promise.all([
        computeMonthlySalaryRows([user.id], [month]),
        supabase.from("personal_advances").select("monthly_deduction, remaining_balance")
          .eq("user_id", user.id).eq("status", "approved").gt("remaining_balance", 0)
          .lte("created_at", `${monthEndISO}T23:59:59`)
          .order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("payroll_settlements").select("*").eq("user_id", user.id).eq("month", `${month}-01`).maybeSingle(),
        supabase.from("expense_claims").select("amount, entry_type, recovered_amount").eq("user_id", user.id).eq("status", "approved").lte("claim_date", monthEndISO),
        // Excludes the viewed month's own settlement — that's the one being
        // shown right now, not a prior payment to subtract out (matches the
        // admin's My Payments tab).
        supabase.from("payroll_settlements").select("expense_amount_paid").eq("user_id", user.id).neq("month", `${month}-01`),
        supabase.from("payroll_settlements").select("*").eq("user_id", user.id).order("month", { ascending: false }),
        supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
      ]);

      const row = rows[0];
      setGrossSalary(row ? row.gross : 0);
      setNetAdjustment(row ? row.netAdjustment : 0);
      setFinalSalaryNoExpense(row ? row.final + row.recoveryTotal : 0);
      setLoan(loanRow || null);
      setSettlement(settlementRow || null);
      setEmployeeName(profile?.full_name || profile?.email || "");

      const expenseTotal = (claims || []).filter((c) => c.entry_type !== "advance").reduce((s, c) => s + Number(c.amount), 0);
      const advanceOutstanding = (claims || []).filter((c) => c.entry_type === "advance").reduce((s, c) => s + Math.max(0, Number(c.amount) - Number(c.recovered_amount || 0)), 0);
      // Only the positive (genuine expense reimbursement) portion of a prior
      // settlement counts here — a negative portion (advance recovery) is
      // now tracked directly on the claim via recovered_amount, so including
      // it here too would subtract it twice.
      const paidSoFar = (priorSettlements || []).reduce((s, p) => s + Math.max(0, Number(p.expense_amount_paid) || 0), 0);
      setExpenseOutstanding(expenseTotal - advanceOutstanding - paidSoFar);

      setHistory(historyRows || []);
      setLoading(false);
    })();
  }, [user?.id, month]);

  // Team members' settlements awaiting this user's approval as their manager
  // (RLS only returns rows can_approve() allows — nothing extra shows up for
  // a plain employee who manages no one).
  const fetchTeamPending = async () => {
    if (!user?.id) return;
    const { data } = await supabase.from("payroll_settlements")
      .select("*, profiles!payroll_settlements_user_id_fkey(full_name,email)")
      .eq("approval_status", "pending_approval")
      .neq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTeamPending(data || []);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTeamPending(); }, [user?.id]);

  const nameFor = (row: PayrollSettlementRow) =>
    row.user_id === user?.id ? (employeeName || "Your") : (row.profiles?.full_name || row.profiles?.email || "This employee's");

  const approveSettlement = async (row: PayrollSettlementRow) => {
    if (!user) return;
    setActing(true);
    const { data, error } = await supabase.from("payroll_settlements").update({
      approval_status: "approved", approved_by: user.id, approved_at: new Date().toISOString(),
    }).eq("id", row.id).select("id");
    setActing(false);
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Approve didn't go through — you may not have permission to approve this.");
    toast.success("Payment approved");
    await notifyEmployee(
      row.paid_by,
      "Payment Approved",
      `${nameFor(row)} ${format(new Date(row.month), "MMMM yyyy")} payment was approved.`,
      row.id,
      { route: "/payment", type: "payroll_settlement_update" },
    );
    if (row.user_id === user.id) {
      setSettlement((s) => (s ? { ...s, approval_status: "approved", approved_by: user.id, approved_at: new Date().toISOString() } : s));
    }
    fetchTeamPending();
  };

  const rejectSettlement = async (row: PayrollSettlementRow) => {
    if (!user) return;
    if (!rejectReason.trim()) return toast.error("A reason is required to reject.");
    setActing(true);
    const { data, error } = await supabase.from("payroll_settlements").update({
      approval_status: "rejected", approved_by: user.id, approved_at: new Date().toISOString(), rejection_reason: rejectReason.trim(),
    }).eq("id", row.id).select("id");
    setActing(false);
    if (error) return toast.error(error.message);
    if (!data?.length) return toast.error("Reject didn't go through — you may not have permission to reject this.");
    toast.success("Payment rejected");
    await notifyEmployee(
      row.paid_by,
      "Payment Rejected",
      `${nameFor(row)} ${format(new Date(row.month), "MMMM yyyy")} payment was rejected: ${rejectReason.trim()}`,
      row.id,
      { route: "/payment", type: "payroll_settlement_update" },
    );
    setRejectingId(null);
    setRejectReason("");
    if (row.user_id === user.id) {
      setSettlement((s) => (s ? { ...s, approval_status: "rejected", rejection_reason: rejectReason.trim() } : s));
    }
    fetchTeamPending();
  };

  const loanDue = loan ? Math.min(Number(loan.monthly_deduction), Number(loan.remaining_balance)) : 0;
  // Mirrors MyPaymentsTab's formula using the settlement's own saved
  // Adjust Now flags (defaulting to checked when nothing's recorded yet) and
  // its recorded paid amounts (falling back to the full outstanding balance
  // before anything's been recorded) — so a partial amount the admin entered
  // shows here too, not the full balance.
  const netPayment = ((settlement ? settlement.net_hours_paid : true) ? finalSalaryNoExpense : grossSalary)
    + ((settlement ? settlement.expense_paid : true) ? (settlement ? Number(settlement.expense_amount_paid) || 0 : expenseOutstanding) : 0)
    - ((settlement ? settlement.loan_paid : true) ? (settlement ? Number(settlement.loan_amount_paid) || 0 : loanDue) : 0);

  const downloadReceipt = () => {
    downloadPaymentReceiptPDF({
      employeeName,
      monthLabel: format(new Date(`${month}-01`), "MMMM yyyy"),
      finalSalary: grossSalary,
      netAdjustment,
      finalSalaryNoExpense,
      expensePaid: Number(settlement?.expense_amount_paid) || 0,
      loanPaid: Number(settlement?.loan_amount_paid) || 0,
      netPayment,
      note: settlement?.note,
    });
  };

  const HISTORY_PAGE_SIZE = 10;
  const historyPageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedHistory = history.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE);

  // Shown here for convenience, but the delete only ever actually succeeds
  // for an admin — payroll_settlements' DELETE policy is admin-only, so a
  // non-admin's click is rejected by RLS (0 rows matched) and reported as
  // "not allowed", same pattern as the admin's own History table.
  const deleteHistoryRow = async (row: PayrollSettlementRow) => {
    if (!window.confirm("Delete this payment record? This cannot be undone.")) return;
    const { data, error } = await supabase.from("payroll_settlements").delete().eq("id", row.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("You're not allowed to delete this payment record."); return; }
    toast.success("Payment record deleted");
    setHistory((h) => h.filter((r) => r.id !== row.id));
    if (settlement?.id === row.id) setSettlement(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Payments</CardTitle>
        <CardDescription>What's been recorded for your Net Salary, Expense balance and Loan due — read only.</CardDescription>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Net Salary</div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Gross Salary</span>
                    <span className="font-semibold">{fmtBDT(grossSalary)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Net Adjustment</span>
                    <span className="font-semibold">{fmtBDT(netAdjustment)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Final Salary (no Expense)</span>
                    <span className="font-semibold">{fmtBDT(finalSalaryNoExpense)}</span>
                  </div>
                </div>
                <Badge variant="outline">
                  {!settlement ? "Not recorded yet" : settlement.net_hours_paid ? "Paid" : "Carried to next month"}
                </Badge>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Expense Balance</div>
                <div className="text-lg font-semibold">{fmtBDT(expenseOutstanding)}</div>
                <Badge variant="outline">{settlement ? `Paid ${fmtBDT(settlement.expense_amount_paid)}` : "Not recorded yet"}</Badge>
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Loan Due</div>
                <div className="text-lg font-semibold">
                  {loan ? fmtBDT(-loanDue) : "No active loan"}
                </div>
                <Badge variant="outline">{settlement ? `Paid ${fmtBDT(settlement.loan_amount_paid)}` : "Not recorded yet"}</Badge>
                {loan && <p className="text-xs text-muted-foreground">{fmtBDT(loan.remaining_balance)} remaining balance</p>}
              </div>
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Net Payment</div>
                <div className="text-lg font-semibold">{fmtBDT(netPayment)}</div>
                <p className="text-xs text-muted-foreground">
                  Only counts each card while its own Adjust Now is checked — unchecked Net Salary falls back to Gross Salary, unchecked Expense/Loan drop out entirely.
                </p>
              </div>
            </div>
            {settlement?.note && (
              <p className="text-sm text-muted-foreground"><span className="font-medium">Note:</span> {settlement.note}</p>
            )}
            {settlement?.attachments?.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Attachments</p>
                <AttachmentThumbnails urls={settlement.attachments} />
              </div>
            )}
            {settlement && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    settlement.approval_status === "approved" ? "bg-success text-white" :
                    settlement.approval_status === "rejected" ? "bg-destructive text-white" : ""
                  }
                  variant={settlement.approval_status === "pending_approval" ? "outline" : undefined}
                >
                  {settlement.approval_status === "pending_approval" ? "Pending Your Approval"
                    : settlement.approval_status === "approved" ? "Approved" : "Rejected"}
                </Badge>
                {settlement.approval_status === "pending_approval" && (
                  <>
                    <Button size="sm" variant="outline" disabled={acting} onClick={() => approveSettlement(settlement)}>
                      <Check className="h-4 w-4 mr-1 text-success" />Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={acting} onClick={() => setRejectingId(settlement.id)}>
                      <X className="h-4 w-4 mr-1 text-destructive" />Reject
                    </Button>
                  </>
                )}
                {settlement.approval_status === "rejected" && settlement.rejection_reason && (
                  <span className="text-xs text-muted-foreground">Reason: {settlement.rejection_reason}</span>
                )}
              </div>
            )}
            {rejectingId === settlement?.id && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs">Reason for rejecting (required)</Label>
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                </div>
                <Button size="sm" variant="destructive" disabled={acting} onClick={() => rejectSettlement(settlement)}>Confirm Reject</Button>
                <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Cancel</Button>
              </div>
            )}
            {settlement && (
              <Button variant="outline" onClick={downloadReceipt}>Download Receipt</Button>
            )}

            {teamPending.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Team Payments Pending Your Approval</p>
                {teamPending.map((row) => (
                  <div key={row.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-medium">{row.profiles?.full_name || row.profiles?.email || "—"}</span>
                        {" · "}{format(new Date(row.month), "MMMM yyyy")}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={acting} onClick={() => approveSettlement(row)}>
                          <Check className="h-4 w-4 mr-1 text-success" />Approve
                        </Button>
                        <Button size="sm" variant="outline" disabled={acting} onClick={() => setRejectingId(row.id)}>
                          <X className="h-4 w-4 mr-1 text-destructive" />Reject
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Net Salary {row.net_hours_paid ? `${fmtBDT(row.net_hours_amount)} paid` : "carried to next month"}, Expense {fmtBDT(row.expense_amount_paid)}, Loan {fmtBDT(row.loan_amount_paid)}.
                    </p>
                    {rejectingId === row.id && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[200px]">
                          <Label className="text-xs">Reason for rejecting (required)</Label>
                          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                        </div>
                        <Button size="sm" variant="destructive" disabled={acting} onClick={() => rejectSettlement(row)}>Confirm Reject</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>Cancel</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm font-medium">History</p>
                {history.length > HISTORY_PAGE_SIZE && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" disabled={currentHistoryPage <= 1} onClick={() => setHistoryPage(currentHistoryPage - 1)}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                    </Button>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Page {currentHistoryPage} of {historyPageCount}</span>
                    <Button variant="outline" size="sm" disabled={currentHistoryPage >= historyPageCount} onClick={() => setHistoryPage(currentHistoryPage + 1)}>
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Net Salary</TableHead>
                      <TableHead className="text-right">Expense Paid</TableHead>
                      <TableHead className="text-right">Loan Paid</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedHistory.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No payments recorded yet</TableCell></TableRow>
                    ) : pagedHistory.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="whitespace-nowrap">{format(new Date(h.month), "MMM yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{h.net_hours_paid ? `Paid ${fmtBDT(h.net_hours_amount)}` : "Carried forward"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtBDT(h.expense_amount_paid)}</TableCell>
                        <TableCell className="text-right">{fmtBDT(h.loan_amount_paid)}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteHistoryRow(h)}>
                            <Trash2 className="h-4 w-4 mr-1" /> Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

          </>
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

const PAYMENT_STATUS_LABEL: Record<SalaryMonthRow["paymentStatus"], string> = {
  not_paid: "Not Paid",
  partial: "Partially Paid",
  paid: "Paid",
};

function exportAdminSalaryCSV(rows: SalaryMonthRow[]) {
  const headers = [
    "Employee", "Month", "Gross", "Basic (50%)", "House Rent (35%)", "Conveyance (10%)", "Medical (5%)",
    "+ OT Payment", "- Due Deduction", "Net Adjustment", "- Expense", "Loan", "Final", "Payment Status",
  ];
  const dataRows = rows.map((r) => [
    r.name,
    fmtMonthLabel(r.month),
    r.gross,
    r.basic,
    r.houseRent,
    r.conveyance,
    r.medical,
    r.otPayment,
    -r.dueDeduction,
    r.netAdjustment,
    -r.recoveryTotal,
    r.loanPaid,
    r.final,
    PAYMENT_STATUS_LABEL[r.paymentStatus],
  ]);
  const csvField = (value: unknown) => {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...dataRows].map((row) => row.map(csvField).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `monthly-salary-summary-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
}

function SalaryMonthlyTableView({ rows, showEmployee, loading }: { rows: SalaryMonthRow[]; showEmployee: boolean; loading: boolean }) {
  const colCount = (showEmployee ? 12 : 10) + 2;
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
            <TableHead className="text-right">Loan</TableHead>
            <TableHead className="text-right">Final</TableHead>
            <TableHead>Payment Status</TableHead>
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
              <TableCell className="text-right">{fmtBDT(r.loanPaid)}</TableCell>
              <TableCell className="text-right font-semibold">{fmtBDT(r.final)}</TableCell>
              <TableCell>
                <Badge variant={r.paymentStatus === "paid" ? "default" : "outline"}>{PAYMENT_STATUS_LABEL[r.paymentStatus]}</Badge>
              </TableCell>
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
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">Monthly Salary Summary — All Employees</CardTitle>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => exportAdminSalaryCSV(rows)}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    entry_type: "expense" as "expense" | "advance", category: "Travel", otherCategory: "",
    amount: "", claim_date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "",
  });
  const [uploading, setUploading] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterMonth, setFilterMonth] = useState("");
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

  useEffect(() => {
    fetchClaims();
    fetchCategories();
    (async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      setEmployees(data || []);
      setSelectedIds((data || []).map((e) => e.id));
    })();
  }, []);

  // Category list is the same regardless of which Type (Expense/Advance) is
  // selected — no more per-type filtering.
  const allCategories = useMemo(
    () => Array.from(new Set(expenseTypes.map((t) => t.name))),
    [expenseTypes],
  );

  const toggleEmployee = (id: string) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

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
    const category = form.category === "Other" ? (form.otherCategory.trim() || "Other") : form.category;
    // Direction used to be a separate field the employee picked by hand; it's
    // now implied by Entry Type - an Advance is cash given up front that the
    // employee owes back, an Expense is a reimbursement the company owes them.
    const direction = form.entry_type === "advance" ? "employee_owes_company" : "company_pays_employee";
    const { data: inserted, error } = await supabase.from("expense_claims").insert({
      user_id: user?.id,
      category,
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
    setForm({ entry_type: "expense", category: allCategories[0] || "Travel", otherCategory: "", amount: "", claim_date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "" });
    await notifyManagersAndAdmins(
      "Expense Claim Submitted",
      `${user?.email} submitted a ${category} claim for ${form.amount}.`,
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

  const deleteClaim = async (id: string) => {
    if (!window.confirm("Delete this claim? This cannot be undone.")) return;
    // RLS blocking this doesn't error — it just matches 0 rows, which would
    // otherwise look like silent success while the row stays put.
    const { data, error } = await supabase.from("expense_claims").delete().eq("id", id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("Delete didn't go through — you may not have permission to delete this."); return; }
    toast.success("Claim deleted");
    fetchClaims();
  };

  // An explicit date range is more specific than Month, so it takes over
  // whenever either end is set — the two controls are not combined.
  const effectiveRange = useMemo(() => {
    if (filterFromDate || filterToDate) return { from: filterFromDate, to: filterToDate };
    return monthFilterToRange(filterMonth, filterMonth);
  }, [filterMonth, filterFromDate, filterToDate]);

  const filteredClaims = claims.filter((c) => {
    if (!selectedIds.includes(c.user_id)) return false;
    if (effectiveRange.from && c.claim_date < effectiveRange.from) return false;
    if (effectiveRange.to && c.claim_date > effectiveRange.to) return false;
    return true;
  });

  const advanceTotal = filteredClaims.filter(c => c.entry_type === "advance" && c.status === "approved").reduce((s, c) => s + Math.max(0, Number(c.amount) - Number(c.recovered_amount || 0)), 0);
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
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={(v)=>setForm({...form, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allCategories.length === 0 ? (
                      <SelectItem value="none" disabled>No categories yet</SelectItem>
                    ) : allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.category === "Other" && (
                <div><Label>Other</Label>
                  <Input placeholder="Specify category" value={form.otherCategory} onChange={(e)=>setForm({...form, otherCategory: e.target.value})} />
                </div>
              )}
              <div><Label>Type</Label>
                <Select value={form.entry_type} onValueChange={(v) => setForm((f) => ({ ...f, entry_type: v as "expense" | "advance" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ENTRY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter Options</CardTitle>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">Employees</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-64 justify-start font-normal">
                    Employees ({selectedIds.length} selected)
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2">
                  <div className="max-h-36 overflow-y-auto space-y-1">
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
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1"><Label className="text-xs">Month</Label><Input type="month" value={filterMonth} disabled={!!(filterFromDate || filterToDate)} onChange={(e) => setFilterMonth(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={filterFromDate} onChange={(e) => setFilterFromDate(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={filterToDate} onChange={(e) => setFilterToDate(e.target.value)} /></div>
            {(filterMonth || filterFromDate || filterToDate) && (
              <Button size="sm" variant="ghost" onClick={() => { setFilterMonth(""); setFilterFromDate(""); setFilterToDate(""); }}>Clear</Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardHeader className="pb-2"><CardDescription>Advance</CardDescription><CardTitle>{advanceTotal.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Expense</CardDescription><CardTitle>{expenseTotal.toLocaleString()}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Net Amount</CardDescription><CardTitle className={netAmount < 0 ? "text-destructive" : ""}>{netAmount.toLocaleString()}</CardTitle></CardHeader></Card>
      </div>

      <ClaimTable
        claims={filteredClaims}
        showEmployee
        isAdmin={isAdmin}
        canApprove={canApprove}
        currentUserId={user?.id}
        onApprove={(id: string) => decide(id, "approved")}
        onReject={(id: string) => decide(id, "rejected")}
        onTogglePaid={markPaid}
        onDelete={deleteClaim}
      />
    </div>
  );
}

const ClaimTable = ({ claims, showEmployee, onApprove, onReject, onTogglePaid, onDelete, isAdmin, canApprove, currentUserId }: any) => (
  <Card>
    <CardHeader><CardTitle className="text-base">Claim History</CardTitle></CardHeader>
    <CardContent>
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showEmployee && <TableHead>Employee</TableHead>}
            <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Type</TableHead><TableHead>Direction</TableHead><TableHead>Amount</TableHead><TableHead>Description</TableHead><TableHead>Receipt</TableHead><TableHead>Status</TableHead><TableHead>Approved/Rejected By</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.length === 0 ? <TableRow><TableCell colSpan={showEmployee ? 11 : 10} className="text-center text-muted-foreground">No claims</TableCell></TableRow> :
            claims.map((c: any) => {
              const canDecide = canApprove && c.status === "pending" && c.user_id !== currentUserId;
              return (
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
                <TableCell>
                  <div className="flex gap-1">
                    {canDecide && (
                      <>
                        <Button size="icon" variant="outline" onClick={()=>onApprove?.(c.id)}><Check className="h-4 w-4 text-success" /></Button>
                        <Button size="icon" variant="outline" onClick={()=>onReject?.(c.id)}><X className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                    {isAdmin && (
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={()=>onDelete?.(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
        </TableBody>
      </Table>
      </div>
    </CardContent>
  </Card>
);
