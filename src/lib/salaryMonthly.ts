/**
 * Bulk, multi-month/multi-employee salary summary — the DB-querying half of
 * the Payroll OT/Due math in payrollAdjustments.ts. Kept in its own module
 * (rather than folded into that file) so payrollAdjustments.ts stays a pure,
 * side-effect-free math module safely importable in unit tests without a
 * live Supabase client.
 */

import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { classifyDay, netRequiredHours, weekendDaysFor, type WorkSchedule } from "@/lib/workSchedule";
import { evaluateArrival, type OfficeTime } from "@/lib/officeTime";
import { mergeDailySessions, type AttendanceSession } from "@/lib/attendance";
import { salaryBreakdown, perMinuteRate, computeFinalSalary } from "@/lib/payrollAdjustments";

type Schedule = WorkSchedule & OfficeTime & { company_wing?: string | null };

export type SalaryMonthRow = {
  userId: string;
  name: string;
  /** "yyyy-MM" */
  month: string;
  gross: number;
  basic: number;
  houseRent: number;
  conveyance: number;
  medical: number;
  otPayment: number;
  dueDeduction: number;
  netAdjustment: number;
  recoveryTotal: number;
  final: number;
};

/**
 * One row per (employee, month) — the same figures as the non-admin Salary
 * Summary segment (auto OT/Due from actual attendance, no manual per-day
 * decisions, never "PENDING"), computed in bulk for a multi-month,
 * multi-employee monthly salary table instead of one employee/month at a
 * time.
 */
export const computeMonthlySalaryRows = async (
  targetIds: string[],
  months: string[],
): Promise<SalaryMonthRow[]> => {
  if (targetIds.length === 0 || months.length === 0) return [];
  const sortedMonths = Array.from(new Set(months)).sort();
  const rangeStart = `${sortedMonths[0]}-01`;
  const [ey, em] = sortedMonths[sortedMonths.length - 1].split("-").map(Number);
  const rangeEnd = format(new Date(ey, em, 0), "yyyy-MM-dd");

  const [{ data: profiles }, { data: attRows }, { data: holidayRows }, { data: leaveRows }, { data: recoveryRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, base_salary, office_start_time, late_grace_minutes, standard_daily_hours, unpaid_break_minutes, working_days, company_wing").in("id", targetIds),
    supabase.from("attendance_logs").select("id, user_id, date, clock_in, clock_out, break_minutes, late_minutes, penalty_minutes, penalty_reviewed").in("user_id", targetIds).gte("date", rangeStart).lte("date", rangeEnd),
    supabase.from("holidays").select("holiday_date, name, wing"),
    supabase.from("leave_requests").select("user_id, start_date, end_date").in("user_id", targetIds).eq("status", "approved"),
    supabase.from("expense_recovery_actions").select("user_id, amount, action_type, month").in("user_id", targetIds).in("month", sortedMonths.map((m) => `${m}-01`)),
  ]);

  type ProfileRow = Schedule & { id: string; full_name: string | null; email: string | null; base_salary: number | null };
  const profileMap = new Map<string, ProfileRow>(
    ((profiles || []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  const leaveByUser = new Map<string, Set<string>>();
  ((leaveRows || []) as { user_id: string; start_date: string; end_date: string }[]).forEach((r) => {
    const set = leaveByUser.get(r.user_id) || new Set<string>();
    for (let d = new Date(`${r.start_date}T00:00:00`); d <= new Date(`${r.end_date}T00:00:00`); d.setDate(d.getDate() + 1)) {
      set.add(format(d, "yyyy-MM-dd"));
    }
    leaveByUser.set(r.user_id, set);
  });

  const totals = new Map<string, { otActualMinutes: number; dueMinutes: number }>();
  targetIds.forEach((id) => sortedMonths.forEach((m) => totals.set(`${id}|${m}`, { otActualMinutes: 0, dueMinutes: 0 })));

  // Mirrors PayrollAdjustments.tsx's own fetchAll exactly (Due/Overtime
  // including the late-arrival penalty), just grouped by month instead of
  // computed for one fixed month at a time.
  const days = mergeDailySessions((attRows || []) as AttendanceSession[]);
  days.forEach((day) => {
    const userId = day.userId as string;
    const schedule = profileMap.get(userId);
    const t = totals.get(`${userId}|${day.date.slice(0, 7)}`);
    if (!schedule || !t) return;

    const holidayMap = new Map<string, string>();
    ((holidayRows || []) as { holiday_date: string; name: string; wing: string | null }[])
      .filter((h) => h.wing === null || h.wing === schedule.company_wing)
      .forEach((h) => holidayMap.set(h.holiday_date, h.name));
    const dayKind = classifyDay(day.date, holidayMap, weekendDaysFor(schedule));
    const onLeave = leaveByUser.get(userId)?.has(day.date) ?? false;
    const nonWorking = dayKind.nonWorking || onLeave;
    const worked = day.workedSeconds / 3600;
    const closed = !day.open && !!day.lastOut;

    if (nonWorking && !onLeave && worked > 0) {
      t.otActualMinutes += Math.round(worked * 60);
    }

    const liveArrival = evaluateArrival(day.firstIn, schedule);
    const storedArrival = day.penaltyReviewed
      ? { late: day.penaltyMinutes > 0, lateMinutes: day.lateMinutes, penaltyMinutes: day.penaltyMinutes }
      : liveArrival;
    const arrival = nonWorking ? { late: false, lateMinutes: 0, penaltyMinutes: 0 } : storedArrival;
    const required = netRequiredHours(schedule);
    const requiredWithPenalty = required + arrival.penaltyMinutes / 60;

    if (!nonWorking && closed && worked < requiredWithPenalty) {
      t.dueMinutes += Math.round((requiredWithPenalty - worked) * 60);
    }
    if (!nonWorking && closed && worked > requiredWithPenalty) {
      t.otActualMinutes += Math.round((worked - requiredWithPenalty) * 60);
    }
  });

  const recoveryTotals = new Map<string, number>();
  ((recoveryRows || []) as { user_id: string; amount: number; action_type: string; month: string }[]).forEach((r) => {
    if (!["deduct_month", "specific_amount", "installment"].includes(r.action_type)) return;
    const key = `${r.user_id}|${String(r.month).slice(0, 7)}`;
    recoveryTotals.set(key, (recoveryTotals.get(key) || 0) + Number(r.amount));
  });

  const rows: SalaryMonthRow[] = [];
  targetIds.forEach((id) => {
    const p = profileMap.get(id);
    const gross = Number(p?.base_salary) || 0;
    const breakdown = salaryBreakdown(gross);
    sortedMonths.forEach((month) => {
      const key = `${id}|${month}`;
      const t = totals.get(key) || { otActualMinutes: 0, dueMinutes: 0 };
      const otPayment = perMinuteRate(gross) * t.otActualMinutes;
      const dueDeduction = perMinuteRate(gross) * t.dueMinutes;
      const recoveryTotal = recoveryTotals.get(key) || 0;
      const finalSalary = computeFinalSalary({
        gross, otPaymentTotal: otPayment, dueDeductionTotal: dueDeduction, recoveryTotal, hasPendingDue: false,
      });
      rows.push({
        userId: id,
        name: p?.full_name || p?.email || "—",
        month,
        gross,
        basic: breakdown.basic, houseRent: breakdown.houseRent, conveyance: breakdown.conveyance, medical: breakdown.medical,
        otPayment, dueDeduction,
        netAdjustment: finalSalary.netAdjustment,
        recoveryTotal,
        final: finalSalary.final as number,
      });
    });
  });

  return rows;
};
