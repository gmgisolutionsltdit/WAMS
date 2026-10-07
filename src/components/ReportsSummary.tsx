import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type MonthlySummary = Summary & { month: string };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Every "yyyy-MM" month between two "yyyy-MM-dd" dates, inclusive. */
const monthsInRange = (fromISO: string, toISO: string): string[] => {
  if (!fromISO || !toISO) return [];
  const [fy, fm] = fromISO.split("-").map(Number);
  const [ty, tm] = toISO.split("-").map(Number);
  const months: string[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
};

/** Format a duration given in decimal hours as "X hr Ymin", e.g. 5.8 -> "5 hr 46min". */
const fmtHoursMin = (hours: number) => {
  const totalMinutes = Math.round((hours || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} hr ${m}min`;
};

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
  // Guards against an older in-flight fetch (e.g. from before the Employee
  // filter was switched) resolving after a newer one and clobbering the
  // right results with stale data — only the most recently started fetch's
  // response is ever applied to state.
  const fetchSeq = useRef(0);
  const [rows, setRows] = useState<Summary[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<MonthlySummary[]>([]);
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
    const seq = ++fetchSeq.current;
    setLoading(true);
    try {
      if (targetIds.length === 0) {
        if (seq === fetchSeq.current) { setRows([]); setChangedDays([]); }
        return;
      }

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

      const newSummary = (id: string, extra: { month?: string } = {}): Summary & { month?: string } => {
        const p = scheduleMap.get(id);
        return {
          userId: id,
          name: p?.full_name || p?.email || "—",
          role: roleMap.get(id) || "employee",
          lateDays: 0, lateMinutesTotal: 0, latePenaltyMinutesTotal: 0,
          lessThan7Days: 0, lessThan7HoursTotal: 0,
          shortDays: 0, shortfallHoursTotal: 0,
          otActualDays: 0, otActualHoursTotal: 0,
          otDays: 0, otHoursTotal: 0,
          ...extra,
        };
      };

      const byUser = new Map<string, Summary>();
      targetIds.forEach((id) => byUser.set(id, newSummary(id)));

      // The per-month breakdown table is only rendered for the non-admin
      // (own) view, which always has exactly one target (the signed-in
      // user) — skip building it for the admin table's potentially large
      // employee list, where it would never be shown.
      const monthList = !isAdmin ? monthsInRange(effectiveRange.from, effectiveRange.to) : [];
      const byUserMonth = new Map<string, MonthlySummary>();
      if (!isAdmin) {
        targetIds.forEach((id) => {
          monthList.forEach((month) => byUserMonth.set(`${id}|${month}`, newSummary(id, { month }) as MonthlySummary));
        });
      }

      const changed: ChangedDay[] = [];
      const days = mergeDailySessions((attRows || []) as AttendanceSession[]);
      days.forEach((day) => {
        const userId = day.userId as string;
        const s = byUser.get(userId);
        const schedule = scheduleMap.get(userId);
        if (!s || !schedule) return;
        const sm = byUserMonth.get(`${userId}|${day.date.slice(0, 7)}`);
        const targets = sm ? [s, sm] : [s];

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
          targets.forEach((t) => { t.otActualDays += 1; t.otActualHoursTotal += worked; });
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
          targets.forEach((t) => {
            t.lateDays += 1;
            t.lateMinutesTotal += arrival.lateMinutes;
            t.latePenaltyMinutesTotal += arrival.penaltyMinutes;
          });
        }

        const required = netRequiredHours(schedule);
        const closed = !day.open && !!day.lastOut;
        // Matches Attendance.tsx's own Due Time / OVERTIME (OT) columns
        // exactly: the late-arrival penalty adds to today's requirement
        // before Due/Overtime are measured against it (0 when not late).
        const requiredWithPenalty = required + arrival.penaltyMinutes / 60;
        const oldDue = Math.max(0, required - (Number(day.sessions[0]?.total_hours) || 0));
        const newDue = (!nonWorking && closed && worked < requiredWithPenalty) ? requiredWithPenalty - worked : 0;
        if (newDue > 0) {
          targets.forEach((t) => { t.shortDays += 1; t.shortfallHoursTotal += newDue; });
        }

        // Less than 7hr Work Time: a fixed 7-hour threshold, independent of
        // the employee's own schedule requirement.
        if (!nonWorking && closed && worked > 0 && worked < 7) {
          targets.forEach((t) => { t.lessThan7Days += 1; t.lessThan7HoursTotal += worked; });
        }

        // Overtime (actual, not just approved) on a normal working day:
        // hours beyond the (penalty-adjusted) requirement, same as
        // Attendance.tsx's OVERTIME (OT) column.
        if (!nonWorking && closed && worked > requiredWithPenalty) {
          targets.forEach((t) => { t.otActualDays += 1; t.otActualHoursTotal += worked - requiredWithPenalty; });
        }
        if (Math.abs(oldDue - newDue) > 0.01) {
          changed.push({ userId, name: s.name, date: day.date, oldDueHours: round1(oldDue), newDueHours: round1(newDue) });
        }
      });

      const otDaySets = new Map<string, Set<string>>();
      const otDaySetsMonthly = new Map<string, Set<string>>();
      (otRows || []).forEach((r) => {
        const s = byUser.get(r.user_id);
        if (s) {
          s.otHoursTotal += Number(r.requested_hours) || 0;
          const set = otDaySets.get(r.user_id) || new Set<string>();
          set.add(r.date);
          otDaySets.set(r.user_id, set);
        }
        const key = `${r.user_id}|${r.date.slice(0, 7)}`;
        const sm = byUserMonth.get(key);
        if (sm) {
          sm.otHoursTotal += Number(r.requested_hours) || 0;
          const setm = otDaySetsMonthly.get(key) || new Set<string>();
          setm.add(r.date);
          otDaySetsMonthly.set(key, setm);
        }
      });
      otDaySets.forEach((set, id) => {
        const s = byUser.get(id);
        if (s) s.otDays = set.size;
      });
      otDaySetsMonthly.forEach((set, key) => {
        const sm = byUserMonth.get(key);
        if (sm) sm.otDays = set.size;
      });

      // Discard this response if a newer fetch (e.g. the Employee filter
      // changed again) has already started — applying it now would show
      // stale counts for whichever employee is currently selected.
      if (seq === fetchSeq.current) {
        setRows(Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name)));
        setMonthlyRows(Array.from(byUserMonth.values()).sort((a, b) => b.month.localeCompare(a.month)));
        setChangedDays(changed.sort((a, b) => a.date.localeCompare(b.date)));
      }
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [targetIds, effectiveRange, isAdmin]);

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
    return { value: fmtHoursMin(Math.abs(raw)), isOvertime: raw >= 0 };
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
                          <TableCell>{r.lessThan7Days} days · avg {r.lessThan7Days > 0 ? fmtHoursMin(r.lessThan7HoursTotal / r.lessThan7Days) : "0 hr 0min"}</TableCell>
                          <TableCell>{r.shortDays} days · {fmtHoursMin(r.shortfallHoursTotal)}</TableCell>
                          <TableCell>{r.otActualDays} days · {fmtHoursMin(r.otActualHoursTotal)}</TableCell>
                          <TableCell>{r.otDays} days · {fmtHoursMin(r.otHoursTotal)}</TableCell>
                          <TableCell>
                            <div className="font-semibold">{net.value}</div>
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
                              <TableCell className="text-right">{fmtHoursMin(c.oldDueHours)}</TableCell>
                              <TableCell className="text-right">{fmtHoursMin(c.newDueHours)}</TableCell>
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
            <div className="space-y-4">
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
                    avg {mine && mine.lessThan7Days > 0 ? fmtHoursMin(mine.lessThan7HoursTotal / mine.lessThan7Days) : "0 hr 0min"} worked on those days
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Gauge className="h-4 w-4" /> Due Time</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.shortDays ?? 0} days</div>
                  <p className="text-xs font-semibold text-primary mt-1">{fmtHoursMin(mine?.shortfallHoursTotal ?? 0)} total due time</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Overtime</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.otActualDays ?? 0} days</div>
                  <p className="text-xs font-semibold text-primary mt-1">{fmtHoursMin(mine?.otActualHoursTotal ?? 0)} total overtime</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Timer className="h-4 w-4" /> Approved Overtime</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.otDays ?? 0} days</div>
                  <p className="text-xs font-semibold text-primary mt-1">{fmtHoursMin(mine?.otHoursTotal ?? 0)} total approved overtime</p>
                </CardContent>
              </Card>
              {(() => {
                const net = netHoursOf(mine);
                return (
                  <Card>
                    <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Gauge className="h-4 w-4" /> Net Hours</CardDescription></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{net.value}</div>
                      <p className={`text-xs font-semibold mt-1 ${net.isOvertime ? "text-green-600" : "text-red-600"}`}>
                        {net.isOvertime ? "Overtime" : "Due Time"}
                      </p>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Late Entry</TableHead>
                    <TableHead>Late Entry Avg</TableHead>
                    <TableHead>Less than 7hr Days</TableHead>
                    <TableHead>Less than 7hr Avg</TableHead>
                    <TableHead>Due Time Days</TableHead>
                    <TableHead>Due Time</TableHead>
                    <TableHead>Overtime Days</TableHead>
                    <TableHead>Overtime</TableHead>
                    <TableHead>Approved OT Days</TableHead>
                    <TableHead>Approved Overtime</TableHead>
                    <TableHead>Net Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyRows.length === 0 ? (
                    <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground">No records</TableCell></TableRow>
                  ) : monthlyRows.map((m) => {
                    const net = netHoursOf(m);
                    return (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium whitespace-nowrap">{format(new Date(`${m.month}-01T00:00:00`), "MMM yyyy")}</TableCell>
                        <TableCell>{m.lateDays} days</TableCell>
                        <TableCell>{m.lateDays > 0 ? humanMinutes(Math.round(m.lateMinutesTotal / m.lateDays)) : "—"}</TableCell>
                        <TableCell>{m.lessThan7Days} days</TableCell>
                        <TableCell>{m.lessThan7Days > 0 ? fmtHoursMin(m.lessThan7HoursTotal / m.lessThan7Days) : "0 hr 0min"}</TableCell>
                        <TableCell>{m.shortDays} days</TableCell>
                        <TableCell>{fmtHoursMin(m.shortfallHoursTotal)}</TableCell>
                        <TableCell>{m.otActualDays} days</TableCell>
                        <TableCell>{fmtHoursMin(m.otActualHoursTotal)}</TableCell>
                        <TableCell>{m.otDays} days</TableCell>
                        <TableCell>{fmtHoursMin(m.otHoursTotal)}</TableCell>
                        <TableCell>
                          <span className="font-semibold">{net.value}</span>{" "}
                          <span className={net.isOvertime ? "text-xs text-green-600" : "text-xs text-red-600"}>
                            {net.isOvertime ? "(Overtime)" : "(Due Time)"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsSummary;
