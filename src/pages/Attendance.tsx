import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const STANDARD_HOURS = 7;

const fmtHrs = (h: number) => {
  if (!isFinite(h) || h <= 0) return "0h 0m";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
};

const Attendance = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [approvedOT, setApprovedOT] = useState<any[]>([]);

  const fetchData = () => {
    if (!user) return;
    Promise.all([
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }),
      supabase.from("overtime_requests").select("*").eq("user_id", user.id).in("status", ["approved", "modified"]).order("date", { ascending: false }),
    ]).then(([{ data: logsData }, { data: otData }]) => {
      setLogs(logsData || []);
      setApprovedOT(otData || []);
    });
  };

  useEffect(() => { fetchData(); }, [user]);

  useRealtimeSubscription("attendance_logs", fetchData, "attendance-page-logs");
  useRealtimeSubscription("overtime_requests", fetchData, "attendance-page-ot");

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Attendance History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Clock In</TableHead>
                <TableHead>Clock Out</TableHead>
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
              {logs.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No attendance records</TableCell></TableRow>
              ) : logs.map((log) => {
                const breakHrs = (log.break_minutes || 0) / 60;
                const total = Math.max(0, log.total_hours || 0);
                const hasOut = !!log.clock_out;
                const dueTime = hasOut && total < STANDARD_HOURS ? STANDARD_HOURS - total : 0;
                const otRegular = hasOut && total > STANDARD_HOURS ? total - STANDARD_HOURS : 0;
                const rawApproved = approvedOT
                  .filter((ot) => ot.date === log.date)
                  .reduce((sum: number, ot: any) => sum + (ot.requested_hours || 0), 0);
                const approvedAdjusted = Math.max(0, rawApproved - dueTime);
                const totalOT = approvedAdjusted + otRegular;
                return (
                  <TableRow key={log.id}>
                    <TableCell>{format(new Date(log.date), "MMM d, yyyy")}</TableCell>
                    <TableCell>{log.clock_in ? format(new Date(log.clock_in), "HH:mm") : "—"}</TableCell>
                    <TableCell>{log.clock_out ? format(new Date(log.clock_out), "HH:mm") : "—"}</TableCell>
                    <TableCell>{breakHrs > 0 ? fmtHrs(breakHrs) : "—"}</TableCell>
                    <TableCell>{hasOut ? fmtHrs(total) : "—"}</TableCell>
                    <TableCell>
                      {dueTime > 0
                        ? <Badge variant="destructive">{fmtHrs(dueTime)}</Badge>
                        : <span className="text-muted-foreground">0h 0m</span>}
                    </TableCell>
                    <TableCell>
                      {otRegular > 0
                        ? <Badge variant="outline">{fmtHrs(otRegular)}</Badge>
                        : <span className="text-muted-foreground">0h 0m</span>}
                    </TableCell>
                    <TableCell>
                      {approvedAdjusted > 0
                        ? <Badge className="bg-lime-500 text-white border-lime-500">{fmtHrs(approvedAdjusted)}</Badge>
                        : rawApproved > 0
                          ? <span className="text-xs text-muted-foreground" title={`${fmtHrs(rawApproved)} requested, offset by due time`}>0h 0m</span>
                          : "—"}
                    </TableCell>
                    <TableCell>
                      {totalOT > 0
                        ? <Badge className="bg-primary text-primary-foreground">{fmtHrs(totalOT)}</Badge>
                        : <span className="text-muted-foreground">0h 0m</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.ip_address || "—"}</TableCell>
                  </TableRow>
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
