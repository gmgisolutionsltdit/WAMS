import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { fmtHMS, fmtClock, spanToHMS } from "@/lib/time";
import { mergeDailySessions, sessionWorkedSeconds, type AttendanceSession } from "@/lib/attendance";
import { evaluateArrival, humanMinutes, officeStart, type OfficeTime } from "@/lib/officeTime";
import { ManualTimeEntryDialog } from "@/components/ManualTimeEntryDialog";
import { classifyDay, DEFAULT_WEEKEND_DAYS } from "@/lib/workSchedule";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STANDARD_HOURS = 7;
const STANDARD_SECONDS = STANDARD_HOURS * 3600;

const Attendance = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceSession[]>([]);
  const [approvedOT, setApprovedOT] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [officeProfile, setOfficeProfile] = useState<OfficeTime | null>(null);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [weekendDays, setWeekendDays] = useState<number[]>(DEFAULT_WEEKEND_DAYS);

  const fetchData = () => {
    if (!user) return;
    Promise.all([
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }),
      supabase.from("overtime_requests").select("*").eq("user_id", user.id).in("status", ["approved", "modified"]).order("date", { ascending: false }),
      supabase.from("profiles").select("office_start_time, office_end_time, late_grace_minutes, company_wing").eq("id", user.id).maybeSingle(),
      supabase.from("holidays").select("holiday_date, name, wing"),
      supabase.from("settings").select("weekend_days").limit(1).maybeSingle(),
    ]).then(([{ data: logsData }, { data: otData }, { data: prof }, { data: holidayRows }, { data: cfg }]) => {
      setLogs((logsData || []) as AttendanceSession[]);
      setApprovedOT(otData || []);
      setOfficeProfile((prof as OfficeTime) || null);
      // A holiday with no wing applies to everyone; otherwise only to its wing.
      const wing = (prof as { company_wing?: string } | null)?.company_wing;
      const map = new Map<string, string>();
      (holidayRows || [])
        .filter((h: { wing: string | null }) => h.wing === null || h.wing === wing)
        .forEach((h: { holiday_date: string; name: string }) => map.set(h.holiday_date, h.name));
      setHolidays(map);
      if (cfg?.weekend_days) setWeekendDays(cfg.weekend_days as number[]);
    });
  };

  const deleteSession = async (id: string) => {
    if (!window.confirm("Delete this session? This cannot be undone.")) return;
    const { error } = await supabase.from("attendance_logs").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Session deleted"); fetchData(); }
  };

  useEffect(() => { fetchData(); }, [user]);

  useRealtimeSubscription("attendance_logs", fetchData, "attendance-page-logs");
  useRealtimeSubscription("overtime_requests", fetchData, "attendance-page-ot");

  const days = mergeDailySessions(logs).sort((a, b) => b.date.localeCompare(a.date));


  return (
    <Card>
      <CardHeader>
        <CardTitle>My Attendance History</CardTitle>
        <p className="text-xs text-muted-foreground">
          Multiple punches on the same day are merged into one record — expand a row to see each session.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>First In</TableHead>
                <TableHead>Approved Time</TableHead>
                <TableHead>Last Out</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Work Time</TableHead>
                <TableHead>Break Time</TableHead>
                <TableHead>Due Time</TableHead>
                <TableHead>OVERTIME (OT)</TableHead>
                <TableHead>Approved OT</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">No attendance records</TableCell></TableRow>
              ) : days.map((day) => {
                const worked = day.workedSeconds;
                const closed = !day.open && !!day.lastOut;
                // A row recorded by the current clock-in flow (or since
                // adjusted by an approval) carries its own authoritative
                // penalty; older rows fall back to a live recomputation.
                const liveArrival = evaluateArrival(day.firstIn, officeProfile);
                const storedArrival = day.penaltyReviewed
                  ? { late: day.penaltyMinutes > 0 || day.lateMinutes > 0, lateMinutes: day.lateMinutes, penaltyMinutes: day.penaltyMinutes }
                  : liveArrival;
                // On a holiday or weekend there is no shift to be late for and
                // no standard hours to meet, so every hour worked is overtime.
                // This matches the rule applyOTFulfillment already enforces
                // when approving OT requests.
                const dayKind = classifyDay(day.date, holidays, weekendDays);
                const arrival = dayKind.nonWorking
                  ? { late: false, lateMinutes: 0, penaltyMinutes: 0 }
                  : storedArrival;
                const requiredSeconds = dayKind.nonWorking ? 0 : STANDARD_SECONDS + arrival.penaltyMinutes * 60;
                const dueSeconds = closed && worked < requiredSeconds ? requiredSeconds - worked : 0;
                // Overtime an approver has already signed off on (a manual
                // entry's reviewed overtime_hours) is credited as approved
                // rather than counted again as unreviewed "regular" OT.
                const manualApprovedOTSeconds = day.sessions
                  .filter((s) => s.device_source === "manual")
                  .reduce((sum, s) => sum + (Number(s.overtime_hours) || 0) * 3600, 0);
                const autoWorkedSeconds = day.sessions
                  .filter((s) => s.device_source !== "manual")
                  .reduce((sum, s) => sum + sessionWorkedSeconds(s), 0);
                const otRegular = closed && autoWorkedSeconds > requiredSeconds ? autoWorkedSeconds - requiredSeconds : 0;
                const rawApproved = approvedOT
                  .filter((ot) => ot.date === day.date)
                  .reduce((sum: number, ot: any) => sum + (ot.requested_hours || 0), 0) * 3600
                  + manualApprovedOTSeconds;
                const approvedAdjusted = Math.max(0, rawApproved - dueSeconds);
                const isOpen = !!expanded[day.key];
                const ips = Array.from(new Set(day.sessions.map((s) => s.ip_address).filter(Boolean)));
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
                            title={`Arrived ${humanMinutes(arrival.lateMinutes)} after ${officeStart(officeProfile).slice(0, 5)} — extra ${humanMinutes(arrival.penaltyMinutes)} of work required`}
                          >
                            Late {humanMinutes(arrival.lateMinutes)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">On time</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{fmtClock(day.firstIn)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {day.approvedStartTime && day.approvedStartTime !== day.firstIn ? (
                          <Badge className="bg-lime-500 text-white border-lime-500 font-mono" title="Late penalty waived by an approved late-time request">
                            {fmtClock(day.approvedStartTime)}
                          </Badge>
                        ) : (
                          fmtClock(day.approvedStartTime ?? day.firstIn)
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
                        {approvedAdjusted > 0
                          ? <Badge className="bg-lime-500 text-white border-lime-500 font-mono">{fmtHMS(approvedAdjusted)}</Badge>
                          : rawApproved > 0
                            ? <span className="text-xs text-muted-foreground font-mono" title={`${fmtHMS(rawApproved)} requested, offset by due time`}>00:00:00</span>
                            : <span className="text-muted-foreground font-mono text-xs">00:00:00</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ips.length ? ips.join(", ") : "—"}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell />
                        <TableCell colSpan={12} className="p-0">
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
