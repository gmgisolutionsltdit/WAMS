import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { toast } from "sonner";
import { classifyDay, netRequiredHours, weekendDaysFor, type WorkSchedule } from "@/lib/workSchedule";
import { evaluateArrival, type OfficeTime } from "@/lib/officeTime";
import { mergeDailySessions, type AttendanceSession } from "@/lib/attendance";
import {
  salaryBreakdown, perMinuteRate, otPaymentAmount, dueDeductionAmount,
  leaveDeductionForMinutes, validateMultiplier, timeInputToMinutes,
  computeFinalSalary, fmtBDT,
} from "@/lib/payrollAdjustments";

type Schedule = WorkSchedule & OfficeTime & { company_wing?: string | null; base_salary?: number | null };

type OtRecord = { date: string; totalMinutes: number; allocatedMinutes: number; remainingMinutes: number };
type DueRecord = { date: string; totalMinutes: number; allocatedMinutes: number; remainingMinutes: number };

type OtAdjRow = {
  id: string; attendance_date: string; decision: string; minutes: number;
  ot_multiplier: number; amount: number; note: string | null; created_at: string;
};
type DueAdjRow = {
  id: string; attendance_date: string; decision: string; minutes: number;
  due_multiplier: number; amount: number; leave_days: number | null; note: string | null; created_at: string;
};
type RecoveryAction = {
  id: string; expense_claim_id: string; action_type: string; amount: number;
  remaining_after: number; month: string; note: string | null; created_at: string;
};
type ExpenseRow = {
  id: string; category: string; amount: number; claim_date: string; description: string | null;
  direction: string; recoverable_total: number | null; recovered_amount: number; recovery_status: string;
};
type WarningRow = { id: string; note: string; warning_date: string; created_at: string };
type LeaveTypeOpt = { id: string; code: string; name: string };

const months = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), "MMMM"));

