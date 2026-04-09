import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, LogIn, LogOut, Timer, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const Dashboard = () => {
  const { user, role } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayLog, setTodayLog] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    if (!user) return;
    const today = format(new Date(), "yyyy-MM-dd");

    const [{ data: todayData }, { data: recent }] = await Promise.all([
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).eq("date", today).maybeSingle(),
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(10),
    ]);
    setTodayLog(todayData);
    setRecentLogs(recent || []);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleClockIn = async () => {
    if (!user) return;
    setLoading(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from("attendance_logs").insert({
      user_id: user.id,
      clock_in: now,
      ip_address: "192.168.1.1 (simulated)",
    });
    if (error) toast.error(error.message);
    else { toast.success("Clocked in!"); fetchData(); }
    setLoading(false);
  };

  const handleClockOut = async () => {
    if (!user || !todayLog) return;
    setLoading(true);
    const now = new Date();
    const clockIn = new Date(todayLog.clock_in);
    const totalHours = Math.round(((now.getTime() - clockIn.getTime()) / 3600000) * 100) / 100;
    const overtimeHours = Math.max(0, Math.round((totalHours - 8) * 100) / 100);

    const { error } = await supabase.from("attendance_logs").update({
      clock_out: now.toISOString(),
      total_hours: totalHours,
      overtime_hours: overtimeHours,
    }).eq("id", todayLog.id);
    if (error) toast.error(error.message);
    else { toast.success(`Clocked out! Total: ${totalHours}h, OT: ${overtimeHours}h`); fetchData(); }
    setLoading(false);
  };

  const isClockedIn = todayLog && todayLog.clock_in && !todayLog.clock_out;
  const workedHours = isClockedIn
    ? Math.round(((currentTime.getTime() - new Date(todayLog.clock_in).getTime()) / 3600000) * 100) / 100
    : (todayLog?.total_hours || 0);
  const progressPercent = Math.min(100, (workedHours / 8) * 100);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Clock Widget */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current Time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-center">
              {format(currentTime, "HH:mm:ss")}
            </div>
            <p className="text-center text-sm text-muted-foreground mt-1">{format(currentTime, "EEEE, MMMM d, yyyy")}</p>
          </CardContent>
        </Card>

        {/* Clock In/Out */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today's Status</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {isClockedIn ? (
              <>
                <Badge variant="default" className="text-sm"><Timer className="mr-1 h-3 w-3" /> Working</Badge>
                <Button size="lg" variant="destructive" onClick={handleClockOut} disabled={loading} className="w-full">
                  <LogOut className="mr-2 h-5 w-5" /> Clock Out
                </Button>
              </>
            ) : todayLog?.clock_out ? (
              <Badge variant="secondary" className="text-sm">Day Complete ✓</Badge>
            ) : (
              <Button size="lg" onClick={handleClockIn} disabled={loading} className="w-full">
                <LogIn className="mr-2 h-5 w-5" /> Clock In
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Progress */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Daily Progress (8h standard)</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progressPercent} className="h-4" />
            <p className="text-center text-sm mt-2 font-medium">
              {workedHours.toFixed(1)} / 8.0 hours
              {workedHours > 8 && (
                <span className="text-destructive ml-2">
                  <AlertCircle className="inline h-3 w-3 mr-1" />
                  +{(workedHours - 8).toFixed(1)}h OT
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Attendance */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attendance</CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLogs.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No records yet</TableCell></TableRow>
              ) : recentLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{format(new Date(log.date), "MMM d, yyyy")}</TableCell>
                  <TableCell>{log.clock_in ? format(new Date(log.clock_in), "HH:mm") : "—"}</TableCell>
                  <TableCell>{log.clock_out ? format(new Date(log.clock_out), "HH:mm") : "—"}</TableCell>
                  <TableCell>{log.total_hours?.toFixed(1) || "—"}</TableCell>
                  <TableCell>
                    {log.overtime_hours > 0 ? (
                      <Badge variant="destructive">{log.overtime_hours.toFixed(1)}h</Badge>
                    ) : "0.0"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
