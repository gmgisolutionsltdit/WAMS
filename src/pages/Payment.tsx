import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { notifyManagersAndAdmins, notifyEmployee } from "@/lib/notifications";
import { computePayroll, type PayrollProfile } from "@/lib/payroll";

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
  const [open, setOpen] = useState(false);
  const [requestKind, setRequestKind] = useState<AdvanceKind>("personal");
  const [uploading, setUploading] = useState(false);

  const [personalForm, setPersonalForm] = useState({
    amount: "", reason: "", installments: "1", monthly_deduction: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    amount: "", purpose: "", settle_by: "",
  });

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

  const hasActivePersonal = personalAdvances.some((r) => r.user_id === user?.id && ["pending", "approved"].includes(r.status));
  const hasActiveExpense = expenseAdvances.some((r) => r.user_id === user?.id && ["pending", "approved"].includes(r.status));

  const resetRequestForm = () => {
    setPersonalForm({ amount: "", reason: "", installments: "1", monthly_deduction: "" });
    setExpenseForm({ amount: "", purpose: "", settle_by: "" });
    setRequestKind("personal");
  };

  const onPersonalFieldChange = (patch: Partial<typeof personalForm>) => {
    setPersonalForm((f) => {
      const next = { ...f, ...patch };
      const amt = Number(next.amount);
      const inst = Number(next.installments);
      if (amt > 0 && inst > 0 && ("amount" in patch || "installments" in patch)) {
        next.monthly_deduction = (amt / inst).toFixed(2);
      }
      return next;
    });
  };

  const submitRequest = async () => {
    if (!user) return;
    if (requestKind === "personal") {
      const amount = Number(personalForm.amount);
      const installments = Number(personalForm.installments);
      const monthlyDeduction = Number(personalForm.monthly_deduction);
      if (!amount || amount <= 0) return toast.error("Amount must be greater than 0");
      if (!installments || installments <= 0) return toast.error("Installments must be greater than 0");
      if (!monthlyDeduction || monthlyDeduction <= 0) return toast.error("Monthly deduction must be greater than 0");
      if (hasActivePersonal) return toast.error("You already have an active Personal Advance request.");
      const { data: inserted, error } = await supabase.from("personal_advances").insert({
        user_id: user.id,
        amount,
        reason: personalForm.reason || null,
        installments,
        monthly_deduction: monthlyDeduction,
        remaining_balance: amount,
      }).select().single();
      if (error) {
        if ((error as any).code === "23505") return toast.error("You already have an active Personal Advance request.");
        return toast.error(error.message);
      }
      toast.success("Personal Advance requested");
      setOpen(false);
      resetRequestForm();
      await notifyManagersAndAdmins(
        "Personal Advance Requested",
        `${user.email} requested a Personal Advance of ${amount}.`,
        inserted?.id,
        { route: "/payment", type: "personal_advance", requesterId: user.id },
      );
      fetchAll();
    } else {
      const amount = Number(expenseForm.amount);
      if (!amount || amount <= 0) return toast.error("Amount must be greater than 0");
      if (!expenseForm.settle_by) return toast.error("Settle By date is required");
      if (expenseForm.settle_by <= todayISO()) return toast.error("Settle By must be a future date");
      if (hasActiveExpense) return toast.error("You already have an active Expense Advance request.");
      const { data: inserted, error } = await supabase.from("expense_advances").insert({
        user_id: user.id,
        amount,
        purpose: expenseForm.purpose || null,
        settle_by: expenseForm.settle_by,
      }).select().single();
      if (error) {
        if ((error as any).code === "23505") return toast.error("You already have an active Expense Advance request.");
        return toast.error(error.message);
      }
      toast.success("Expense Advance requested");
      setOpen(false);
      resetRequestForm();
      await notifyManagersAndAdmins(
        "Expense Advance Requested",
        `${user.email} requested an Expense Advance of ${amount}.`,
        inserted?.id,
        { route: "/payment", type: "expense_advance", requesterId: user.id },
      );
      fetchAll();
    }
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
      const computation = await computePayroll(profileRow as PayrollProfile, year, month, "BDT");
      const remainingBalance = Number(advance.remaining_balance);
      const monthlyDeduction = Number(advance.monthly_deduction);
      const netPayCap = Math.max(0, computation.net_pay);
      const proposedBeforeCap = Math.min(monthlyDeduction, remainingBalance);
      const actualDeduction = Math.min(monthlyDeduction, remainingBalance, netPayCap);
      const monthStartISO = `${year}-${String(month).padStart(2, "0")}-01`;
      const remainingAfter = remainingBalance - actualDeduction;

      const { error: ledgerErr } = await supabase.from("personal_advance_actions").insert({
        personal_advance_id: advance.id, user_id: advance.user_id, action_type: "payroll_deduction",
        amount: actualDeduction, remaining_after: remainingAfter, month: monthStartISO, created_by: user.id,
      });
      if (ledgerErr) { toast.error(ledgerErr.message); return; }

      const updatePayload: any = { remaining_balance: remainingAfter };
      const willClose = remainingAfter <= 0;
      if (willClose) updatePayload.status = "closed";

      const shortfallFromNetPay = actualDeduction < monthlyDeduction && netPayCap < proposedBeforeCap;
      if (shortfallFromNetPay) {
        updatePayload.admin_flag = true;
        updatePayload.admin_flag_note = `Deduction capped by net pay: wanted ${monthlyDeduction}, net pay only allowed ${netPayCap.toFixed(2)}.`;
      }

      const { error: updErr } = await supabase.from("personal_advances").update(updatePayload).eq("id", advance.id);
      if (updErr) { toast.error(updErr.message); return; }

      if (willClose) {
        await supabase.from("personal_advance_actions").insert({
          personal_advance_id: advance.id, user_id: advance.user_id, action_type: "closed",
          amount: 0, remaining_after: 0, month: monthStartISO, created_by: user.id,
        });
      }
      if (shortfallFromNetPay) {
        await supabase.from("personal_advance_actions").insert({
          personal_advance_id: advance.id, user_id: advance.user_id, action_type: "admin_flag",
          amount: 0, month: monthStartISO, note: updatePayload.admin_flag_note, created_by: user.id,
        });
      }

      toast.success(`Recorded deduction of ${actualDeduction.toFixed(2)}`);
      setDeductDialogId(null);
      fetchAll();
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
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetRequestForm(); }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Request</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Payment Request</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Type</Label>
                <Select value={requestKind} onValueChange={(v) => setRequestKind(v as AdvanceKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal Advance</SelectItem>
                    <SelectItem value="expense">Expense Advance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {requestKind === "personal" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount</Label><Input type="number" value={personalForm.amount} onChange={(e) => onPersonalFieldChange({ amount: e.target.value })} /></div>
                    <div><Label>Installments</Label><Input type="number" value={personalForm.installments} onChange={(e) => onPersonalFieldChange({ installments: e.target.value })} /></div>
                  </div>
                  <div><Label>Monthly Deduction</Label><Input type="number" value={personalForm.monthly_deduction} onChange={(e) => setPersonalForm((f) => ({ ...f, monthly_deduction: e.target.value }))} /></div>
                  <div><Label>Reason</Label><Textarea value={personalForm.reason} onChange={(e) => setPersonalForm((f) => ({ ...f, reason: e.target.value }))} /></div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Amount</Label><Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} /></div>
                    <div><Label>Settle By</Label><Input type="date" value={expenseForm.settle_by} onChange={(e) => setExpenseForm((f) => ({ ...f, settle_by: e.target.value }))} /></div>
                  </div>
                  <div><Label>Purpose</Label><Textarea value={expenseForm.purpose} onChange={(e) => setExpenseForm((f) => ({ ...f, purpose: e.target.value }))} /></div>
                </>
              )}
            </div>
            <DialogFooter><Button onClick={submitRequest}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My Payments</TabsTrigger>
          {canApprove && <TabsTrigger value="pending">Pending Approval ({pendingApprovals.length})</TabsTrigger>}
          {canApprove && <TabsTrigger value="history">Team History</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine">
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
