/**
 * The single source of truth for "Approved Overtime" hours per user/month —
 * ported verbatim from ReportsSummary.tsx's own computation (the figure
 * everyone compares against) so Payroll can never silently diverge from
 * what Reports shows again. An approved overtime_request or manual-time
 * correction only counts if that calendar date also has matching *actual*
 * overtime recorded in attendance (otActualDateKeys) — a stray or
 * superseded approval on a date with no matching actual overtime (or no
 * attendance session at all) must not inflate what gets paid.
 */

import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { classifyDay, netRequiredHours, weekendDaysFor, type WorkSchedule } from "@/lib/workSchedule";
import { evaluateArrival, type OfficeTime } from "@/lib/officeTime";
import { mergeDailySessions, type AttendanceSession } from "@/lib/attendance";

type Schedule = WorkSchedule & OfficeTime & { company_wing?: string | null };

/**
 * Fetches everything needed and returns approved OT hours per
 * `${user_id}|${yyyy-MM}` for the given users across [rangeFrom, rangeTo]
 * (both "yyyy-MM-dd", inclusive).
 */
export async function fetchApprovedOTHoursByUserMonth(
  targetIds: string[],
  rangeFrom: string,
  rangeTo: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (targetIds.length === 0) return result;

  const [{ data: scheduleRows }, { data: attRows }, { data: otRows }, { data: manualOtRows }, { data: holidayRows }, { data: leaveRows }] = await Promise.all([
    supabase.from("profiles").select("id, working_days, company_wing, standard_daily_hours, unpaid_break_minutes, office_start_time, late_grace_minutes").in("id", targetIds),
    supabase.from("attendance_logs")
      .select("id, user_id, date, clock_in, clock_out, break_minutes, late_minutes, penalty_minutes, penalty_reviewed, total_hours")
      .in("user_id", targetIds).gte("date", rangeFrom).lte("date", rangeTo),
    supabase.from("overtime_requests").select("user_id, date, requested_hours")
      .in("user_id", targetIds).in("status", ["approved", "modified"]).gte("date", rangeFrom).lte("date", rangeTo),
    supabase.from("manual_time_requests").select("user_id, date, overtime_hours, created_at")
      .in("user_id", targetIds).eq("status", "approved").gte("date", rangeFrom).lte("date", rangeTo),
    supabase.from("holidays").select("holiday_date, name, wing"),
    supabase.from("leave_requests").select("user_id, start_date, end_date").in("user_id", targetIds).eq("status", "approved"),
  ]);

  const scheduleMap = new Map<string, Schedule>((scheduleRows || []).map((p) => [p.id, p as Schedule]));

  const leaveByUser = new Map<string, Set<string>>();
  (leaveRows || []).forEach((r) => {
    const set = leaveByUser.get(r.user_id) || new Set<string>();
    for (let d = new Date(`${r.start_date}T00:00:00`); d <= new Date(`${r.end_date}T00:00:00`); d.setDate(d.getDate() + 1)) {
      set.add(format(d, "yyyy-MM-dd"));
    }
    leaveByUser.set(r.user_id, set);
  });

  const otActualDateKeys = new Set<string>(); // `${user_id}|${date}`
  const days = mergeDailySessions((attRows || []) as AttendanceSession[]);
  days.forEach((day) => {
    const userId = day.userId as string;
    const schedule = scheduleMap.get(userId);
    if (!schedule) return;

    const holidayMap = new Map<string, string>();
    ((holidayRows || []) as { holiday_date: string; name: string; wing: string | null }[])
      .filter((h) => h.wing === null || h.wing === schedule.company_wing)
      .forEach((h) => holidayMap.set(h.holiday_date, h.name));
    const dayKind = classifyDay(day.date, holidayMap, weekendDaysFor(schedule));
    const onLeave = leaveByUser.get(userId)?.has(day.date) ?? false;
    const nonWorking = dayKind.nonWorking || onLeave;
    const worked = day.workedSeconds / 3600;
    const closed = !day.open && !!day.lastOut;
    const required = netRequiredHours(schedule);
    const liveArrival = evaluateArrival(day.firstIn, schedule);
    const storedArrival = day.penaltyReviewed
      ? { late: day.penaltyMinutes > 0, lateMinutes: day.lateMinutes, penaltyMinutes: day.penaltyMinutes }
      : liveArrival;
    const arrival = nonWorking ? { late: false, lateMinutes: 0, penaltyMinutes: 0 } : storedArrival;
    const requiredWithPenalty = required + arrival.penaltyMinutes / 60;

    if (dayKind.nonWorking && !onLeave && worked > 0) otActualDateKeys.add(`${userId}|${day.date}`);
    else if (!nonWorking && closed && worked > requiredWithPenalty) otActualDateKeys.add(`${userId}|${day.date}`);
  });

  const otPerDay = new Map<string, number>(); // `${user_id}|${date}`
  ((otRows || []) as { user_id: string; date: string; requested_hours: number }[]).forEach((r) => {
    const key = `${r.user_id}|${r.date}`;
    otPerDay.set(key, (otPerDay.get(key) || 0) + (Number(r.requested_hours) || 0));
  });
  const manualOtLatest = new Map<string, { hours: number; createdAt: string }>();
  ((manualOtRows || []) as { user_id: string; date: string; overtime_hours: number; created_at: string }[]).forEach((r) => {
    const key = `${r.user_id}|${r.date}`;
    const existing = manualOtLatest.get(key);
    if (!existing || r.created_at > existing.createdAt) {
      manualOtLatest.set(key, { hours: Number(r.overtime_hours) || 0, createdAt: r.created_at });
    }
  });
  manualOtLatest.forEach(({ hours }, key) => {
    otPerDay.set(key, (otPerDay.get(key) || 0) + hours);
  });

  otPerDay.forEach((hours, key) => {
    if (hours <= 0) return;
    if (!otActualDateKeys.has(key)) return;
    const [userId, date] = key.split("|");
    const monthKey = `${userId}|${date.slice(0, 7)}`;
    result.set(monthKey, (result.get(monthKey) || 0) + hours);
  });

  return result;
}