export const PayrollAdjustments = ({ isAdmin }: { isAdmin: boolean }) => {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOpt[]>([]);
  const [otRecords, setOtRecords] = useState<OtRecord[]>([]);
  const [dueRecords, setDueRecords] = useState<DueRecord[]>([]);
  const [reportTotals, setReportTotals] = useState({ otActualMinutes: 0, dueMinutes: 0 });
  const [otAdjustments, setOtAdjustments] = useState<OtAdjRow[]>([]);
  const [dueAdjustments, setDueAdjustments] = useState<DueAdjRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [recoveryActions, setRecoveryActions] = useState<RecoveryAction[]>([]);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [loading, setLoading] = useState(true);

  const targetUserId = isAdmin ? selectedUserId : (user?.id || "");
  const monthStartISO = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndISO = format(new Date(year, month, 0), "yyyy-MM-dd");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      setEmployees(data || []);
      if (data && data.length > 0 && !selectedUserId) setSelectedUserId(data[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const fetchAll = useCallback(async () => {
    if (!targetUserId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data: prof }, { data: leaveTypeRows }, { data: attRows }, { data: holidayRows }, { data: leaveRows }, { data: otRows },
        { data: otAdjRows }, { data: dueAdjRows }, { data: expenseRows }, { data: recoveryRows }, { data: warningRows }] = await Promise.all([
        supabase.from("profiles").select("id, base_salary, office_start_time, late_grace_minutes, standard_daily_hours, unpaid_break_minutes, working_days, company_wing").eq("id", targetUserId).maybeSingle(),
        supabase.from("leave_types").select("id, code, name").in("code", ["CL", "AL"]),
        supabase.from("attendance_logs").select("id, user_id, date, clock_in, clock_out, break_minutes, late_minutes, penalty_minutes, penalty_reviewed")
          .eq("user_id", targetUserId).gte("date", monthStartISO).lte("date", monthEndISO),
        supabase.from("holidays").select("holiday_date, name, wing"),
        supabase.from("leave_requests").select("start_date, end_date").eq("user_id", targetUserId).eq("status", "approved"),
        supabase.from("overtime_requests").select("date, requested_hours").eq("user_id", targetUserId).eq("status", "approved")
          .gte("date", monthStartISO).lte("date", monthEndISO),
        supabase.from("payroll_ot_adjustments").select("id, attendance_date, decision, minutes, ot_multiplier, amount, note, created_at")
          .eq("user_id", targetUserId).eq("month", monthStartISO).order("created_at", { ascending: false }),
        supabase.from("payroll_due_adjustments").select("id, attendance_date, decision, minutes, due_multiplier, amount, leave_days, note, created_at")
          .eq("user_id", targetUserId).eq("month", monthStartISO).order("created_at", { ascending: false }),
        supabase.from("expense_claims").select("id, category, amount, claim_date, description, direction, recoverable_total, recovered_amount, recovery_status")
          .eq("user_id", targetUserId).eq("direction", "employee_owes_company"),
        supabase.from("expense_recovery_actions").select("id, expense_claim_id, action_type, amount, remaining_after, month, note, created_at")
          .eq("user_id", targetUserId).eq("month", monthStartISO).order("created_at", { ascending: false }),
        supabase.from("hr_warnings").select("id, note, warning_date, created_at").eq("user_id", targetUserId).order("warning_date", { ascending: false }),
      ]);

      const sched = (prof as Schedule) || null;
      setSchedule(sched);
      setLeaveTypes((leaveTypeRows || []) as LeaveTypeOpt[]);
      setExpenses((expenseRows || []) as ExpenseRow[]);
      setRecoveryActions((recoveryRows || []) as RecoveryAction[]);
      setWarnings((warningRows || []) as WarningRow[]);
      setOtAdjustments((otAdjRows || []) as OtAdjRow[]);
      setDueAdjustments((dueAdjRows || []) as DueAdjRow[]);

      // OT records: one per approved overtime_requests date, minutes = hours*60.
      const otAlloc = new Map<string, number>();
      (otAdjRows || []).forEach((r) => otAlloc.set(r.attendance_date, (otAlloc.get(r.attendance_date) || 0) + r.minutes));
      const ot: OtRecord[] = (otRows || []).map((r) => {
        const totalMinutes = Math.round(Number(r.requested_hours) * 60);
        const allocatedMinutes = otAlloc.get(r.date) || 0;
        return { date: r.date, totalMinutes, allocatedMinutes, remainingMinutes: Math.max(0, totalMinutes - allocatedMinutes) };
      });
      setOtRecords(ot);

      // Due records: reuse the same holiday/weekend/leave classification and
      // per-day session merge already used by the (fixed) Performance Summary
      // — not re-derived here.
      if (sched) {
        const holidayMap = new Map<string, string>();
        (holidayRows || [])
          .filter((h) => h.wing === null || h.wing === sched.company_wing)
          .forEach((h) => holidayMap.set(h.holiday_date, h.name));
        const leaveSet = new Set<string>();
        (leaveRows || []).forEach((r) => {
          for (let d = new Date(`${r.start_date}T00:00:00`); d <= new Date(`${r.end_date}T00:00:00`); d.setDate(d.getDate() + 1)) {
            leaveSet.add(format(d, "yyyy-MM-dd"));
          }
        });
        const required = netRequiredHours(sched);
        const weekend = weekendDaysFor(sched);
        const days = mergeDailySessions((attRows || []) as AttendanceSession[]);
        const dueAlloc = new Map<string, number>();
        (dueAdjRows || []).forEach((r) => dueAlloc.set(r.attendance_date, (dueAlloc.get(r.attendance_date) || 0) + r.minutes));
        const due: DueRecord[] = [];
        let otActualMinutes = 0;
        let dueMinutesWithPenalty = 0;
        days.forEach((day) => {
          const dayKind = classifyDay(day.date, holidayMap, weekend);
          const onLeave = leaveSet.has(day.date);
          const nonWorking = dayKind.nonWorking || onLeave;
          const worked = day.workedSeconds / 3600;
          const closed = !day.open && !!day.lastOut;

          if (nonWorking && !onLeave && worked > 0) {
            otActualMinutes += Math.round(worked * 60);
          }

          // Due/Overtime totals for the Salary Summary match the Reports tab
          // exactly: the late-arrival penalty adds to today's requirement
          // before Due/Overtime are measured against it (0 when not late).
          const liveArrival = evaluateArrival(day.firstIn, sched);
          const storedArrival = day.penaltyReviewed
            ? { late: day.penaltyMinutes > 0, lateMinutes: day.lateMinutes, penaltyMinutes: day.penaltyMinutes }
            : liveArrival;
          const arrival = nonWorking ? { late: false, lateMinutes: 0, penaltyMinutes: 0 } : storedArrival;
          const requiredWithPenalty = required + arrival.penaltyMinutes / 60;

          if (!nonWorking && closed && worked < requiredWithPenalty) {
            dueMinutesWithPenalty += Math.round((requiredWithPenalty - worked) * 60);
          }
          if (!nonWorking && closed && worked > requiredWithPenalty) {
            otActualMinutes += Math.round((worked - requiredWithPenalty) * 60);
          }

          // Per-day records still used for the admin's manual Decide workflow
          // — unaffected by the penalty adjustment above.
          if (nonWorking || !closed || worked <= 0 || worked >= required) return;
          const totalMinutes = Math.round((required - worked) * 60);
          if (totalMinutes <= 0) return;
          const allocatedMinutes = dueAlloc.get(day.date) || 0;
          due.push({ date: day.date, totalMinutes, allocatedMinutes, remainingMinutes: Math.max(0, totalMinutes - allocatedMinutes) });
        });
        setDueRecords(due.sort((a, b) => a.date.localeCompare(b.date)));
        setReportTotals({ otActualMinutes, dueMinutes: dueMinutesWithPenalty });
      } else {
        setDueRecords([]);
        setReportTotals({ otActualMinutes: 0, dueMinutes: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [targetUserId, monthStartISO, monthEndISO]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const gross = Number(schedule?.base_salary) || 0;
  const breakdown = useMemo(() => salaryBreakdown(gross), [gross]);

  const otPaymentTotal = useMemo(
    () => otAdjustments.filter((r) => r.decision === "pay").reduce((s, r) => s + Number(r.amount), 0),
    [otAdjustments],
  );
  const dueDeductionTotal = useMemo(
    () => dueAdjustments.filter((r) => r.decision === "salary_deduction").reduce((s, r) => s + Number(r.amount), 0),
    [dueAdjustments],
  );
  const recoveryTotal = useMemo(
    () => recoveryActions.filter((r) => ["deduct_month", "specific_amount", "installment"].includes(r.action_type))
      .reduce((s, r) => s + Number(r.amount), 0),
    [recoveryActions],
  );
  const hasPendingDue = useMemo(
    () => dueAdjustments.some((r) => r.decision === "pending"),
    [dueAdjustments],
  );

  // Employee/manager Salary Summary is calculated straight from this month's
  // Reports totals (actual Overtime and Due Time, including the late-arrival
  // penalty) at the plain per-minute rate — no admin per-day decision needed.
  // Admin's own view keeps the manual Decide-driven totals above, since
  // that's the workflow for applying multipliers and offsets per record.
  const otPaymentAuto = useMemo(() => perMinuteRate(gross) * reportTotals.otActualMinutes, [gross, reportTotals.otActualMinutes]);
  const dueDeductionAuto = useMemo(() => perMinuteRate(gross) * reportTotals.dueMinutes, [gross, reportTotals.dueMinutes]);

  const otPaymentDisplay = isAdmin ? otPaymentTotal : otPaymentAuto;
  const dueDeductionDisplay = isAdmin ? dueDeductionTotal : dueDeductionAuto;

  const finalSalary = useMemo(
    () => computeFinalSalary({
      gross, otPaymentTotal: otPaymentDisplay, dueDeductionTotal: dueDeductionDisplay, recoveryTotal,
      hasPendingDue: isAdmin && hasPendingDue,
    }),
    [gross, otPaymentDisplay, dueDeductionDisplay, recoveryTotal, isAdmin, hasPendingDue],
  );

  const employeeName = isAdmin
    ? employees.find((e) => e.id === selectedUserId)?.full_name || employees.find((e) => e.id === selectedUserId)?.email
    : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Salary</CardTitle>
          <CardDescription>
            {isAdmin ? "OT/Due adjustments, expense recovery and HR warnings — Admin only edits." : "Your payroll breakdown, decisions and warnings — read only."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            {isAdmin && (
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Input type="number" className="w-[100px]" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !targetUserId ? (
        <p className="text-sm text-muted-foreground">Select an employee.</p>
      ) : gross <= 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Invalid input: Gross Salary is not set for {employeeName || "this employee"}. Set Base Salary on their Profile first.
        </CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Salary Summary — {months[month - 1]} {year}{employeeName ? ` · ${employeeName}` : ""}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {isAdmin && <SummaryTile label="Gross" value={fmtBDT(breakdown.gross)} />}
              <SummaryTile label="Basic (50%)" value={fmtBDT(breakdown.basic)} sub />
              <SummaryTile label="House Rent (35%)" value={fmtBDT(breakdown.houseRent)} sub />
              <SummaryTile label="Conveyance (10%)" value={fmtBDT(breakdown.conveyance)} sub />
              <SummaryTile label="Medical (5%)" value={fmtBDT(breakdown.medical)} sub />
              <SummaryTile label="+ OT Payment" value={fmtBDT(otPaymentDisplay)} />
              <SummaryTile label="- Due Deduction" value={fmtBDT(-dueDeductionDisplay)} />
              <SummaryTile label="Net Adjustment" value={fmtBDT(finalSalary.netAdjustment)} />
              <SummaryTile label="- Expense" value={fmtBDT(-recoveryTotal)} />
              {isAdmin && hasPendingDue ? (
                <>
                  <SummaryTile label="Current Applicable Salary" value={fmtBDT(finalSalary.currentApplicable)} highlight />
                  <SummaryTile label="Final" value="PENDING" highlight warn />
                </>
              ) : (
                <SummaryTile label="Final" value={fmtBDT(finalSalary.final as number)} highlight />
              )}
            </CardContent>
            {finalSalary.deductionsExceedCap && (
              <CardContent className="pt-0 text-xs text-destructive">
                Blocked: Due Deduction + Recovery would exceed Gross + OT Payment this month.
              </CardContent>
            )}
          </Card>

          <OtDueSection
            isAdmin={isAdmin} userId={targetUserId} month={monthStartISO} gross={gross}
            otRecords={otRecords} dueRecords={dueRecords}
            otAdjustments={otAdjustments} dueAdjustments={dueAdjustments}
            leaveTypes={leaveTypes} adminId={user?.id || ""}
            onChanged={fetchAll}
          />

          <ExpenseRecoverySection
            isAdmin={isAdmin} userId={targetUserId} month={monthStartISO}
            expenses={expenses} recoveryActions={recoveryActions} adminId={user?.id || ""}
            onChanged={fetchAll}
          />

          <HrWarningsSection isAdmin={isAdmin} userId={targetUserId} warnings={warnings} adminId={user?.id || ""} onChanged={fetchAll} />
        </>
      )}
    </div>
  );
};

const SummaryTile = ({ label, value, sub, highlight, warn }: { label: string; value: string; sub?: boolean; highlight?: boolean; warn?: boolean }) => (
  <div className={`rounded-md border p-3 ${highlight ? "bg-muted/50" : ""}`}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`font-semibold ${sub ? "text-sm" : "text-base"} ${warn ? "text-destructive" : ""}`}>{value}</div>
  </div>
);

/* ---------------- OT / Due per-record decisions ---------------- */

type DecisionDialogState =
  | { kind: "ot"; date: string; remainingMinutes: number }
  | { kind: "due"; date: string; remainingMinutes: number }
  | null;

const OtDueSection = ({
  isAdmin, userId, month, gross, otRecords, dueRecords, otAdjustments, dueAdjustments, leaveTypes, adminId, onChanged,
}: {
  isAdmin: boolean; userId: string; month: string; gross: number;
  otRecords: OtRecord[]; dueRecords: DueRecord[]; otAdjustments: OtAdjRow[]; dueAdjustments: DueAdjRow[];
  leaveTypes: LeaveTypeOpt[]; adminId: string; onChanged: () => void;
}) => {
  const [dialog, setDialog] = useState<DecisionDialogState>(null);

  return (
    <>
      <Card>
        <CardHeader><CardTitle className="text-base">Overtime (approved, from attendance)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Minutes</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead>Decisions</TableHead>{isAdmin && <TableHead></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {otRecords.length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground">No approved OT this month.</TableCell></TableRow>
              ) : otRecords.map((r) => (
                <TableRow key={r.date}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className="text-right">{r.totalMinutes}</TableCell>
                  <TableCell className="text-right">{r.remainingMinutes}</TableCell>
                  <TableCell>
                    {otAdjustments.filter((a) => a.attendance_date === r.date).map((a) => (
                      <Badge key={a.id} variant="outline" className="mr-1 mb-1">{a.decision} · {a.minutes}m{a.amount ? ` · ${fmtBDT(a.amount)}` : ""}</Badge>
                    ))}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={r.remainingMinutes <= 0} onClick={() => setDialog({ kind: "ot", date: r.date, remainingMinutes: r.remainingMinutes })}>Decide</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Due / Short Duration (working days only, leave/off/absent excluded)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Minutes</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead>Decisions</TableHead>{isAdmin && <TableHead></TableHead>}</TableRow></TableHeader>
            <TableBody>
              {dueRecords.length === 0 ? (
                <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground">No Due days this month.</TableCell></TableRow>
              ) : dueRecords.map((r) => (
                <TableRow key={r.date}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className="text-right">{r.totalMinutes}</TableCell>
                  <TableCell className="text-right">{r.remainingMinutes}</TableCell>
                  <TableCell>
                    {dueAdjustments.filter((a) => a.attendance_date === r.date).map((a) => (
                      <Badge key={a.id} variant="outline" className="mr-1 mb-1">{a.decision} · {a.minutes}m{a.amount ? ` · ${fmtBDT(a.amount)}` : ""}{a.leave_days ? ` · ${a.leave_days}d leave` : ""}</Badge>
                    ))}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={r.remainingMinutes <= 0} onClick={() => setDialog({ kind: "due", date: r.date, remainingMinutes: r.remainingMinutes })}>Decide</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-2">Guidance: resolve leave deduction first, then salary deduction; repeated Due left Pending should prompt an HR warning.</p>
        </CardContent>
      </Card>

      {dialog && (
        <DecisionDialog
          state={dialog} onClose={() => setDialog(null)} gross={gross} userId={userId} month={month}
          leaveTypes={leaveTypes} adminId={adminId}
          otOpenRecords={otRecords.filter((r) => r.remainingMinutes > 0)}
          dueOpenRecords={dueRecords.filter((r) => r.remainingMinutes > 0)}
          otAdjustments={otAdjustments} dueAdjustments={dueAdjustments}
          onDone={() => { setDialog(null); onChanged(); }}
        />
      )}
    </>
  );
};

const OT_DECISIONS = [
  { value: "pay", label: "Pay" },
  { value: "do_not_pay", label: "Do Not Pay" },
  { value: "adjust_due", label: "Offset vs Due" },
  { value: "pending", label: "Pending" },
  { value: "carry_forward", label: "Carry Forward" },
];
const DUE_DECISIONS = [
  { value: "adjusted_zero", label: "Adjusted (0, by working hours)" },
  { value: "leave_deduction", label: "Leave Deduction" },
  { value: "salary_deduction", label: "Salary Deduction" },
  { value: "adjust_ot", label: "Offset vs OT" },
  { value: "pending", label: "Pending" },
  { value: "carry_forward", label: "Carry Forward" },
];

const DecisionDialog = ({
  state, onClose, gross, userId, month, leaveTypes, adminId, otOpenRecords, dueOpenRecords, otAdjustments, dueAdjustments, onDone,
}: {
  state: NonNullable<DecisionDialogState>; onClose: () => void; gross: number; userId: string; month: string;
  leaveTypes: LeaveTypeOpt[]; adminId: string;
  otOpenRecords: OtRecord[]; dueOpenRecords: DueRecord[];
  otAdjustments: OtAdjRow[]; dueAdjustments: DueAdjRow[];
  onDone: () => void;
}) => {
  const isOt = state.kind === "ot";
  const [decision, setDecision] = useState(isOt ? "pay" : "adjusted_zero");
  const [hours, setHours] = useState(Math.floor(state.remainingMinutes / 60));
  const [mins, setMins] = useState(state.remainingMinutes % 60);
  const [multiplier, setMultiplier] = useState("1");
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id || "");
  const [offsetAgainstDate, setOffsetAgainstDate] = useState(isOt ? dueOpenRecords[0]?.date || "" : otOpenRecords[0]?.date || "");
  const [carryToMonth, setCarryToMonth] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const minutesRequested = timeInputToMinutes(hours, mins) ?? 0;
  const name = isOt ? "OT Multiplier" : "Due Multiplier";

  const submit = async () => {
    if (minutesRequested <= 0 || minutesRequested > state.remainingMinutes) {
      toast.error(`Minutes must be between 1 and the remaining ${state.remainingMinutes}.`);
      return;
    }
    const needsMultiplier = (isOt && decision === "pay") || (!isOt && decision === "salary_deduction");
    let multVal = 1;
    if (needsMultiplier) {
      const check = validateMultiplier(multiplier, name);
      if (!check.ok) { toast.error(check.error || "Invalid multiplier."); return; }
      multVal = check.value;
    }
    if (decision === "carry_forward" && !carryToMonth) { toast.error("Pick which month to carry these minutes forward to."); return; }
    if (!isOt && decision === "leave_deduction" && !leaveTypeId) { toast.error("Pick a leave type (Casual or Annual)."); return; }

    setSaving(true);
    try {
      if (isOt) {
        const amount = decision === "pay" ? otPaymentAmount(gross, multVal, minutesRequested) : 0;
        const { error } = await supabase.from("payroll_ot_adjustments").insert({
          user_id: userId, month, attendance_date: state.date, decision, minutes: minutesRequested,
          ot_multiplier: multVal, rate_per_minute: perMinuteRate(gross), amount,
          carried_to_month: decision === "carry_forward" ? carryToMonth : null,
          admin_id: adminId, note: note || null,
        });
        if (error) { toast.error(error.message); return; }

        if (decision === "adjust_due") {
          const dueRecord = dueOpenRecords.find((d) => d.date === offsetAgainstDate);
          if (!dueRecord || dueRecord.remainingMinutes < minutesRequested) {
            toast.error("Not enough remaining Due minutes on the selected date to offset against.");
            return;
          }
          const otAdj = await supabase.from("payroll_ot_adjustments").select("id").eq("user_id", userId).eq("month", month)
            .eq("attendance_date", state.date).eq("decision", "adjust_due").order("created_at", { ascending: false }).limit(1).maybeSingle();
          const { error: dueErr } = await supabase.from("payroll_due_adjustments").insert({
            user_id: userId, month, attendance_date: offsetAgainstDate, decision: "adjust_ot",
            minutes: minutesRequested, due_multiplier: 1, rate_per_minute: perMinuteRate(gross), amount: 0,
            admin_id: adminId, note: `Offset against OT ${state.date}`,
          });
          if (dueErr) { toast.error(dueErr.message); return; }
          if (otAdj.data) {
            const dueAdj = await supabase.from("payroll_due_adjustments").select("id").eq("user_id", userId).eq("month", month)
              .eq("attendance_date", offsetAgainstDate).eq("decision", "adjust_ot").order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (dueAdj.data) {
              await supabase.from("payroll_offsets").insert({
                user_id: userId, month, ot_adjustment_id: otAdj.data.id, due_adjustment_id: dueAdj.data.id,
                minutes: minutesRequested, admin_id: adminId,
              });
            }
          }
        }
      } else {
        if (decision === "leave_deduction") {
          const { days, remainderMinutes } = leaveDeductionForMinutes(minutesRequested);
          if (days <= 0) { toast.error("Leave deduction needs at least one full 8h day; the remainder stays Due."); return; }
          const leaveMinutes = minutesRequested - remainderMinutes;
          const { error } = await supabase.from("payroll_due_adjustments").insert({
            user_id: userId, month, attendance_date: state.date, decision, minutes: leaveMinutes,
            due_multiplier: 1, rate_per_minute: perMinuteRate(gross), amount: 0,
            leave_type_id: leaveTypeId, leave_days: days, admin_id: adminId, note: note || null,
          });
          if (error) { toast.error(error.message); return; }
          const { data: bal } = await supabase.from("leave_balances").select("*").eq("user_id", userId).eq("leave_type_id", leaveTypeId)
            .eq("year", new Date(state.date).getFullYear()).maybeSingle();
          if (bal) {
            await supabase.from("leave_balances").update({ used: (bal.used || 0) + days }).eq("id", bal.id);
          } else {
            const { data: lt } = await supabase.from("leave_types").select("annual_quota").eq("id", leaveTypeId).maybeSingle();
            await supabase.from("leave_balances").insert({
              user_id: userId, leave_type_id: leaveTypeId, year: new Date(state.date).getFullYear(),
              allocated: lt?.annual_quota || 0, used: days, carried_forward: 0,
            });
          }
        } else {
          const amount = decision === "salary_deduction" ? dueDeductionAmount(gross, multVal, minutesRequested) : 0;
          const { error } = await supabase.from("payroll_due_adjustments").insert({
            user_id: userId, month, attendance_date: state.date, decision, minutes: minutesRequested,
            due_multiplier: multVal, rate_per_minute: perMinuteRate(gross), amount,
            carried_to_month: decision === "carry_forward" ? carryToMonth : null,
            admin_id: adminId, note: note || null,
          });
          if (error) { toast.error(error.message); return; }

          if (decision === "adjust_ot") {
            const otRecord = otOpenRecords.find((o) => o.date === offsetAgainstDate);
            if (!otRecord || otRecord.remainingMinutes < minutesRequested) {
              toast.error("Not enough remaining OT minutes on the selected date to offset against.");
              return;
            }
            const { error: otErr } = await supabase.from("payroll_ot_adjustments").insert({
              user_id: userId, month, attendance_date: offsetAgainstDate, decision: "adjust_due",
              minutes: minutesRequested, ot_multiplier: 1, rate_per_minute: perMinuteRate(gross), amount: 0,
              admin_id: adminId, note: `Offset against Due ${state.date}`,
            });
            if (otErr) { toast.error(otErr.message); return; }
          }
        }
      }
      toast.success("Decision recorded");
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const decisions = isOt ? OT_DECISIONS : DUE_DECISIONS;
  const needsMultiplier = (isOt && decision === "pay") || (!isOt && decision === "salary_deduction");
  const needsOffsetTarget = (isOt && decision === "adjust_due") || (!isOt && decision === "adjust_ot");
  const offsetOptions = isOt ? dueOpenRecords : otOpenRecords;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isOt ? "OT" : "Due"} decision — {state.date}</DialogTitle>
          <DialogDescription>Remaining: {state.remainingMinutes} minutes. Full or partial allocation allowed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Decision</Label>
            <Select value={decision} onValueChange={setDecision}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{decisions.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Hours</Label><Input type="number" min={0} value={hours} onChange={(e) => setHours(Number(e.target.value) || 0)} /></div>
            <div><Label>Minutes</Label><Input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(Number(e.target.value) || 0)} /></div>
          </div>
          {needsMultiplier && (
            <div><Label>{name}</Label><Input type="number" step="0.1" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} /></div>
          )}
          {!isOt && decision === "leave_deduction" && (
            <div>
              <Label>Leave Type</Label>
              <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                <SelectTrigger><SelectValue placeholder="Casual or Annual" /></SelectTrigger>
                <SelectContent>{leaveTypes.map((lt) => <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Each full 8h = 1 day; any remainder stays Due.</p>
            </div>
          )}
          {needsOffsetTarget && (
            <div>
              <Label>Offset against {isOt ? "Due" : "OT"} on</Label>
              <Select value={offsetAgainstDate} onValueChange={setOffsetAgainstDate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{offsetOptions.map((o) => <SelectItem key={o.date} value={o.date}>{o.date} ({o.remainingMinutes}m left)</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {decision === "carry_forward" && (
            <div><Label>Carry to month</Label><Input type="month" value={carryToMonth} onChange={(e) => setCarryToMonth(e.target.value)} /></div>
          )}
          <div><Label>Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save Decision"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/* ---------------- Expense recovery ---------------- */

const RECOVERY_ACTIONS = [
  { value: "deduct_month", label: "Deduct all this month" },
  { value: "specific_amount", label: "Specific amount / installment" },
  { value: "paid_back_directly", label: "Paid back directly" },
  { value: "carry_forward", label: "Carry Forward to Next Month" },
  { value: "waive", label: "Waive" },
  { value: "pending", label: "Pending" },
];

const ExpenseRecoverySection = ({
  isAdmin, userId, month, expenses, recoveryActions, adminId, onChanged,
}: { isAdmin: boolean; userId: string; month: string; expenses: ExpenseRow[]; recoveryActions: RecoveryAction[]; adminId: string; onChanged: () => void }) => {
  const [actOn, setActOn] = useState<ExpenseRow | null>(null);
  const [actionType, setActionType] = useState("deduct_month");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [carryToMonth, setCarryToMonth] = useState("");
  const [saving, setSaving] = useState(false);

  const openAction = (e: ExpenseRow) => { setActOn(e); setActionType("deduct_month"); setAmount(""); setNote(""); setCarryToMonth(""); };

  const remainingOf = (e: ExpenseRow) => Math.max(0, (Number(e.recoverable_total ?? e.amount)) - Number(e.recovered_amount));

  const submit = async () => {
    if (!actOn) return;
    const remaining = remainingOf(actOn);
    let amt = 0;
    if (actionType === "deduct_month") amt = remaining;
    else if (actionType === "specific_amount" || actionType === "paid_back_directly") {
      amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) { toast.error("Enter a positive amount."); return; }
      if (amt > remaining) { toast.error(`Amount cannot exceed the remaining ${remaining}.`); return; }
    } else if (actionType === "carry_forward" && !carryToMonth) {
      toast.error("Pick which month to carry this expense forward to.");
      return;
    }
    setSaving(true);
    try {
      // Carry Forward defers the remaining amount to a chosen month without
      // recovering anything this month — same as OT/Due's own Carry Forward.
      const newRecovered = actionType === "waive" ? Number(actOn.recoverable_total ?? actOn.amount) : Number(actOn.recovered_amount) + amt;
      const newRemaining = Math.max(0, Number(actOn.recoverable_total ?? actOn.amount) - newRecovered);
      const newStatus = actionType === "waive" ? "waived"
        : actionType === "pending" ? "pending_decision"
        : actionType === "carry_forward" ? "carried_forward"
        : newRemaining <= 0 ? "fully_recovered" : "partially_recovered";

      const { error: actionErr } = await supabase.from("expense_recovery_actions").insert({
        expense_claim_id: actOn.id, user_id: userId, action_type: actionType, amount: amt,
        remaining_after: actionType === "carry_forward" ? remaining : newRemaining, month, note: note || null, admin_id: adminId,
        carried_to_month: actionType === "carry_forward" ? carryToMonth : null,
      });
      if (actionErr) { toast.error(actionErr.message); return; }

      const { error: updErr } = await supabase.from("expense_claims").update({
        recovered_amount: actionType === "carry_forward" ? actOn.recovered_amount : newRecovered,
        recovery_status: newStatus,
      }).eq("id", actOn.id);
      if (updErr) { toast.error(updErr.message); return; }

      toast.success("Recovery recorded");
      setActOn(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Expense Recovery (Employee Owes Company)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Recovered</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead>Status</TableHead>{isAdmin && <TableHead></TableHead>}</TableRow></TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-muted-foreground">Nothing recoverable.</TableCell></TableRow>
            ) : expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.claim_date}</TableCell>
                <TableCell>{e.category}</TableCell>
                <TableCell className="text-right">{fmtBDT(Number(e.recoverable_total ?? e.amount))}</TableCell>
                <TableCell className="text-right">{fmtBDT(Number(e.recovered_amount))}</TableCell>
                <TableCell className="text-right">{fmtBDT(remainingOf(e))}</TableCell>
                <TableCell><Badge variant="outline">{e.recovery_status.replace("_", " ")}</Badge></TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" disabled={remainingOf(e) <= 0} onClick={() => openAction(e)}>Recover</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {recoveryActions.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">This month's recovery actions</p>
            {recoveryActions.map((r) => (
              <Badge key={r.id} variant="outline" className="mr-1 mb-1">{r.action_type} · {fmtBDT(r.amount)}</Badge>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!actOn} onOpenChange={(o) => !o && setActOn(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recover expense</DialogTitle></DialogHeader>
          {actOn && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Remaining: {fmtBDT(remainingOf(actOn))}</p>
              <div>
                <Label>Action</Label>
                <Select value={actionType} onValueChange={setActionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RECOVERY_ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {(actionType === "specific_amount" || actionType === "paid_back_directly") && (
                <div><Label>Amount</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              )}
              {actionType === "carry_forward" && (
                <div><Label>Carry to month</Label><Input type="month" value={carryToMonth} onChange={(e) => setCarryToMonth(e.target.value)} /></div>
              )}
              {actionType === "waive" && <div><Label>Reason</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>}
              {actionType !== "waive" && <div><Label>Note (optional)</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setActOn(null)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

/* ---------------- HR warnings ---------------- */

const HrWarningsSection = ({
  isAdmin, userId, warnings, adminId, onChanged,
}: { isAdmin: boolean; userId: string; warnings: WarningRow[]; adminId: string; onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!note.trim()) { toast.error("Note is required."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("hr_warnings").insert({ user_id: userId, note, warning_date: date, admin_id: adminId });
      if (error) { toast.error(error.message); return; }
      toast.success("Warning recorded");
      setOpen(false); setNote("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">HR Warnings</CardTitle>
        {isAdmin && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Add Warning</Button>}
      </CardHeader>
      <CardContent>
        {warnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No warnings on file.</p>
        ) : (
          <div className="space-y-2">
            {warnings.map((w) => (
              <div key={w.id} className="rounded-md border p-2 text-sm">
                <div className="text-xs text-muted-foreground">{w.warning_date}</div>
                <div>{w.note}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add HR Warning</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Note</Label><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
