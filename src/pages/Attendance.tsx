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

const STANDARD_HOURS = 7;
const STANDARD_SECONDS = STANDARD_HOURS * 3600;

const Attendance = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AttendanceSession[]>([]);
  const [approvedOT, setApprovedOT] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [officeProfile, setOfficeProfile] = useState<OfficeTime | null>(null);

  const fetchData = () => {
    if (!user) return;
    Promise.all([
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }),
      supabase.from("overtime_requests").select("*").eq("user_id", user.id).in("status", ["approved", "modified"]).order("date", { ascending: false }),
      supabase.from("profiles").select("office_start_time, office_end_time, late_grace_minutes").eq("id", user.id).maybeSingle(),
    ]).then(([{ data: logsData }, { data: otData }, { data: prof }]) => {
      setLogs((logsData || []) as AttendanceSession[]);
      setApprovedOT(otData || []);
      setOfficeProfile((prof as OfficeTime) || null);
    });
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
                <TableHead>Last Out</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Break Time</TableHead>
                <TableHead>Total Hours</TableHead>
                <TableHead>Due Time</TableHead>
                <TableHead>OT Regular</TableHead>
                <TableHead>Approved OT</TableHead>
                <TableHead>Total Overtime</TableHead>
                <TableHead>IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.length === 0 ? (
                <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground">No attendance records</TableCell></TableRow>
              ) : days.map((day) => {
                const worked = day.workedSeconds;
                const closed = !day.open && !!day.lastOut;
                const arrival = evaluateArrival(day.firstIn, officeProfile);
                const requiredSeconds = STANDARD_SECONDS + arrival.penaltyMinutes * 60;
                const dueSeconds = closed && worked < requiredSeconds ? requiredSeconds - worked : 0;
                const otRegular = closed && worked > requiredSeconds ? worked - requiredSeconds : 0;
                const rawApproved = approvedOT
                  .filter((ot) => ot.date === day.date)
                  .reduce((sum: number, ot: any) => sum + (ot.requested_hours || 0), 0) * 3600;
                const approvedAdjusted = Math.max(0, rawApproved - dueSeconds);
                const totalOT = approvedAdjusted + otRegular;
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
                        {arrival.late ? (
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
                      <TableCell className="font-mono text-xs">{day.open ? <Badge variant="secondary">In progress</Badge> : fmtClock(day.lastOut)}</TableCell>
                      <TableCell><Badge variant="outline">{day.sessions.length}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{day.breakSeconds > 0 ? fmtHMS(day.breakSeconds) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtHMS(worked)}</TableCell>
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
                            : "—"}
                      </TableCell>
                      <TableCell>
                        {totalOT > 0
                          ? <Badge className="bg-primary text-primary-foreground font-mono">{fmtHMS(totalOT)}</Badge>
                          : <span className="text-muted-foreground font-mono text-xs">00:00:00</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{ips.length ? ips.join(", ") : "—"}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell />
                        <TableCell colSpan={11} className="p-0">
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
