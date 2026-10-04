import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, TimerOff, Timer, Gauge, Eye, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { classifyDay, netRequiredHours, weekendDaysFor, type WorkSchedule } from "@/lib/workSchedule";
import { evaluateArrival, humanMinutes, type OfficeTime } from "@/lib/officeTime";
import { mergeDailySessions, type AttendanceSession } from "@/lib/attendance";

type Schedule = WorkSchedule & OfficeTime & { company_wing?: string | null };

type EmployeeOption = { id: string; full_name: string | null; email: string | null; role: string };

type Summary = {
  userId: string;
  name: string;
  role: string;
  lateDays: number;
  lateMinutesTotal: number;
  /** Extra work owed for a late arrival (0 once waived by Approve Start Time). */
  latePenaltyMinutesTotal: number;
  /** Days with a closed, worked day under the fixed 7-hour mark. */
  lessThan7Days: number;
  lessThan7HoursTotal: number;
  /** Due Time: days/hours short of the employee's own schedule requirement. */
  shortDays: number;
  shortfallHoursTotal: number;
  /** Overtime: any day worked beyond the schedule requirement, or any time
   * worked on a weekend/holiday (full day counts, no requirement to beat). */
  otActualDays: number;
  otActualHoursTotal: number;
  /** Approved Overtime: from approved overtime_requests only. */
  otDays: number;
  otHoursTotal: number;
};

