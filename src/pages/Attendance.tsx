import { Fragment, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, LogOut, Pause, Play, Timer, ListTodo } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WORK_FROM_OPTIONS, DEFAULT_WORK_FROM } from "@/lib/workFrom";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { fmtHMS, fmtClock, spanToHMS, hmToHours, hoursToHM } from "@/lib/time";
import { mergeDailySessions, sessionWorkedSeconds, type AttendanceSession } from "@/lib/attendance";
import { evaluateArrival, humanMinutes, officeStart } from "@/lib/officeTime";
import { ManualTimeEntryDialog } from "@/components/ManualTimeEntryDialog";
import { HourMinuteInput } from "@/components/HourMinuteInput";
import {
  classifyDay, computeDailyTotals, netRequiredHours, unpaidBreakMinutes, weekendDaysFor,
  type WorkSchedule,
} from "@/lib/workSchedule";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { notifyManagersAndAdmins } from "@/lib/notifications";

const localToday = () => format(new Date(), "yyyy-MM-dd");

const Attendance = () => {
  const { user, role } = useAuth();
  const [logs, setLogs] = useState<AttendanceSession[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // This employee's own office hours / work schedule (Employees page). Every
  // lateness, due-time, overtime and non-working-day decision below is made
  // against it, so two people on different shifts are judged separately.
  const [schedule, setSchedule] = useState<WorkSchedule | null>(null);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [starting, setStarting] = useState(false);
  const [workFromOpen, setWorkFromOpen] = useState(false);
  const [workFrom, setWorkFrom] = useState<string[]>([DEFAULT_WORK_FROM]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeForm, setCloseForm] = useState({ gmgi_task: "", gm_task: "", gmgi_time: "", gm_time: "" });
  const [currentTime, setCurrentTime] = useState(new Date());
  // Approved/modified OT request hours, summed per date, for the Approved OT column.
  const [approvedOTByDate, setApprovedOTByDate] = useState<Record<string, number>>({});
  // Dates covered by an approved leave request - on leave, Status shows
  // "Leave" instead of on-time/late, and (like a holiday/weekend) there is
  // no standard-hours requirement, so any time worked counts as overtime.
  const [leaveDates, setLeaveDates] = useState<Map<string, string>>(new Map());

  // Both an explicit call after a mutation (clock-in, break start/end, close)
  // and the attendance_logs realtime subscription call fetchData for the same
  // change, with no ordering guarantee between the two in-flight requests. A
  // sequence guard keeps a slower, already-superseded response from
  // overwriting state set by a newer one — e.g. a stale "still on break" read
  // landing after Resume already cleared it, freezing the break panel back on.
  const fetchSeq = useRef(0);

  const fetchData = () => {
    if (!user) return;
    const seq = ++fetchSeq.current;
    Promise.all([
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }),
      supabase.from("profiles").select("office_start_time, office_end_time, late_grace_minutes, standard_daily_hours, unpaid_break_minutes, working_days, company_wing").eq("id", user.id).maybeSingle(),
      supabase.from("holidays").select("holiday_date, name, wing"),
      supabase.from("overtime_requests").select("date, requested_hours").eq("user_id", user.id).in("status", ["approved", "modified"]),
      supabase.from("leave_requests").select("start_date, end_date, leave_types(name)").eq("user_id", user.id).eq("status", "approved"),
    ]).then(([{ data: logsData }, { data: prof }, { data: holidayRows }, { data: otRows }, { data: leaveRows }]) => {
      if (seq !== fetchSeq.current) return;
      setLogs((logsData || []) as AttendanceSession[]);
      setSchedule((prof as WorkSchedule) || null);
      // A holiday with no wing applies to everyone; otherwise only to its wing.
      const wing = (prof as { company_wing?: string } | null)?.company_wing;
      const map = new Map<string, string>();
      (holidayRows || [])
        .filter((h: { wing: string | null }) => h.wing === null || h.wing === wing)
        .forEach((h: { holiday_date: string; name: string }) => map.set(h.holiday_date, h.name));
      setHolidays(map);
      const otMap: Record<string, number> = {};
      (otRows || []).forEach((r: { date: string; requested_hours: number | null }) => {
        otMap[r.date] = (otMap[r.date] || 0) + (Number(r.requested_hours) || 0);
      });
      setApprovedOTByDate(otMap);
      const leaveMap = new Map<string, string>();
      (leaveRows || []).forEach((r: { start_date: string; end_date: string; leave_types?: { name: string } | null }) => {
        const name = r.leave_types?.name || "Leave";
        for (let d = new Date(`${r.start_date}T00:00:00`); d <= new Date(`${r.end_date}T00:00:00`); d.setDate(d.getDate() + 1)) {
          leaveMap.set(format(d, "yyyy-MM-dd"), name);
        }
      });
      setLeaveDates(leaveMap);
    });
  };

  // Derived from this employee's own schedule: the days they don't work count
  // as weekend, their break allowance drives the break countdown, and their
  // net required hours set the daily requirement.
  const weekendDays = weekendDaysFor(schedule);
  const breakAllowance = unpaidBreakMinutes(schedule);
  const requiredDaySeconds = netRequiredHours(schedule) * 3600;

  const deleteSession = async (id: string) => {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    const { data, error } = await supabase.from("attendance_logs").delete().eq("id", id).select();
    if (error) toast.error(error.message);
    // RLS silently returns zero rows (no error) when the delete is blocked -
    // that used to look like a no-op "it isn't working" to the user.
    else if (!data || data.length === 0) {
      toast.error("This session could not be deleted — ask an admin to remove it.");
    } else {
      toast.success("Session deleted");
      fetchData();
    }
  };

  /** Same clock-in path as the dashboard's Start button — holiday/weekend
   * aware, records a late penalty when it applies. Shows a Work From
   * selection dialog first; the actual insert happens in confirmStart. */
  const handleStart = () => {
    if (!user) return;
    const today = localToday();
    const hasOpenSession = logs.some((l) => l.date === today && l.clock_in && !l.clock_out);
    if (hasOpenSession) {
      toast.error("You already have an open session today — close it before starting a new one.");
      return;
    }
    setWorkFromOpen(true);
  };

  const confirmStart = async () => {
    if (!user) return;
    if (!workFrom.length) { toast.error("Select at least one Work From option"); return; }
    setWorkFromOpen(false);
    setStarting(true);
    const today = localToday();
    const now = new Date();
    const dayKind = classifyDay(today, holidays, weekendDays);
    const arrival = dayKind.nonWorking
      ? { late: false, lateMinutes: 0, penaltyMinutes: 0 }
      : evaluateArrival(now, schedule);
    const { error } = await supabase.from("attendance_logs").insert({
      user_id: user.id,
      date: today,
      clock_in: now.toISOString(),
      device_source: "web",
      late_minutes: arrival.lateMinutes,
      penalty_minutes: arrival.penaltyMinutes,
      penalty_reviewed: true,
      work_from: workFrom,
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

  const handleClose = () => {
    if (!user || !openSession) return;
    setCloseForm({ gmgi_task: "", gm_task: "", gmgi_time: "", gm_time: "" });
    setCloseDialogOpen(true);
  };

  const confirmClose = async () => {
    if (!user || !openSession) return;
    const gmgiTime = Math.max(0, parseFloat(closeForm.gmgi_time) || 0);
    const gmTime = Math.max(0, parseFloat(closeForm.gm_time) || 0);
    setCloseDialogOpen(false);
    setStarting(true);
    const now = new Date();
    const totals = computeDailyTotals({
      clockIn: openSession.clock_in,
      clockOut: now,
      breakMinutes: Number(openSession.break_minutes) || 0,
      schedule,
    });
    const { data, error } = await supabase.from("attendance_logs").update({
      clock_out: now.toISOString(),
      total_hours: totals.totalHours,
      overtime_hours: totals.overtimeHours,
      break_start: null,
      break_end: null,
      gmgi_task: closeForm.gmgi_task.trim() || null,
      gm_task: closeForm.gm_task.trim() || null,
      gmgi_time: gmgiTime,
      gm_time: gmTime,
    }).eq("id", openSession.id).select("id");
    if (error) toast.error(error.message);
    else if (!data?.length) toast.error("Couldn't close this session — try refreshing the page.");
    else {
      toast.success(`Clocked out! Total: ${totals.totalHours}h`);
      setLogs((prev) => prev.map((l) => (l.id === openSession.id
        ? { ...l, clock_out: now.toISOString(), total_hours: totals.totalHours, overtime_hours: totals.overtimeHours, break_start: null, break_end: null }
        : l)));
      fetchData();
    }
    setStarting(false);
  };

  const handleBreakStart = async () => {
    if (!user || !openSession) return;
    const break_start = new Date().toISOString();
    const { data, error } = await supabase.from("attendance_logs").update({
      break_start,
      break_end: null,
    }).eq("id", openSession.id).select("id");
    if (error) toast.error(error.message);
    else if (!data?.length) toast.error("Couldn't start the break — try refreshing the page.");
    else {
      toast.success("Break started");
      // Apply the change to local state immediately rather than waiting on the
      // async refetch (triggered both here and by the realtime subscription) -
      // that round trip is what let a slower, stale read occasionally land
      // after this one and leave the break panel showing as "still on break".
      setLogs((prev) => prev.map((l) => (l.id === openSession.id ? { ...l, break_start, break_end: null } : l)));
      fetchData();
    }
  };

  const handleBreakEnd = async () => {
    if (!user || !openSession || !openSession.break_start) return;
    const now = new Date();
    const breakSecs = Math.max(0, Math.round((now.getTime() - new Date(openSession.break_start).getTime()) / 1000));
    const totalBreak = Math.round(((Number(openSession.break_minutes) || 0) + breakSecs / 60) * 10000) / 10000;
    const { data, error } = await supabase.from("attendance_logs").update({
      break_end: now.toISOString(),
      break_start: null,
      break_minutes: totalBreak,
    }).eq("id", openSession.id).select("id");
    if (error) toast.error(error.message);
    else if (!data?.length) toast.error("Couldn't resume — try refreshing the page.");
    else {
      toast.success(`Break ended (${fmtHMS(breakSecs)})`);
      // See handleBreakStart: apply locally right away so the Current break
      // panel clears the instant Resume succeeds, instead of waiting on a
      // refetch that a slower, superseded read could still occasionally win.
      setLogs((prev) => prev.map((l) => (l.id === openSession.id ? { ...l, break_start: null, break_end: now.toISOString(), break_minutes: totalBreak } : l)));
      fetchData();
    }
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
  useRealtimeSubscription("overtime_requests", fetchData, "attendance-page-ot");
  useRealtimeSubscription("leave_requests", fetchData, "attendance-page-leave");

  const days = mergeDailySessions(logs).sort((a, b) => b.date.localeCompare(a.date));


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3">
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
                {!isOnBreak && openSession && (Number(openSession.break_minutes) || 0) > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    Earlier breaks {fmtHMS((Number(openSession.break_minutes) || 0) * 60)}
                  </span>
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
      </Card>

      <Dialog open={workFromOpen} onOpenChange={setWorkFromOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Where are you working from today?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Work From</Label>
              <Select value={workFrom[0] || DEFAULT_WORK_FROM} onValueChange={(v) => setWorkFrom([v])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORK_FROM_OPTIONS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={confirmStart} disabled={starting}>Continue</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>What did you work on today?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <Label>GMGI Task</Label>
                  <Input
                    placeholder="What GMGI work was done?"
                    value={closeForm.gmgi_task}
                    onChange={(e) => setCloseForm((f) => ({ ...f, gmgi_task: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>GM Task</Label>
                  <Input
                    placeholder="What GM work was done?"
                    value={closeForm.gm_task}
                    onChange={(e) => setCloseForm((f) => ({ ...f, gm_task: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <HourMinuteInput
                  label="GMGI Time"
                  hours={hoursToHM(closeForm.gmgi_time).h}
                  minutes={hoursToHM(closeForm.gmgi_time).m}
                  onHoursChange={(h) => setCloseForm((f) => ({ ...f, gmgi_time: String(hmToHours(h, hoursToHM(f.gmgi_time).m)) }))}
                  onMinutesChange={(m) => setCloseForm((f) => ({ ...f, gmgi_time: String(hmToHours(hoursToHM(f.gmgi_time).h, m)) }))}
                />
                <HourMinuteInput
                  label="GM Time"
                  hours={hoursToHM(closeForm.gm_time).h}
                  minutes={hoursToHM(closeForm.gm_time).m}
                  onHoursChange={(h) => setCloseForm((f) => ({ ...f, gm_time: String(hmToHours(h, hoursToHM(f.gm_time).m)) }))}
                  onMinutesChange={(m) => setCloseForm((f) => ({ ...f, gm_time: String(hmToHours(hoursToHM(f.gm_time).h, m)) }))}
                />
              </div>
            </div>
            <Button className="w-full" variant="destructive" onClick={confirmClose} disabled={starting}>
              <LogOut className="mr-1 h-4 w-4" /> Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
      <CardHeader>
        <CardTitle className="text-green-600">My Attendance History</CardTitle>
        <p className="text-xs text-muted-foreground">
          Multiple punches on the same day are merged into one record — expand a row to see each session.
        </p>
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
                <TableHead>Total Time</TableHead>
                <TableHead>Due Time</TableHead>
                <TableHead>OVERTIME (OT)</TableHead>
                <TableHead>Approved OT</TableHead>
                <TableHead>GMGI Time</TableHead>
                <TableHead>GM Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.length === 0 ? (
                <TableRow><TableCell colSpan={15} className="text-center text-muted-foreground">No attendance records</TableCell></TableRow>
              ) : days.map((day) => {
                const worked = day.workedSeconds;
                const closed = !day.open && !!day.lastOut;
                // A row recorded by the current clock-in flow (or since
                // adjusted by an approval) carries its own authoritative
                // penalty; older rows fall back to a live recomputation.
                const liveArrival = evaluateArrival(day.firstIn, schedule);
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
                const leaveName = leaveDates.get(day.date);
                // An approved leave day has no shift to be late for either -
                // treat it the same as a holiday/weekend for OT purposes.
                const nonWorking = dayKind.nonWorking || !!leaveName;
                const arrival = nonWorking
                  ? { late: false, lateMinutes: 0, penaltyMinutes: 0 }
                  : storedArrival;
                // Due Time = the standard shift plus the late penalty minutes -
                // drops to 0 once Approve Start Time waives the penalty.
                const requiredSeconds = nonWorking
                  ? 0
                  : requiredDaySeconds + arrival.penaltyMinutes * 60;
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
                        {leaveName ? (
                          <Badge
                            className="bg-primary/15 text-primary border-primary/30"
                            title={`${leaveName} — no standard hours required, all time worked counts as overtime`}
                          >
                            Leave
                          </Badge>
                        ) : dayKind.nonWorking ? (
                          <Badge
                            className="bg-warning/20 text-warning border-warning/40"
                            title={`${dayKind.reason === "holiday" ? dayKind.holidayName ?? "Holiday" : "Weekend"} — no standard hours required, all time worked counts as overtime`}
                          >
                            {dayKind.reason === "holiday" ? dayKind.holidayName ?? "Holiday" : "Weekend"}
                          </Badge>
                        ) : arrival.late ? (
                          <Badge
                            variant="destructive"
                            title={`Arrived ${humanMinutes(arrival.lateMinutes)} after ${officeStart(schedule).slice(0, 5)} — extra ${humanMinutes(arrival.penaltyMinutes)} of work required`}
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
                          fmtClock(`${day.date}T${officeStart(schedule).slice(0, 5)}:00`)
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{day.open ? <Badge variant="secondary">In progress</Badge> : fmtClock(day.lastOut)}</TableCell>
                      <TableCell><Badge variant="outline">{day.sessions.length}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{fmtHMS(worked)}</TableCell>
                      <TableCell className="font-mono text-xs">{day.breakSeconds > 0 ? fmtHMS(day.breakSeconds) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtHMS(worked + day.breakSeconds)}</TableCell>
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
                        {(approvedOTByDate[day.date] || 0) > 0
                          ? <Badge className="bg-lime-500 text-white border-lime-500 font-mono">{fmtHMS(approvedOTByDate[day.date] * 3600)}</Badge>
                          : <span className="text-muted-foreground font-mono text-xs">00:00:00</span>}
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
                                  <TableHead>Work From</TableHead>
                                  <TableHead>Break Time</TableHead>
                                  <TableHead>Work Time</TableHead>
                                  <TableHead>Total Time</TableHead>
                                  <TableHead>Source</TableHead>
                                  <TableHead>Task</TableHead>
                                  <TableHead>GMGI Time</TableHead>
                                  <TableHead>GM Time</TableHead>
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
                                    <TableCell className="whitespace-nowrap space-x-1">
                                      {s.work_from?.length ? s.work_from.map((w) => <Badge key={w} variant="outline">{w}</Badge>) : "—"}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{fmtHMS((Number(s.break_minutes) || 0) * 60)}</TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {s.clock_out && s.clock_in
                                        ? fmtHMS(sessionWorkedSeconds(s))
                                        : s.clock_in ? spanToHMS(s.clock_in, new Date()) : "—"}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {fmtHMS(
                                        (Number(s.break_minutes) || 0) * 60 +
                                        (s.clock_out && s.clock_in
                                          ? sessionWorkedSeconds(s)
                                          : s.clock_in ? (Date.now() - new Date(s.clock_in).getTime()) / 1000 : 0),
                                      )}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{s.device_source === "manual" ? "Manual" : "Automatic"}</TableCell>
                                    <TableCell>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button variant="outline" size="sm" className="h-7 text-xs">
                                            <ListTodo className="h-3.5 w-3.5 mr-1" /> View Task
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-72 text-xs space-y-2">
                                          <div>
                                            <p className="font-medium text-muted-foreground">GMGI Task</p>
                                            <p>{s.gmgi_task || "—"}</p>
                                          </div>
                                          <div>
                                            <p className="font-medium text-muted-foreground">GM Task</p>
                                            <p>{s.gm_task || "—"}</p>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{s.gmgi_time ? `${s.gmgi_time}h` : "—"}</TableCell>
                                    <TableCell className="font-mono text-xs">{s.gm_time ? `${s.gm_time}h` : "—"}</TableCell>
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
                                            gmgi_task: s.gmgi_task || "",
                                            gm_task: s.gm_task || "",
                                            gmgi_time: s.gmgi_time ? String(s.gmgi_time) : "",
                                            gm_time: s.gm_time ? String(s.gm_time) : "",
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
    </div>
  );
};

export default Attendance;
