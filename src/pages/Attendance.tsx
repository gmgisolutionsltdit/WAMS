import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const Attendance = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }).then(({ data }) => setLogs(data || []));
  }, [user]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Attendance History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Clock In</TableHead>
              <TableHead>Clock Out</TableHead>
              <TableHead>Total Hours</TableHead>
              <TableHead>Overtime</TableHead>
              <TableHead>IP Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No attendance records</TableCell></TableRow>
            ) : logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{format(new Date(log.date), "MMM d, yyyy")}</TableCell>
                <TableCell>{log.clock_in ? format(new Date(log.clock_in), "HH:mm") : "—"}</TableCell>
                <TableCell>{log.clock_out ? format(new Date(log.clock_out), "HH:mm") : "—"}</TableCell>
                <TableCell>{log.total_hours?.toFixed(1) || "—"}</TableCell>
                <TableCell>
                  {log.overtime_hours > 0 ? <Badge variant="destructive">{log.overtime_hours.toFixed(1)}h</Badge> : "0.0"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{log.ip_address || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default Attendance;