/** One day that would be reported differently under the corrected rules vs the old (buggy) ones. */
type ChangedDay = {
  userId: string;
  name: string;
  date: string;
  oldDueHours: number;
  newDueHours: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

const ReportsSummary = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [monthFrom, setMonthFrom] = useState(() => format(new Date(), "yyyy-MM"));
  const [monthTo, setMonthTo] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Summary[]>([]);
  const [changedDays, setChangedDays] = useState<ChangedDay[]>([]);
  const [showChanged, setShowChanged] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role as string]));
      setEmployees((profiles || []).map((p) => ({ ...p, role: roleMap.get(p.id) || "employee" })));
    })();
  }, [isAdmin]);

  const targetIds = useMemo(
    () => (isAdmin ? (employeeFilter === "all" ? employees.map((e) => e.id) : [employeeFilter]) : (user ? [user.id] : [])),
    [isAdmin, employeeFilter, employees, user],
  );

  const effectiveRange = useMemo(() => {
    if (monthFrom || monthTo) {
      const startMonth = monthFrom || monthTo;
      const endMonth = monthTo || monthFrom;
      const [ys, ms] = startMonth.split("-").map(Number);
      const [ye, me] = endMonth.split("-").map(Number);
      const start = new Date(ys, ms - 1, 1);
      const end = new Date(ye, me, 0);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    return { from: dateFrom, to: dateTo };
  }, [monthFrom, monthTo, dateFrom, dateTo]);

  /**
   * Per-day Short/Due, correctly excluding Absent, Approved Leave, Weekly
   * Off and Public Holiday before measuring the shortfall, and merging every
   * session of a day (including an overnight one) into a single worked-hours
   * total first so nothing is double counted.
   */
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      if (targetIds.length === 0) { setRows([]); setChangedDays([]); return; }

      const [{ data: scheduleRows }, { data: attRows }, { data: otRows }, { data: roleRows }, { data: holidayRows }, { data: leaveRows }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, standard_daily_hours, unpaid_break_minutes, office_start_time, late_grace_minutes, working_days, company_wing").in("id", targetIds),
        (() => {
          let q = supabase.from("attendance_logs")
            .select("id, user_id, date, clock_in, clock_out, break_minutes, late_minutes, penalty_minutes, penalty_reviewed, total_hours")
            .in("user_id", targetIds);
          if (effectiveRange.from) q = q.gte("date", effectiveRange.from);
          if (effectiveRange.to) q = q.lte("date", effectiveRange.to);
          return q;
        })(),
        (() => {
          let q = supabase.from("overtime_requests").select("user_id, date, requested_hours").in("user_id", targetIds).eq("status", "approved");
          if (effectiveRange.from) q = q.gte("date", effectiveRange.from);
          if (effectiveRange.to) q = q.lte("date", effectiveRange.to);
          return q;
        })(),
        supabase.from("user_roles").select("user_id, role").in("user_id", targetIds),
        supabase.from("holidays").select("holiday_date, name, wing"),
        supabase.from("leave_requests").select("user_id, start_date, end_date").in("user_id", targetIds).eq("status", "approved"),
      ]);

      const roleMap = new Map((roleRows || []).map((r) => [r.user_id, r.role as string]));
      const scheduleMap = new Map<string, Schedule & { full_name: string | null; email: string | null }>(
        (scheduleRows || []).map((p) => [p.id, p as Schedule & { full_name: string | null; email: string | null }])
      );

      // Per-employee leave dates: an approved leave day has no standard-hours
      // requirement, same as a holiday or weekly off.
      const leaveByUser = new Map<string, Set<string>>();
      (leaveRows || []).forEach((r) => {
        const set = leaveByUser.get(r.user_id) || new Set<string>();
        for (let d = new Date(`${r.start_date}T00:00:00`); d <= new Date(`${r.end_date}T00:00:00`); d.setDate(d.getDate() + 1)) {
          set.add(format(d, "yyyy-MM-dd"));
        }
        leaveByUser.set(r.user_id, set);
      });

      const byUser = new Map<string, Summary>();
      targetIds.forEach((id) => {
        const p = scheduleMap.get(id);
        byUser.set(id, {
          userId: id,
          name: p?.full_name || p?.email || "—",
          role: roleMap.get(id) || "employee",
          lateDays: 0, lateMinutesTotal: 0, latePenaltyMinutesTotal: 0,
          lessThan7Days: 0, lessThan7HoursTotal: 0,
          shortDays: 0, shortfallHoursTotal: 0,
          otActualDays: 0, otActualHoursTotal: 0,
          otDays: 0, otHoursTotal: 0,
        });
      });

      const changed: ChangedDay[] = [];
      const days = mergeDailySessions((attRows || []) as AttendanceSession[]);
      days.forEach((day) => {
        const userId = day.userId as string;
        const s = byUser.get(userId);
        const schedule = scheduleMap.get(userId);
        if (!s || !schedule) return;

        // A holiday with no wing applies to everyone; otherwise only to its wing.
        const holidayMap = new Map<string, string>();
        (holidayRows || [])
          .filter((h) => h.wing === null || h.wing === schedule.company_wing)
          .forEach((h) => holidayMap.set(h.holiday_date, h.name));
        const dayKind = classifyDay(day.date, holidayMap, weekendDaysFor(schedule));
        const onLeave = leaveByUser.get(userId)?.has(day.date) ?? false;
        const nonWorking = dayKind.nonWorking || onLeave;

        const worked = day.workedSeconds / 3600;

        // Overtime (actual, not just approved) on a weekend/holiday: any
        // time worked counts in full there, no requirement to beat.
        if (dayKind.nonWorking && !onLeave && worked > 0) {
          s.otActualDays += 1;
          s.otActualHoursTotal += worked;
        }

        // Late: compare against the stored, authoritative arrival once
        // reviewed; fall back to a live recompute for older unreviewed rows.
        // penaltyMinutes is the extra work owed for the late arrival (0 once
        // waived via Approve Start Time) — Due Time for a late day is the
        // late minutes plus this penalty, same as Attendance.tsx's own
        // Due Time column.
        const liveArrival = evaluateArrival(day.firstIn, schedule);
        const storedArrival = day.penaltyReviewed
          ? { late: day.penaltyMinutes > 0, lateMinutes: day.lateMinutes, penaltyMinutes: day.penaltyMinutes }
          : liveArrival;
        const arrival = nonWorking ? { late: false, lateMinutes: 0, penaltyMinutes: 0 } : storedArrival;
        if (arrival.late) {
          s.lateDays += 1;
          s.lateMinutesTotal += arrival.lateMinutes;
          s.latePenaltyMinutesTotal += arrival.penaltyMinutes;
        }

        const required = netRequiredHours(schedule);
        const closed = !day.open && !!day.lastOut;
        const oldDue = Math.max(0, required - (Number(day.sessions[0]?.total_hours) || 0));
        const newDue = (!nonWorking && closed && worked > 0 && worked < required) ? required - worked : 0;
        if (newDue > 0) {
          s.shortDays += 1;
          s.shortfallHoursTotal += newDue;
        }

        // Less than 7hr Work Time: a fixed 7-hour threshold, independent of
        // the employee's own schedule requirement.
        if (!nonWorking && closed && worked > 0 && worked < 7) {
          s.lessThan7Days += 1;
          s.lessThan7HoursTotal += worked;
        }

        // Overtime (actual, not just approved) on a normal working day:
        // hours beyond the schedule requirement.
        if (!nonWorking && closed && worked > required) {
          s.otActualDays += 1;
          s.otActualHoursTotal += worked - required;
        }
        if (Math.abs(oldDue - newDue) > 0.01) {
          changed.push({ userId, name: s.name, date: day.date, oldDueHours: round1(oldDue), newDueHours: round1(newDue) });
        }
      });

      const otDaySets = new Map<string, Set<string>>();
      (otRows || []).forEach((r) => {
        const s = byUser.get(r.user_id);
        if (!s) return;
        s.otHoursTotal += Number(r.requested_hours) || 0;
        const set = otDaySets.get(r.user_id) || new Set<string>();
        set.add(r.date);
        otDaySets.set(r.user_id, set);
      });
      otDaySets.forEach((set, id) => {
        const s = byUser.get(id);
        if (s) s.otDays = set.size;
      });

      setRows(Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setChangedDays(changed.sort((a, b) => a.date.localeCompare(b.date)));
    } finally {
      setLoading(false);
    }
  }, [targetIds, effectiveRange]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setMonthFrom(""); setMonthTo("");
    setEmployeeFilter("all");
  };

  const mine = rows.find((r) => r.userId === user?.id) || rows[0];

  /** Net Hours = Approved Overtime hours minus Due Time hours, always shown
   * as a positive value with a colored label for which side it landed on. */
  const netHoursOf = (s: Summary | undefined) => {
    const raw = (s?.otHoursTotal ?? 0) - (s?.shortfallHoursTotal ?? 0);
    return { value: round1(Math.abs(raw)), isOvertime: raw >= 0 };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Performance Summary</CardTitle>
          <CardDescription>Late arrivals, short-duration days, and approved overtime.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
            {isAdmin && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={employeeFilter} onValueChange={(v) => { setEmployeeFilter(v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All employees</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Month From</Label>
              <Input type="month" value={monthFrom} onChange={(e) => { setMonthFrom(e.target.value); if (e.target.value) { setDateFrom(""); setDateTo(""); } }} />
            </div>
            <div className="space-y-2">
              <Label>Month To</Label>
              <Input type="month" value={monthTo} onChange={(e) => { setMonthTo(e.target.value); if (e.target.value) { setDateFrom(""); setDateTo(""); } }} />
            </div>
            <div className="space-y-2">
              <Label>From</Label>
              <Input type="date" value={dateFrom} disabled={!!monthFrom || !!monthTo} onChange={(e) => { setDateFrom(e.target.value); }} />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input type="date" value={dateTo} disabled={!!monthFrom || !!monthTo} onChange={(e) => { setDateTo(e.target.value); }} />
            </div>
            <div className="flex gap-2">
              <Button onClick={fetchSummary} className="flex-1">Filter</Button>
              <Button variant="outline" onClick={clearFilters}>Clear</Button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isAdmin ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Late Entry</TableHead>
                      <TableHead>Less than 7hr Work Time</TableHead>
                      <TableHead>Due Time</TableHead>
                      <TableHead>Overtime</TableHead>
                      <TableHead>Approved Overtime</TableHead>
                      <TableHead>Net Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No records</TableCell></TableRow>
                    ) : rows.map((r) => {
                      const net = netHoursOf(r);
                      return (
                        <TableRow key={r.userId}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell><Badge variant={r.role === "admin" ? "default" : r.role === "manager" ? "secondary" : "outline"}>{r.role}</Badge></TableCell>
                          <TableCell>{r.lateDays} days · avg {r.lateDays > 0 ? humanMinutes(Math.round(r.lateMinutesTotal / r.lateDays)) : "—"}</TableCell>
                          <TableCell>{r.lessThan7Days} days · avg {r.lessThan7Days > 0 ? round1(r.lessThan7HoursTotal / r.lessThan7Days) : 0}h</TableCell>
                          <TableCell>{r.shortDays} days · {round1(r.shortfallHoursTotal)}h</TableCell>
                          <TableCell>{r.otActualDays} days · {round1(r.otActualHoursTotal)}h</TableCell>
                          <TableCell>{r.otDays} days · {round1(r.otHoursTotal)}h</TableCell>
                          <TableCell>
                            <div className="font-semibold">{net.value}h</div>
                            <div className={net.isOvertime ? "text-xs text-green-600" : "text-xs text-red-600"}>
                              {net.isOvertime ? "Overtime" : "Due Time"}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {changedDays.length > 0 && (
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      {changedDays.length} past day{changedDays.length === 1 ? "" : "s"} in this range would show a different
                      Due/Short value under the corrected rule (holiday/weekly-off/approved-leave/absent days excluded, and
                      multiple sessions merged per day) than the old calculation. Nothing stored has been changed.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => setShowChanged((v) => !v)}>
                      <Eye className="h-4 w-4 mr-1" /> {showChanged ? "Hide" : "Preview"} affected days
                    </Button>
                  </div>
                  {showChanged && (
                    <div className="overflow-x-auto mt-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Employee</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Old Due</TableHead>
                            <TableHead className="text-right">Corrected Due</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {changedDays.map((c) => (
                            <TableRow key={`${c.userId}-${c.date}`}>
                              <TableCell>{c.name}</TableCell>
                              <TableCell>{c.date}</TableCell>
                              <TableCell className="text-right">{c.oldDueHours}h</TableCell>
                              <TableCell className="text-right">{c.newDueHours}h</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Clock className="h-4 w-4" /> Late Entry</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.lateDays ?? 0} days</div>
                  <p className="text-xs font-semibold text-primary mt-1">
                    avg {mine && mine.lateDays > 0 ? humanMinutes(Math.round(mine.lateMinutesTotal / mine.lateDays)) : "—"} per late entry
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><TimerOff className="h-4 w-4" /> Less than 7hr Work Time</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.lessThan7Days ?? 0} days</div>
                  <p className="text-xs font-semibold text-primary mt-1">
                    avg {mine && mine.lessThan7Days > 0 ? round1(mine.lessThan7HoursTotal / mine.lessThan7Days) : 0}h worked on those days
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Gauge className="h-4 w-4" /> Due Time</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.shortDays ?? 0} days</div>
                  <p className="text-xs font-semibold text-primary mt-1">{round1(mine?.shortfallHoursTotal ?? 0)}h total due time</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Overtime</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.otActualDays ?? 0} days</div>
                  <p className="text-xs font-semibold text-primary mt-1">{round1(mine?.otActualHoursTotal ?? 0)}h total overtime</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Timer className="h-4 w-4" /> Approved Overtime</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.otDays ?? 0} days</div>
                  <p className="text-xs font-semibold text-primary mt-1">{round1(mine?.otHoursTotal ?? 0)}h total approved overtime</p>
                </CardContent>
              </Card>
              {(() => {
                const net = netHoursOf(mine);
                return (
                  <Card>
                    <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Gauge className="h-4 w-4" /> Net Hours</CardDescription></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{net.value}h</div>
                      <p className={`text-xs font-semibold mt-1 ${net.isOvertime ? "text-green-600" : "text-red-600"}`}>
                        {net.isOvertime ? "Overtime" : "Due Time"}
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsSummary;
