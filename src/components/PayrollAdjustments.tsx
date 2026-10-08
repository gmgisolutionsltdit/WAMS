import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { classifyDay, netRequiredHours, weekendDaysFor, type WorkSchedule } from "@/lib/workSchedule";
import { evaluateArrival, type OfficeTime } from "@/lib/officeTime";
import { mergeDailySessions, type AttendanceSession } from "@/lib/attendance";
import { salaryBreakdown, perMinuteRate, computeFinalSalary, fmtBDT } from "@/lib/payrollAdjustments";

type Schedule = WorkSchedule & OfficeTime & { company_wing?: string | null; base_salary?: number | null };

type OtAdjRow = { id: string; decision: string; amount: number };
type DueAdjRow = { id: string; decision: string; amount: number };
type RecoveryAction = { id: string; action_type: string; amount: number };

const months = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), "MMMM"));

export const PayrollAdjustments = ({ isAdmin }: { isAdmin: boolean }) => {
  const { user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [reportTotals, setReportTotals] = useState({ otActualMinutes: 0, dueMinutes: 0 });
  const [otAdjustments, setOtAdjustments] = useState<OtAdjRow[]>([]);
  const [dueAdjustments, setDueAdjustments] = useState<DueAdjRow[]>([]);
  const [recoveryActions, setRecoveryActions] = useState<RecoveryAction[]>([]);
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
      const [{ data: prof }, { data: attRows }, { data: holidayRows }, { data: leaveRows },
        { data: otAdjRows }, { data: dueAdjRows }, { data: recoveryRows }] = await Promise.all([
        supabase.from("profiles").select("id, base_salary, office_start_time, late_grace_minutes, standard_daily_hours, unpaid_break_minutes, working_days, company_wing").eq("id", targetUserId).maybeSingle(),
        supabase.from("attendance_logs").select("id, user_id, date, clock_in, clock_out, break_minutes, late_minutes, penalty_minutes, penalty_reviewed")
          .eq("user_id", targetUserId).gte("date", monthStartISO).lte("date", monthEndISO),
        supabase.from("holidays").select("holiday_date, name, wing"),
        supabase.from("leave_requests").select("start_date, end_date").eq("user_id", targetUserId).eq("status", "approved"),
        supabase.from("payroll_ot_adjustments").select("id, decision, amount")
          .eq("user_id", targetUserId).eq("month", monthStartISO).order("created_at", { ascending: false }),
        supabase.from("payroll_due_adjustments").select("id, decision, amount")
          .eq("user_id", targetUserId).eq("month", monthStartISO).order("created_at", { ascending: false }),
        supabase.from("expense_recovery_actions").select("id, action_type, amount")
          .eq("user_id", targetUserId).eq("month", monthStartISO).order("created_at", { ascending: false }),
      ]);

      const sched = (prof as Schedule) || null;
      setSchedule(sched);
      setRecoveryActions((recoveryRows || []) as RecoveryAction[]);
      setOtAdjustments((otAdjRows || []) as OtAdjRow[]);
      setDueAdjustments((dueAdjRows || []) as DueAdjRow[]);

      // Due/Overtime totals: reuse the same holiday/weekend/leave classification
      // and per-day session merge already used by the (fixed) Performance Summary.
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
        });
        setReportTotals({ otActualMinutes, dueMinutes: dueMinutesWithPenalty });
      } else {
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
            {isAdmin ? "Payroll breakdown — Admin view." : "Your payroll breakdown — read only."}
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
