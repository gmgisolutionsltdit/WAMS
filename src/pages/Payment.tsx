import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X, FileText, AlertTriangle, Loader2, Wallet, Download, Calculator } from "lucide-react";
import { toast } from "sonner";
import { toast as toastHook } from "@/hooks/use-toast";
import { format } from "date-fns";
import { notifyManagersAndAdmins, notifyEmployee } from "@/lib/notifications";
import {
  MONTHS,
  fmtMoney,
  computePayroll,
  computeGratuity,
  downloadPayslipPDF,
  applyDuePersonalAdvanceDeduction,
  type PayrollProfile,
  type PayrollComputation,
} from "@/lib/payroll";
import { PayrollProcessor } from "@/components/hrms/PayrollProcessor";
import { PayslipCard } from "@/components/hrms/PayslipCard";
import { LoanLedger } from "@/components/hrms/LoanLedger";
import { PayrollAdjustments } from "@/components/PayrollAdjustments";

type AdvanceKind = "personal" | "expense";

type UnifiedAdvance = {
  kind: AdvanceKind;
  raw: any;
};

const todayISO = () => format(new Date(), "yyyy-MM-dd");

const Payment = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  // canApprove per-row is determined by can_approve() via RLS visibility — for
  // showing approve/reject buttons client-side, treat any row visible in the
  // "Pending Approval" tab as approvable by the current viewer (RLS already
  // filtered what they can see/update), same pattern as Expenses.tsx's
  // `canApprove = role === "admin" || role === "manager"` gate for the tab itself.
  const canApprove = role === "admin" || role === "manager";

  const [personalAdvances, setPersonalAdvances] = useState<any[]>([]);
  const [expenseAdvances, setExpenseAdvances] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // Expense Advance request only — Personal Advance requests stay removed.
  const [requestOpen, setRequestOpen] = useState(false);
  const [expenseRequestForm, setExpenseRequestForm] = useState({ amount: "", purpose: "", settle_by: "" });

  const [settleDialogId, setSettleDialogId] = useState<string | null>(null);
  const [settleReceipts, setSettleReceipts] = useState<{ amount: string; url: string }[]>([{ amount: "", url: "" }]);
  const [settling, setSettling] = useState(false);

  const [deductDialogId, setDeductDialogId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const fetchAll = async () => {
    const [{ data: pa, error: paErr }, { data: ea, error: eaErr }] = await Promise.all([
      supabase.from("personal_advances").select("*, profiles!personal_advances_user_id_fkey(full_name,email,photo_url,employee_status)").order("created_at", { ascending: false }),
      supabase.from("expense_advances").select("*, profiles!expense_advances_user_id_fkey(full_name,email,photo_url,employee_status)").order("created_at", { ascending: false }),
    ]);
    if (paErr) { toast.error(paErr.message); return; }
    if (eaErr) { toast.error(eaErr.message); return; }

    // Lazy settle_by conversion: any approved expense advance past its
    // settle_by deadline is converted into a Personal Advance for payroll
    // deduction. Only rows already visible to this viewer (RLS-filtered)
    // are considered, and only still-'approved' rows are acted on, so a
    // row already 'converted' is skipped naturally on a later fetch.
    const overdue = (ea || []).filter((row: any) => row.status === "approved" && row.settle_by < todayISO());
    for (const row of overdue) {
      try {
        const amount = Number(row.amount);
        const { data: newAdvance, error: insErr } = await supabase.from("personal_advances").insert({
          user_id: row.user_id,
          amount,
          reason: `Auto-converted from unsettled Expense Advance (purpose: ${row.purpose || "—"})`,
          installments: 1,
          monthly_deduction: amount,
          remaining_balance: amount,
          status: "approved",
          approved_by: null,
          approver_note: "Auto-converted on missed settle_by deadline",
          approved_at: new Date().toISOString(),
        }).select().single();
        if (insErr || !newAdvance) continue;
        await supabase.from("personal_advance_actions").insert({
          personal_advance_id: newAdvance.id,
          user_id: row.user_id,
          action_type: "issued",
          amount,
          remaining_after: amount,
          note: "Created by auto-conversion",
          created_by: user?.id,
        });
        await supabase.from("expense_advances").update({
          status: "converted",
          converted_to_personal_advance_id: newAdvance.id,
        }).eq("id", row.id);
        await supabase.from("expense_advance_actions").insert({
          expense_advance_id: row.id,
          user_id: row.user_id,
          action_type: "converted_to_personal_advance",
          amount,
          created_by: user?.id,
        });
        await notifyEmployee(
          row.user_id,
          "Expense Advance Converted",
          `Your unsettled expense advance of ${amount} was converted to a Personal Advance for payroll deduction.`,
          newAdvance.id,
          { route: "/payment", type: "expense_advance_converted" },
        );
      } catch {
        // best-effort; leave the row for the next fetch to retry
      }
    }

    setPersonalAdvances(pa || []);
    if (overdue.length > 0) {
      const { data: ea2 } = await supabase.from("expense_advances").select("*, profiles!expense_advances_user_id_fkey(full_name,email,photo_url,employee_status)").order("created_at", { ascending: false });
      setExpenseAdvances(ea2 || []);
    } else {
      setExpenseAdvances(ea || []);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const unified: UnifiedAdvance[] = [
    ...personalAdvances.map((raw) => ({ kind: "personal" as const, raw })),
    ...expenseAdvances.map((raw) => ({ kind: "expense" as const, raw })),
  ].sort((a, b) => new Date(b.raw.created_at).getTime() - new Date(a.raw.created_at).getTime());

  const mine = unified.filter((u) => u.raw.user_id === user?.id);
  const pendingApprovals = unified.filter((u) => u.raw.status === "pending" && u.raw.user_id !== user?.id);
  const teamHistory = unified.filter((u) => u.raw.user_id !== user?.id);

  const hasActiveExpense = expenseAdvances.some((r) => r.user_id === user?.id && ["pending", "approved"].includes(r.status));

  const submitExpenseAdvanceRequest = async () => {
    if (!user) return;
    const amount = Number(expenseRequestForm.amount);
    if (!amount || amount <= 0) return toast.error("Amount must be greater than 0");
    if (!expenseRequestForm.settle_by) return toast.error("Settle By date is required");
    if (expenseRequestForm.settle_by <= todayISO()) return toast.error("Settle By must be a future date");
    if (hasActiveExpense) return toast.error("You already have an active Expense Advance request.");
    const { data: inserted, error } = await supabase.from("expense_advances").insert({
      user_id: user.id,
      amount,
      purpose: expenseRequestForm.purpose || null,
      settle_by: expenseRequestForm.settle_by,
    }).select().single();
    if (error) {
      if ((error as any).code === "23505") return toast.error("You already have an active Expense Advance request.");
      return toast.error(error.message);
    }
    toast.success("Expense Advance requested");
    setRequestOpen(false);
    setExpenseRequestForm({ amount: "", purpose: "", settle_by: "" });
    await notifyManagersAndAdmins(
      "Expense Advance Requested",
      `${user.email} requested an Expense Advance of ${amount}.`,
      inserted?.id,
      { route: "/payment", type: "expense_advance", requesterId: user.id },
    );
    fetchAll();
  };

  const decide = async (item: UnifiedAdvance, status: "approved" | "rejected") => {
    if (!user) return;
    const { kind, raw } = item;
    const table = kind === "personal" ? "personal_advances" : "expense_advances";
    const { error } = await supabase.from(table).update({
      status, approved_by: user.id, approved_at: new Date().toISOString(),
    }).eq("id", raw.id);
    if (error) return toast.error(error.message);

    if (kind === "personal" && status === "approved") {
      await supabase.from("personal_advance_actions").insert({
        personal_advance_id: raw.id, user_id: raw.user_id, action_type: "issued",
        amount: raw.amount, remaining_after: raw.amount, created_by: user.id,
      });
    } else if (kind === "expense") {
      await supabase.from("expense_advance_actions").insert({
        expense_advance_id: raw.id, user_id: raw.user_id,
        action_type: status === "approved" ? "approved" : "rejected",
        amount: raw.amount, created_by: user.id,
      });
    }
    // Personal Advance rejection: no ledger row. Rejecting is terminal and no
    // balance ever existed, so an 'issued' row would misrepresent the event,
    // and 'rejected' is not among the documented personal_advance_actions
    // action_type values — skipped rather than inventing an undocumented one.

    toast.success(`${kind === "personal" ? "Personal" : "Expense"} Advance ${status}`);
    await notifyEmployee(
      raw.user_id,
      `${kind === "personal" ? "Personal" : "Expense"} Advance ${status === "approved" ? "Approved" : "Rejected"}`,
      `Your ${kind === "personal" ? "Personal" : "Expense"} Advance of ${raw.amount} was ${status}.`,
      raw.id,
      { route: "/payment", type: `${kind}_advance_update` },
    );
    fetchAll();
  };

  const uploadSettleReceipt = async (idx: number, file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}_${idx}.${ext}`;
    const { error } = await supabase.storage.from("task-attachments").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
    setSettleReceipts((rows) => rows.map((r, i) => i === idx ? { ...r, url: data?.signedUrl || "" } : r));
    setUploading(false);
  };

  const submitSettlement = async () => {
    if (!settleDialogId) return;
    const advance = expenseAdvances.find((r) => r.id === settleDialogId);
    if (!advance) return;
    const validReceipts = settleReceipts.filter((r) => r.amount && Number(r.amount) > 0);
    if (validReceipts.length === 0) return toast.error("Add at least one receipt with an amount");
    const spentTotal = validReceipts.reduce((s, r) => s + Number(r.amount), 0);
    const amount = Number(advance.amount);
    let settlementDirection: "refund_to_company" | "reimburse_to_employee" | null = null;
    let settlementAmount = 0;
    if (spentTotal < amount) {
      settlementDirection = "refund_to_company";
      settlementAmount = amount - spentTotal;
    } else if (spentTotal > amount) {
      settlementDirection = "reimburse_to_employee";
      settlementAmount = spentTotal - amount;
    } else {
      settlementDirection = null;
      settlementAmount = 0;
    }
    setSettling(true);
    const newReceipts = [
      ...(advance.receipts || []),
      ...validReceipts.map((r) => ({ url: r.url, amount: Number(r.amount), uploaded_at: new Date().toISOString() })),
    ];
    const { error } = await supabase.from("expense_advances").update({
      receipts: newReceipts,
      spent_total: spentTotal,
      settlement_direction: settlementDirection,
      settlement_amount: settlementAmount,
      settled_at: new Date().toISOString(),
      status: "settled",
    }).eq("id", advance.id);
    setSettling(false);
    if (error) return toast.error(error.message);
    await supabase.from("expense_advance_actions").insert({
      expense_advance_id: advance.id, user_id: advance.user_id,
      action_type: "settled", amount: settlementAmount, created_by: user?.id,
    });
    toast.success("Expense Advance settled");
    setSettleDialogId(null);
    setSettleReceipts([{ amount: "", url: "" }]);
    fetchAll();
  };

  // Kept as a manual fallback for off-cycle corrections — Personal Advance
  // deductions are now applied automatically whenever payroll is generated
  // (see applyDuePersonalAdvanceDeduction, called from PayrollTab below).
  // Both paths share that same function, so whichever runs first for a given
  // month "wins" and the other becomes a no-op — never a double deduction.
  const recordDeduction = async (advance: any) => {
    if (!user) return;
    setRecording(true);
    try {
      const { data: profileRow, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, designation, department, company_wing, joining_date, base_salary, hourly_overtime_rate, pf_contribution_pct, employee_status")
        .eq("id", advance.user_id)
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
        toast.error("No active Personal Advance found for this employee.");
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

  const isResigned = (item: UnifiedAdvance) => item.raw.profiles?.employee_status === "Resigned";
  const hasOutstanding = (item: UnifiedAdvance) =>
    item.kind === "personal" ? Number(item.raw.remaining_balance) > 0 : item.raw.status === "approved";

  const renderRow = (item: UnifiedAdvance, showEmployee: boolean) => {
    const { kind, raw } = item;
    return (
      <TableRow key={`${kind}-${raw.id}`}>
        {showEmployee && <TableCell>{raw.profiles?.full_name || raw.profiles?.email || "—"}</TableCell>}
        <TableCell><Badge variant="outline">{kind === "personal" ? "Personal Advance" : "Expense Advance"}</Badge></TableCell>
        <TableCell>{format(new Date(raw.created_at), "MMM d, yyyy")}</TableCell>
        <TableCell className="font-semibold">{Number(raw.amount).toLocaleString()}</TableCell>
        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
          {kind === "personal" ? (raw.reason || "—") : (raw.purpose || "—")}
        </TableCell>
        <TableCell>
          {kind === "personal" ? (
            <span>{Number(raw.remaining_balance).toLocaleString()} left</span>
          ) : (
            <span>Settle by {raw.settle_by}</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1 flex-wrap">
            <Badge className={
              raw.status === "approved" ? "bg-success text-white" :
              raw.status === "rejected" ? "bg-destructive text-white" :
              raw.status === "closed" || raw.status === "settled" ? "" : ""
            } variant={raw.status === "pending" ? "outline" : undefined}>{raw.status}</Badge>
            {kind === "personal" && raw.admin_flag && (
              <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Flagged</Badge>
            )}
            {isResigned(item) && hasOutstanding(item) && (
              <Badge variant="destructive">Outstanding — employee resigned</Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            {kind === "expense" && raw.status === "approved" && raw.user_id === user?.id && (
              <Button size="sm" variant="outline" onClick={() => { setSettleDialogId(raw.id); setSettleReceipts([{ amount: "", url: "" }]); }}>Settle</Button>
            )}
            {kind === "personal" && raw.status === "approved" && Number(raw.remaining_balance) > 0 && canApprove && raw.user_id !== user?.id && (
              <Button size="sm" variant="outline" onClick={() => setDeductDialogId(raw.id)}>Record This Month's Deduction</Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const settleAdvance = settleDialogId ? expenseAdvances.find((r) => r.id === settleDialogId) : null;
  const deductAdvance = deductDialogId ? personalAdvances.find((r) => r.id === deductDialogId) : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Payment</h1>
          <p className="text-sm text-muted-foreground">Request and manage Personal and Expense Advances.</p>
        </div>
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My Payments</TabsTrigger>
          {canApprove && <TabsTrigger value="pending">Pending Approval ({pendingApprovals.length})</TabsTrigger>}
          {canApprove && <TabsTrigger value="history">Team History</TabsTrigger>}
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="expense-claims">Expense Claims</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={requestOpen} onOpenChange={(o) => { setRequestOpen(o); if (!o) setExpenseRequestForm({ amount: "", purpose: "", settle_by: "" }); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Expense Advance</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Request Expense Advance</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount</Label><Input type="number" value={expenseRequestForm.amount} onChange={(e) => setExpenseRequestForm((f) => ({ ...f, amount: e.target.value }))} /></div>
                    <div><Label>Settle By</Label><Input type="date" value={expenseRequestForm.settle_by} onChange={(e) => setExpenseRequestForm((f) => ({ ...f, settle_by: e.target.value }))} /></div>
                  </div>
                  <div><Label>Purpose</Label><Textarea value={expenseRequestForm.purpose} onChange={(e) => setExpenseRequestForm((f) => ({ ...f, purpose: e.target.value }))} /></div>
                </div>
                <DialogFooter><Button onClick={submitExpenseAdvanceRequest}>Submit</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead>
                    <TableHead>Details</TableHead><TableHead>Balance / Settle By</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mine.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No payment requests</TableCell></TableRow>
                  ) : mine.map((item) => renderRow(item, false))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canApprove && (
          <TabsContent value="pending">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead>
                      <TableHead>Details</TableHead><TableHead>Balance / Settle By</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingApprovals.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No pending requests</TableCell></TableRow>
                    ) : pendingApprovals.map((item) => (
                      <TableRow key={`${item.kind}-${item.raw.id}`}>
                        <TableCell>{item.raw.profiles?.full_name || item.raw.profiles?.email || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{item.kind === "personal" ? "Personal Advance" : "Expense Advance"}</Badge></TableCell>
                        <TableCell>{format(new Date(item.raw.created_at), "MMM d, yyyy")}</TableCell>
                        <TableCell className="font-semibold">{Number(item.raw.amount).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{item.kind === "personal" ? (item.raw.reason || "—") : (item.raw.purpose || "—")}</TableCell>
                        <TableCell>{item.kind === "personal" ? `${item.raw.installments} installments` : `Settle by ${item.raw.settle_by}`}</TableCell>
                        <TableCell><Badge variant="outline">{item.raw.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="outline" onClick={() => decide(item, "approved")}><Check className="h-4 w-4 text-success" /></Button>
                            <Button size="icon" variant="outline" onClick={() => decide(item, "rejected")}><X className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canApprove && (
          <TabsContent value="history">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Amount</TableHead>
                      <TableHead>Details</TableHead><TableHead>Balance / Settle By</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamHistory.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No records</TableCell></TableRow>
                    ) : teamHistory.map((item) => renderRow(item, true))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="payroll">
          <PayrollTab />
        </TabsContent>

        <TabsContent value="expense-claims">
          <ExpenseClaimsTab />
        </TabsContent>
      </Tabs>

      {/* Settle Expense Advance dialog */}
      <Dialog open={!!settleDialogId} onOpenChange={(o) => { if (!o) { setSettleDialogId(null); setSettleReceipts([{ amount: "", url: "" }]); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Settle Expense Advance</DialogTitle></DialogHeader>
          {settleAdvance && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Advance amount: {Number(settleAdvance.amount).toLocaleString()}</p>
              {settleReceipts.map((r, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-3 items-end">
                  <div><Label>Receipt Amount</Label><Input type="number" value={r.amount} onChange={(e) => setSettleReceipts((rows) => rows.map((row, i) => i === idx ? { ...row, amount: e.target.value } : row))} /></div>
                  <div>
                    <Label>Receipt File</Label>
                    <Input type="file" accept="image/*,application/pdf" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadSettleReceipt(idx, e.target.files[0])} />
                    {r.url && <a className="text-xs text-primary underline" href={r.url} target="_blank" rel="noreferrer">View attached</a>}
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setSettleReceipts((rows) => [...rows, { amount: "", url: "" }])}>Add Another Receipt</Button>
              <p className="text-sm font-medium">
                Total spent: {settleReceipts.reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString()}
              </p>
            </div>
          )}
          <DialogFooter><Button onClick={submitSettlement} disabled={settling || uploading}>{settling ? "Submitting..." : "Submit Settlement"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record This Month's Deduction dialog */}
      <Dialog open={!!deductDialogId} onOpenChange={(o) => { if (!o) setDeductDialogId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record This Month's Deduction</DialogTitle></DialogHeader>
          {deductAdvance && (
            <div className="space-y-2 text-sm">
              <p>Month: {format(new Date(), "MMMM yyyy")}</p>
              <p>Monthly deduction: {Number(deductAdvance.monthly_deduction).toLocaleString()}</p>
              <p>Remaining balance: {Number(deductAdvance.remaining_balance).toLocaleString()}</p>
              <p className="text-muted-foreground">Proposed amount: {Math.min(Number(deductAdvance.monthly_deduction), Number(deductAdvance.remaining_balance)).toLocaleString()} (may be further capped by this month's net pay)</p>
            </div>
          )}
          <DialogFooter><Button onClick={() => deductAdvance && recordDeduction(deductAdvance)} disabled={recording}>{recording ? "Recording..." : "Record Deduction"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payment;

/* =======================================================================
 * Payroll tab — moved from the former src/pages/Payroll.tsx (now deleted).
 * Self-contained: reads its own auth/role so its internals never leak into
 * (or collide with) Payment's own state/handlers.
 * ===================================================================== */

type PayrollRecord = PayrollComputation & { id: string; status: string; generated_at: string };

const payrollNow = new Date();
const DEFAULT_MONTH = payrollNow.getMonth() + 1;
const DEFAULT_YEAR = payrollNow.getFullYear();

function PayrollTab() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const canAccess = isAdmin;

  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [currency, setCurrency] = useState<string>("BDT");
  const [profiles, setProfiles] = useState<PayrollProfile[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [payslipFor, setPayslipFor] = useState<{ profile: PayrollProfile; record: PayrollRecord } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: settings }, { data: profs, error: pErr }, { data: recs, error: rErr }] = await Promise.all([
        supabase.from("settings").select("currency").limit(1).maybeSingle(),
        supabase.from("profiles").select("id, full_name, email, designation, department, company_wing, joining_date, base_salary, hourly_overtime_rate, pf_contribution_pct, employee_status").order("full_name"),
        supabase.from("payroll_records").select("*").eq("period_year", year).eq("period_month", month),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      if (settings?.currency) setCurrency(settings.currency);
      setProfiles((profs || []) as PayrollProfile[]);
      setRecords((recs || []) as unknown as PayrollRecord[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load payroll data";
      toastHook({ title: "Load failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { if (canAccess) fetchAll(); }, [fetchAll, canAccess]);

  const recordByUser = useMemo(() => {
    const m = new Map<string, PayrollRecord>();
    records.forEach((r) => m.set(r.user_id, r));
    return m;
  }, [records]);

  const totalPayout = useMemo(
    () => records.reduce((s, r) => s + Number(r.net_pay || 0), 0),
    [records],
  );
  const totalGross = useMemo(
    () => records.reduce((s, r) => s + Number(r.gross_pay || 0), 0),
    [records],
  );
  const totalPF = useMemo(
    () => records.reduce((s, r) => s + Number(r.pf_employee || 0) + Number(r.pf_employer || 0), 0),
    [records],
  );
  const activeProfiles = useMemo(
    () => profiles.filter((p) => p.employee_status === "Active"),
    [profiles],
  );

  const exportPayrollReport = () => {
    const header = ["Employee", "Email", "Designation", "Department", "Base Salary", "OT Hours", "OT Amount", "Incentives", "Gross Pay", "PF (Employee)", "PF (Employer)", "Other Deductions", "Net Pay", "Status"];
    const rows = activeProfiles.map((p) => {
      const r = recordByUser.get(p.id);
      return [
        p.full_name || "", p.email || "", p.designation || "", p.department || "",
        p.base_salary, r?.ot_hours ?? "", r?.ot_amount ?? "", r?.incentives_amount ?? "",
        r?.gross_pay ?? "", r?.pf_employee ?? "", r?.pf_employer ?? "", r?.other_deductions ?? "",
        r?.net_pay ?? "", r ? r.status : "Not generated",
      ];
    });
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Payroll_Report_${MONTHS[month - 1]}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateAll = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const eligible = activeProfiles.filter((p) => Number(p.base_salary) > 0);
      if (eligible.length === 0) {
        toastHook({ title: "Nothing to process", description: "No active employees have a base salary set." });
        return;
      }
      let created = 0; let skipped = 0;
      for (const profile of eligible) {
        if (recordByUser.has(profile.id)) { skipped++; continue; }
        // Apply any due Personal Advance installment before computing payroll,
        // so other_deductions/net_pay already reflect it — idempotent, so
        // regenerating payroll for this month never double-deducts.
        await applyDuePersonalAdvanceDeduction(profile, year, month, user.id);
        const calc = await computePayroll(profile, year, month, currency);
        const { error } = await supabase.from("payroll_records").insert({
          ...calc,
          generated_by: user.id,
          status: "processed",
        });
        if (error) throw error;
        created++;
      }
      toastHook({
        title: "Payroll generated",
        description: `${created} created, ${skipped} already existed for ${MONTHS[month - 1]} ${year}.`,
      });
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate payroll";
      toastHook({ title: "Generation failed", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateOne = async (profile: PayrollProfile) => {
    if (!user) return;
    if (Number(profile.base_salary) <= 0) {
      toastHook({ title: "Missing salary", description: `Set base salary for ${profile.full_name || profile.email} first.`, variant: "destructive" });
      return;
    }
    try {
      await applyDuePersonalAdvanceDeduction(profile, year, month, user.id);
      const calc = await computePayroll(profile, year, month, currency);
      const existing = recordByUser.get(profile.id);
      if (existing) {
        const { error } = await supabase.from("payroll_records").update({ ...calc, generated_by: user.id, status: "processed" }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_records").insert({ ...calc, generated_by: user.id, status: "processed" });
        if (error) throw error;
      }
      toastHook({ title: "Payroll updated", description: `${profile.full_name || profile.email} processed.` });
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toastHook({ title: "Failed", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <PayrollAdjustments isAdmin={isAdmin} />

      {canAccess && (
      <>
      <PayrollProcessor />
      <div className="grid gap-4 lg:grid-cols-2">
        <PayslipCard />
        <LoanLedger />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> Payroll & Incentives</h1>
          <p className="text-sm text-muted-foreground">Process monthly salaries, manage incentives, and generate payslips.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Input type="number" className="w-[100px]" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BDT">BDT ৳</SelectItem>
                <SelectItem value="USD">USD $</SelectItem>
                <SelectItem value="EUR">EUR €</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAll} disabled={generating || loading}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate Monthly Payroll
          </Button>
          <Button variant="outline" onClick={exportPayrollReport} disabled={loading || activeProfiles.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export Report
          </Button>
        </div>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total Net Payout</CardDescription><CardTitle className="text-2xl">{fmtMoney(totalPayout, currency)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{records.length} processed records</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gross Pay</CardDescription><CardTitle className="text-2xl">{fmtMoney(totalGross, currency)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Before deductions</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>PF Contributions</CardDescription><CardTitle className="text-2xl">{fmtMoney(totalPF, currency)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Employee + Employer match</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Active Employees</CardDescription><CardTitle className="text-2xl">{activeProfiles.length}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{activeProfiles.filter(p => Number(p.base_salary) > 0).length} with salary set</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payroll">
        <TabsList>
          <TabsTrigger value="payroll">Payroll Records</TabsTrigger>
          <TabsTrigger value="incentives">Incentives</TabsTrigger>
          <TabsTrigger value="gratuity">Gratuity Calculator</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll">
          <Card>
            <CardHeader>
              <CardTitle>{MONTHS[month - 1]} {year}</CardTitle>
              <CardDescription>One row per active employee. OT hours come from approved overtime requests in this month.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">OT</TableHead>
                        <TableHead className="text-right">Incentives</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">PF (Emp)</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeProfiles.map((p) => {
                        const r = recordByUser.get(p.id);
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="font-medium">{p.full_name || "—"}</div>
                              <div className="text-xs text-muted-foreground">{p.designation || "—"} · {p.company_wing}</div>
                            </TableCell>
                            <TableCell className="text-right">{fmtMoney(r?.base_salary ?? p.base_salary, currency)}</TableCell>
                            <TableCell className="text-right">
                              {r ? `${r.ot_hours.toFixed(2)}h · ${fmtMoney(r.ot_amount, currency)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right">{r ? fmtMoney(r.incentives_amount, currency) : "—"}</TableCell>
                            <TableCell className="text-right">{r ? fmtMoney(r.gross_pay, currency) : "—"}</TableCell>
                            <TableCell className="text-right">{r ? fmtMoney(r.pf_employee, currency) : "—"}</TableCell>
                            <TableCell className="text-right font-semibold">{r ? fmtMoney(r.net_pay, currency) : "—"}</TableCell>
                            <TableCell>{r ? <Badge>{r.status}</Badge> : <Badge variant="outline">Not generated</Badge>}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => handleGenerateOne(p)} title="Recalculate">
                                  <Calculator className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" disabled={!r} onClick={() => r && setPayslipFor({ profile: p, record: r })}>
                                  <FileText className="h-3.5 w-3.5" /> Slip
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {activeProfiles.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No active employees.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incentives">
          <IncentivesPanel year={year} month={month} currency={currency} profiles={activeProfiles} />
        </TabsContent>

        <TabsContent value="gratuity">
          <GratuityPanel profiles={profiles} currency={currency} />
        </TabsContent>
      </Tabs>

      {/* Payslip Dialog */}
      <Dialog open={!!payslipFor} onOpenChange={(o) => !o && setPayslipFor(null)}>
        <DialogContent className="max-w-lg">
          {payslipFor && (
            <>
              <DialogHeader>
                <DialogTitle>Pay Slip — {MONTHS[payslipFor.record.period_month - 1]} {payslipFor.record.period_year}</DialogTitle>
                <DialogDescription>{payslipFor.profile.full_name} · {payslipFor.profile.designation || "—"}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1 text-sm">
                <SlipRow k="Base Salary" v={fmtMoney(payslipFor.record.base_salary, currency)} />
                <SlipRow k={`Overtime (${payslipFor.record.ot_hours.toFixed(2)} hrs)`} v={fmtMoney(payslipFor.record.ot_amount, currency)} />
                <SlipRow k="Incentives" v={fmtMoney(payslipFor.record.incentives_amount, currency)} />
                <div className="border-t my-2" />
                <SlipRow k="Gross Pay" v={fmtMoney(payslipFor.record.gross_pay, currency)} bold />
                <SlipRow k="PF (Employee)" v={`- ${fmtMoney(payslipFor.record.pf_employee, currency)}`} />
                <SlipRow k="Other Deductions" v={`- ${fmtMoney(payslipFor.record.other_deductions, currency)}`} />
                <div className="border-t my-2" />
                <SlipRow k="NET PAY" v={fmtMoney(payslipFor.record.net_pay, currency)} bold large />
                <p className="text-xs text-muted-foreground pt-2">PF (Employer match): {fmtMoney(payslipFor.record.pf_employer, currency)}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayslipFor(null)}>Close</Button>
                <Button onClick={() => downloadPayslipPDF({ profile: payslipFor.profile, record: payslipFor.record })}>
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
  );
}

function SlipRow({ k, v, bold, large }: { k: string; v: string; bold?: boolean; large?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${large ? "text-base" : ""}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}

/* ---------------- Incentives ---------------- */

interface IncentiveRow {
  id: string; user_id: string; period_year: number; period_month: number;
  label: string; amount: number; note: string | null;
}

function IncentivesPanel({ year, month, currency, profiles }: { year: number; month: number; currency: string; profiles: PayrollProfile[] }) {
  const { user } = useAuth();
  const [items, setItems] = useState<IncentiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ user_id: "", label: "Performance Bonus", amount: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_incentives")
      .select("*").eq("period_year", year).eq("period_month", month)
      .order("created_at", { ascending: false });
    if (error) toastHook({ title: "Failed", description: error.message, variant: "destructive" });
    else setItems((data || []) as IncentiveRow[]);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const handleAdd = async () => {
    if (!user || !form.user_id || !form.amount) {
      toastHook({ title: "Missing fields", description: "Pick an employee and enter an amount.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("payroll_incentives").insert({
      user_id: form.user_id,
      period_year: year, period_month: month,
      label: form.label || "Bonus",
      amount: Number(form.amount),
      note: form.note || null,
      created_by: user.id,
    });
    if (error) { toastHook({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toastHook({ title: "Incentive added" });
    setOpen(false);
    setForm({ user_id: "", label: "Performance Bonus", amount: "", note: "" });
    await load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("payroll_incentives").delete().eq("id", id);
    if (error) { toastHook({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    await load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Incentives — {MONTHS[month - 1]} {year}</CardTitle>
          <CardDescription>Manual bonuses or performance pay added on top of base salary.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Add Incentive</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Incentive</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Employee</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Label</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div>
                <Label>Amount ({currency})</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center py-8"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Employee</TableHead><TableHead>Label</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Note</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const p = profileMap.get(it.user_id);
                return (
                  <TableRow key={it.id}>
                    <TableCell>{p?.full_name || it.user_id.slice(0, 8)}</TableCell>
                    <TableCell>{it.label}</TableCell>
                    <TableCell className="text-right">{fmtMoney(it.amount, currency)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{it.note || "—"}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => handleDelete(it.id)}>Remove</Button></TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No incentives this month.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Gratuity ---------------- */

function GratuityPanel({ profiles, currency }: { profiles: PayrollProfile[]; currency: string }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = profiles.find((p) => p.id === selectedId);
  const result = selected ? computeGratuity(Number(selected.base_salary), selected.joining_date) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gratuity Calculator</CardTitle>
        <CardDescription>Formula: (Last Drawn Salary × 15 × Years of Service) / 26. Eligibility typically requires 5+ years.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm">
          <Label>Employee</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selected && result && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardHeader className="pb-2"><CardDescription>Joining Date</CardDescription><CardTitle className="text-base">{selected.joining_date || "—"}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Years of Service</CardDescription><CardTitle className="text-base">{result.years.toFixed(2)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Last Drawn Salary</CardDescription><CardTitle className="text-base">{fmtMoney(Number(selected.base_salary), currency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Estimated Gratuity</CardDescription><CardTitle className="text-base">{fmtMoney(result.amount, currency)}</CardTitle></CardHeader>
              <CardContent className="text-xs">{result.eligible ? <Badge>Eligible (5+ yrs)</Badge> : <Badge variant="outline">Not yet eligible</Badge>}</CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* =======================================================================
 * Expense Claims tab — moved from the former src/pages/Expenses.tsx (now
 * deleted). Self-contained: reads its own auth/role so its internals never
 * leak into (or collide with) Payment's own state/handlers.
 * ===================================================================== */

const FALLBACK_CATEGORIES = ["Travel", "Meals", "Office Supplies", "Software", "Training", "Client Entertainment", "Other"];

const DIRECTIONS = [
  { value: "company_pays_employee", label: "Company Pays Employee" },
  { value: "employee_owes_company", label: "Employee Owes Company" },
];

const ENTRY_TYPES = [
  { value: "expense", label: "Expense" },
  { value: "advance", label: "Advance" },
];

function ExpenseClaimsTab() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const canApprove = role === "admin" || role === "manager";
  const [claims, setClaims] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "Travel", amount: "", claim_date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "",
    direction: "company_pays_employee", entry_type: "expense",
  });
  const [uploading, setUploading] = useState(false);
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterFromDate, setFilterFromDate] = useState<string>("");
  const [filterToDate, setFilterToDate] = useState<string>("");

  const fetchClaims = async () => {
    const { data, error } = await supabase.from("expense_claims").select("*, profiles!expense_claims_user_id_fkey(full_name,email,photo_url)").order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setClaims(data || []);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from("expense_types").select("name").order("created_at", { ascending: true });
    if (data && data.length > 0) setCategories(data.map((d) => d.name));
  };

  useEffect(() => { fetchClaims(); fetchCategories(); }, []);

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    const { error } = await supabase.from("expense_types").insert({ name });
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
    const amount = Number(form.amount);
    const { data: inserted, error } = await supabase.from("expense_claims").insert({
      user_id: user?.id,
      category: form.category,
      amount,
      claim_date: form.claim_date,
      description: form.description,
      receipt_url: form.receipt_url || null,
      direction: form.direction,
      entry_type: form.entry_type,
      recoverable_total: form.direction === "employee_owes_company" ? amount : null,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Expense submitted");
    setOpen(false);
    setForm({ category: "Travel", amount: "", claim_date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "", direction: "company_pays_employee", entry_type: "expense" });
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

  const totals = categories.map(cat => ({
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
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={(v)=>setForm({...form, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Entry Type</Label>
                <Select value={form.entry_type} onValueChange={(v)=>setForm({...form, entry_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ENTRY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Direction</Label>
                <Select value={form.direction} onValueChange={(v)=>setForm({...form, direction: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIRECTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
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
          <Input className="max-w-[220px]" placeholder="New expense type" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <Button size="sm" variant="outline" onClick={addCategory}>Add Expense Type</Button>
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
            <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Entry Type</TableHead><TableHead>Direction</TableHead><TableHead>Amount</TableHead><TableHead>Description</TableHead><TableHead>Receipt</TableHead><TableHead>Status</TableHead>
            {(onApprove || onReject) && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.length === 0 ? <TableRow><TableCell colSpan={showEmployee ? 10 : 9} className="text-center text-muted-foreground">No claims</TableCell></TableRow> :
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
