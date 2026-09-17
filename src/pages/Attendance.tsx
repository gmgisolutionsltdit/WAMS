import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, LogOut, Pause, Play, Timer } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { fmtHMS, fmtClock, spanToHMS } from "@/lib/time";
import { mergeDailySessions, sessionWorkedSeconds, type AttendanceSession } from "@/lib/attendance";
import { DEFAULT_OFFICE_START, evaluateArrival, humanMinutes, officeStart, type OfficeTime } from "@/lib/officeTime";
import { ManualTimeEntryDialog } from "@/components/ManualTimeEntryDialog";
import { classifyDay, computeDailyTotals, DEFAULT_WEEKEND_DAYS } from "@/lib/workSchedule";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { notifyManagersAndAdmins } from "@/lib/notifications";

const STANDARD_HOURS = 7;
const STANDARD_SECONDS = STANDARD_HOURS * 3600;

const localToday = () => format(new Date(), "yyyy-MM-dd");

const Attendance = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceSession[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [officeProfile, setOfficeProfile] = useState<OfficeTime | null>(null);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [weekendDays, setWeekendDays] = useState<number[]>(DEFAULT_WEEKEND_DAYS);
  const [starting, setStarting] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [breakAllowance, setBreakAllowance] = useState(60);
  // The org-wide Office Start Time from Settings - the default "officially
  // scheduled" start shown in Approved Start Time and used to judge
  // lateness, until a specific day's late arrival is approved/waived.
  const [settingsOfficeStart, setSettingsOfficeStart] = useState<string>(DEFAULT_OFFICE_START);

  const fetchData = () => {
    if (!user) return;
    Promise.all([
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }),
      supabase.from("profiles").select("office_start_time, office_end_time, late_grace_minutes, company_wing").eq("id", user.id).maybeSingle(),
      supabase.from("holidays").select("holiday_date, name, wing"),
      supabase.from("settings").select("weekend_days, break_allowance_minutes, office_start_time").limit(1).maybeSingle(),
    ]).then(([{ data: logsData }, { data: prof }, { data: holidayRows }, { data: cfg }]) => {
      setLogs((logsData || []) as AttendanceSession[]);
      setOfficeProfile((prof as OfficeTime) || null);
      // A holiday with no wing applies to everyone; otherwise only to its wing.
      const wing = (prof as { company_wing?: string } | null)?.company_wing;
      const map = new Map<string, string>();
      (holidayRows || [])
        .filter((h: { wing: string | null }) => h.wing === null || h.wing === wing)
        .forEach((h: { holiday_date: string; name: string }) => map.set(h.holiday_date, h.name));
      setHolidays(map);
      if (cfg?.weekend_days) setWeekendDays(cfg.weekend_days as number[]);
      if (cfg?.break_allowance_minutes != null) setBreakAllowance(Number(cfg.break_allowance_minutes) || 60);
      setSettingsOfficeStart(cfg?.office_start_time?.slice(0, 5) || DEFAULT_OFFICE_START);
    });
  };

  // A profile-specific office_start_time (set by an approved office-time-change
  // request) always wins over the org-wide Settings default.
  const effectiveOfficeProfile: OfficeTime = {
    ...officeProfile,
    office_start_time: officeProfile?.office_start_time || settingsOfficeStart,
  };

  const deleteSession = async (id: string) => {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    const { error } = await supabase.from("attendance_logs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Session deleted"); fetchData(); }
  };

  /** Same clock-in path as the dashboard's Start button — holiday/weekend
   * aware, records a late penalty when it applies. */
  const handleStart = async () => {
    if (!user) return;
    const today = localToday();
    const hasOpenSession = logs.some((l) => l.date === today && l.clock_in && !l.clock_out);
    if (hasOpenSession) {
      toast.error("You already have an open session today — close it before starting a new one.");
      return;
    }
    setStarting(true);
    const now = new Date();
    const dayKind = classifyDay(today, holidays, weekendDays);
    const arrival = dayKind.nonWorking
      ? { late: false, lateMinutes: 0, penaltyMinutes: 0 }
      : evaluateArrival(now, effectiveOfficeProfile);
    const { error } = await supabase.from("attendance_logs").insert({
      user_id: user.id,
      date: today,
      clock_in: now.toISOString(),
      device_source: "web",
      late_minutes: arrival.lateMinutes,
      penalty_minutes: arrival.penaltyMinutes,
      penalty_reviewed: true,
    });
    if (error) toast.error(error.message);
    else if (arrival.late) {
      toast.warning(
        `Clocked in ${humanMinutes(arrival.lateMinutes)} late — an extra ${humanMinutes(arrival.penaltyMinutes)} of work has been added to today's requirement.`,
      );
      await notifyManagersAndAdmins(
        "Late Arrival Penalty Applied",
        `${user.email} clocked in ${humanMinutes(arrival.lateMinutes)} late today. A ${humanMinutes(arrival.penaltyMinutes)} penalty was added automatically.`,
        undefined,
        { route: "/attendance", type: "late_arrival", requesterId: user.id },
      );
      fetchData();
    } else {
      toast.success("Clocked in!");
      fetchData();
    }
    setStarting(false);
  };

  const openSession = logs.find((l) => l.date === localToday() && l.clock_in && !l.clock_out);
  const isOnBreak = !!(openSession && openSession.break_start && !openSession.break_end);

  const handleClose = async () => {
    if (!user || !openSession) return;
    setStarting(true);
    const now = new Date();
    const totals = computeDailyTotals({
      clockIn: openSession.clock_in,
      clockOut: now,
      breakMinutes: Number(openSession.break_minutes) || 0,
    });
    const { error } = await supabase.from("attendance_logs").update({
      clock_out: now.toISOString(),
      total_hours: totals.totalHours,
      overtime_hours: totals.overtimeHours,
      break_start: null,
      break_end: null,
    }).eq("id", openSession.id);
    if (error) toast.error(error.message);
    else { toast.success(`Clocked out! Total: ${totals.totalHours}h`); fetchData(); }
    setStarting(false);
  };

  const handleBreakStart = async () => {
    if (!user || !openSession) return;
    const { error } = await supabase.from("attendance_logs").update({
      break_start: new Date().toISOString(),
      break_end: null,
    }).eq("id", openSession.id);
    if (error) toast.error(error.message);
    else { toast.success("Break started"); fetchData(); }
  };

  const handleBreakEnd = async () => {
    if (!user || !openSession || !openSession.break_start) return;
    const now = new Date();
    const breakSecs = Math.max(0, Math.round((now.getTime() - new Date(openSession.break_start).getTime()) / 1000));
    const totalBreak = Math.round(((Number(openSession.break_minutes) || 0) + breakSecs / 60) * 10000) / 10000;
    const { error } = await supabase.from("attendance_logs").update({
      break_end: now.toISOString(),
      break_start: null,
      break_minutes: totalBreak,
    }).eq("id", openSession.id);
    if (error) toast.error(error.message);
    else { toast.success(`Break ended (${fmtHMS(breakSecs)})`); fetchData(); }
  };

  /** Continuously ticks so the Working duration in the header updates live. */
  const getRunningDuration = () => {
    if (!openSession) return "00:00:00";
    let elapsed = (currentTime.getTime() - new Date(openSession.clock_in).getTime()) / 1000;
    elapsed -= (Number(openSession.break_minutes) || 0) * 60;
    if (isOnBreak && openSession.break_start) {
      elapsed -= (currentTime.getTime() - new Date(openSession.break_start).getTime()) / 1000;
    }
    return fmtHMS(Math.max(0, elapsed));
  };

  useEffect(() => { fetchData(); }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useRealtimeSubscription("attendance_logs", fetchData, "attendance-page-logs");

  const days = mergeDailySessions(logs).sort((a, b) => b.date.localeCompare(a.date));


  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div>
          <CardTitle>My Attendance History</CardTitle>
          <p className="text-xs text-muted-foreground">
            Multiple punches on the same day are merged into one record — expand a row to see each session.
          </p>
        </div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {openSession && (
                <>
                  {isOnBreak ? (
                    <Badge variant="secondary"><Pause className="mr-1 h-3 w-3" /> On Break</Badge>
                  ) : (
                    <Badge className="bg-success text-success-foreground hover:bg-success/90"><Timer className="mr-1 h-3 w-3" /> Working</Badge>
                  )}
                  <span className="text-lg font-mono font-semibold tabular-nums">{getRunningDuration()}</span>
                  {isOnBreak ? (
                    <Button size="sm" variant="outline" onClick={handleBreakEnd}>
                      <Play className="mr-1 h-4 w-4" /> Resume
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleBreakStart}>
                      <Pause className="mr-1 h-4 w-4" /> Break
                    </Button>
                  )}
                </>
              )}
            </div>
            {isOnBreak && openSession?.break_start && (() => {
              // This break only — restarts at 00:00:00 each time a break
              // begins, while earlier breaks stay in the cumulative total.
              const currentSec = Math.max(0, (currentTime.getTime() - new Date(openSession.break_start).getTime()) / 1000);
              const earlierSec = (Number(openSession.break_minutes) || 0) * 60;
              const remaining = breakAllowance * 60 - (earlierSec + currentSec);
              const over = remaining < 0;
              return (
                <div className="rounded-lg border bg-muted/40 p-3 text-center w-fit">
                  <p className="text-xs text-muted-foreground">Current break</p>
                  <p className="text-2xl font-mono font-bold">{fmtHMS(currentSec)}</p>
                  <p className={`text-[11px] mt-1 ${over ? "text-destructive" : "text-muted-foreground"}`}>
                    {over ? "Overrun " : "Remaining "}{fmtHMS(Math.abs(remaining))} of {breakAllowance} min
                  </p>
                  {earlierSec > 0 && (
                    <p className="text-[11px] text-muted-foreground">Earlier breaks {fmtHMS(earlierSec)}</p>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex gap-2">
            {openSession ? (
              <Button size="sm" variant="destructive" onClick={handleClose} disabled={starting || isOnBreak}>
                <LogOut className="mr-1 h-4 w-4" /> Close
              </Button>
            ) : (
              <Button size="sm" onClick={handleStart} disabled={starting}>
                <LogIn className="mr-1 h-4 w-4" /> Start
              </Button>
            )}
            <ManualTimeEntryDialog onSubmitted={fetchData} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[1400px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Approved Start Time</TableHead>
                <TableHead>Close</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Work Time</TableHead>
                <TableHead>Break Time</TableHead>
                <TableHead>Due Time</TableHead>
                <TableHead>OVERTIME (OT)</TableHead>
                <TableHead>Approved OT</TableHead>
                <TableHead>GMGI Time</TableHead>
                <TableHead>GM Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.length === 0 ? (
                <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground">No attendance records</TableCell></TableRow>
              ) : days.map((day) => {
                const worked = day.workedSeconds;
                const closed = !day.open && !!day.lastOut;
                // A row recorded by the current clock-in flow (or since
                // adjusted by an approval) carries its own authoritative
                // penalty; older rows fall back to a live recomputation.
                const liveArrival = evaluateArrival(day.firstIn, effectiveOfficeProfile);
                // penalty_minutes is the authoritative, approval-adjusted
                // figure once reviewed - late_minutes is cleared alongside it
                // by the approval trigger when the penalty is fully waived,
                // so "late" is driven by the penalty rather than a stale
                // late_minutes that could otherwise keep the Late badge (and
                // Due Time) showing after Approve Start Time was granted.
                const storedArrival = day.penaltyReviewed
                  ? { late: day.penaltyMinutes > 0, lateMinutes: day.lateMinutes, penaltyMinutes: day.penaltyMinutes }
                  : liveArrival;
                // On a holiday or weekend there is no shift to be late for and
                // no standard hours to meet, so every hour worked is overtime.
                // This matches the rule applyOTFulfillment already enforces
                // when approving OT requests.
                const dayKind = classifyDay(day.date, holidays, weekendDays);
                const arrival = dayKind.nonWorking
                  ? { late: false, lateMinutes: 0, penaltyMinutes: 0 }
                  : storedArrival;
                // Due Time = the standard shift plus the late penalty minutes -
                // drops to 0 once Approve Start Time waives the penalty.
                const requiredSeconds = dayKind.nonWorking
                  ? 0
                  : STANDARD_SECONDS + arrival.penaltyMinutes * 60;
                const dueSeconds = closed && worked < requiredSeconds ? requiredSeconds - worked : 0;
                // Counts time worked regardless of source - a manual entry
                // represents real hours worked just as much as a punch-card
                // session, so both push a day into overtime the same way.
                const otRegular = closed && worked > requiredSeconds ? worked - requiredSeconds : 0;
                const isOpen = !!expanded[day.key];
                return (
                  <Fragment key={day.key}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setExpanded((e) => ({ ...e, [day.key]: !e[day.key] }))}
                          aria-label={isOpen ? "Hide sessions" : "Show sessions"}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(day.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {dayKind.nonWorking ? (
                          <Badge
                            className="bg-warning/20 text-warning border-warning/40"
                            title={`${dayKind.reason === "holiday" ? dayKind.holidayName ?? "Holiday" : "Weekend"} — no standard hours required, all time worked counts as overtime`}
                          >
                            {dayKind.reason === "holiday" ? dayKind.holidayName ?? "Holiday" : "Weekend"}
                          </Badge>
                        ) : arrival.late ? (
                          <Badge
                            variant="destructive"
                            title={`Arrived ${humanMinutes(arrival.lateMinutes)} after ${officeStart(effectiveOfficeProfile).slice(0, 5)} — extra ${humanMinutes(arrival.penaltyMinutes)} of work required`}
                          >
                            Late {humanMinutes(arrival.lateMinutes)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">On time</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{fmtClock(day.firstIn)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {day.approvedStartTime ? (
                          <Badge className="bg-lime-500 text-white border-lime-500 font-mono" title="Late penalty waived by an approved late-time request">
                            {fmtClock(day.approvedStartTime)}
                          </Badge>
                        ) : (
                          // No waiver on this day - Approved Start Time defaults to
                          // this employee's office start time (their profile
                          // override if an office-time-change was approved for
                          // them, else the org's Settings default).
                          fmtClock(`${day.date}T${officeStart(effectiveOfficeProfile).slice(0, 5)}:00`)
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{day.open ? <Badge variant="secondary">In progress</Badge> : fmtClock(day.lastOut)}</TableCell>
                      <TableCell><Badge variant="outline">{day.sessions.length}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{fmtHMS(worked)}</TableCell>
                      <TableCell className="font-mono text-xs">{day.breakSeconds > 0 ? fmtHMS(day.breakSeconds) : "—"}</TableCell>
                      <TableCell>
                        {dueSeconds > 0
                          ? (
                            <Badge variant="destructive" className="font-mono" title={arrival.late ? `Includes ${humanMinutes(arrival.penaltyMinutes)} late penalty` : undefined}>
                              {fmtHMS(dueSeconds)}
                            </Badge>
                          )
                          : <span className="text-muted-foreground font-mono text-xs">00:00:00</span>}
                      </TableCell>

                      <TableCell>
                        {otRegular > 0
                          ? <Badge variant="outline" className="font-mono">{fmtHMS(otRegular)}</Badge>
                          : <span className="text-muted-foreground font-mono text-xs">00:00:00</span>}
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground font-mono text-xs">00:00:00</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{day.gmgiTime > 0 ? `${day.gmgiTime}h` : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{day.gmTime > 0 ? `${day.gmTime}h` : "—"}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell />
                        <TableCell colSpan={13} className="p-0">
                          <div className="p-3">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Individual sessions</p>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>#</TableHead>
                                  <TableHead>Start</TableHead>
                                  <TableHead>Close</TableHead>
                                  <TableHead>Break</TableHead>
                                  <TableHead>Duration</TableHead>
                                  <TableHead>Source</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {day.sessions.map((s, i) => (
                                  <TableRow key={s.id}>
                                    <TableCell className="text-xs">{i + 1}</TableCell>
                                    <TableCell className="font-mono text-xs">{fmtClock(s.clock_in)}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {s.clock_out ? fmtClock(s.clock_out) : <Badge variant="secondary">Open</Badge>}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{fmtHMS((Number(s.break_minutes) || 0) * 60)}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {s.clock_out && s.clock_in
                                        ? fmtHMS(sessionWorkedSeconds(s))
                                        : s.clock_in ? spanToHMS(s.clock_in, new Date()) : "—"}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{s.device_source || "web"}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1">
                                        <ManualTimeEntryDialog
                                          onSubmitted={fetchData}
                                          supersedesLogId={s.id}
                                          initial={{
                                            date: s.date,
                                            clock_in: s.clock_in ? format(new Date(s.clock_in), "HH:mm") : "09:00",
                                            clock_out: s.clock_out ? format(new Date(s.clock_out), "HH:mm") : "17:00",
                                            break_minutes: String(Number(s.break_minutes) || 0),
                                            task_note: `Correction to session on ${s.date}`,
                                            reason: "Correction to this session",
                                          }}
                                          trigger={
                                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit this session">
                                              <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                          }
                                        />
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-destructive hover:text-destructive"
                                          aria-label="Delete this session"
                                          onClick={() => deleteSession(s.id)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default Attendance;
