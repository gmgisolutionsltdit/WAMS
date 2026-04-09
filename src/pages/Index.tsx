import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, LogIn, LogOut, Timer, AlertCircle, Users, CheckSquare, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const Dashboard = () => {
  const { user, role } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayLog, setTodayLog] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const isManagerOrAdmin = role === "manager" || role === "admin";

  // Admin/Manager state
  const [activeLogs, setActiveLogs] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalOTToday: 0, pendingCount: 0, activeEmployees: 0 });
  const [approvalHistory, setApprovalHistory] = useState<any[]>([]);

  // Manual entry state
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ employee_email: "", date: format(new Date(), "yyyy-MM-dd"), clock_in: "09:00", clock_out: "18:00", overtime_hours: "1" });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchEmployeeData = async () => {
    if (!user) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const [{ data: todayData }, { data: recent }] = await Promise.all([
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).eq("date", today).maybeSingle(),
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(10),
    ]);
    setTodayLog(todayData);
    setRecentLogs(recent || []);
  };

  const fetchAdminData = async () => {
    if (!user || !isManagerOrAdmin) return;
    const today = format(new Date(), "yyyy-MM-dd");

    const [{ data: active }, { data: pending }, { data: todayLogs }, { data: history }] = await Promise.all([
      supabase.from("attendance_logs").select("*, profiles!attendance_logs_user_id_fkey(full_name, email)").eq("date", today).is("clock_out", null),
      supabase.from("overtime_requests").select("*, profiles!overtime_requests_user_id_fkey(full_name, email)").eq("status", "pending"),
      supabase.from("attendance_logs").select("overtime_hours").eq("date", today),
      supabase.from("overtime_requests").select("*, profiles!overtime_requests_user_id_fkey(full_name, email)").neq("status", "pending").order("updated_at", { ascending: false }).limit(10),
    ]);

    setActiveLogs(active || []);
    setPendingRequests(pending || []);
    setApprovalHistory(history || []);

    const totalOTToday = (todayLogs || []).reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
    setStats({
      totalOTToday: Math.round(totalOTToday * 10) / 10,
      pendingCount: (pending || []).length,
      activeEmployees: (active || []).length,
    });
  };

  useEffect(() => {
    fetchEmployeeData();
    fetchAdminData();
  }, [user, role]);

  const handleClockIn = async () => {
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("attendance_logs").insert({ user_id: user.id, clock_in: new Date().toISOString(), ip_address: "192.168.1.1 (simulated)" });
    if (error) toast.error(error.message);
    else { toast.success("Clocked in!"); fetchEmployeeData(); fetchAdminData(); }
    setLoading(false);
  };

  const handleClockOut = async () => {
    if (!user || !todayLog) return;
    setLoading(true);
    const now = new Date();
    const clockIn = new Date(todayLog.clock_in);
    const totalHours = Math.round(((now.getTime() - clockIn.getTime()) / 3600000) * 100) / 100;
    const overtimeHours = Math.max(0, Math.round((totalHours - 8) * 100) / 100);
    const { error } = await supabase.from("attendance_logs").update({ clock_out: now.toISOString(), total_hours: totalHours, overtime_hours: overtimeHours }).eq("id", todayLog.id);
    if (error) toast.error(error.message);
    else { toast.success(`Clocked out! Total: ${totalHours}h, OT: ${overtimeHours}h`); fetchEmployeeData(); fetchAdminData(); }
    setLoading(false);
  };

  const handleApproval = async (id: string, status: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase.from("overtime_requests").update({ status, approved_by: user.id }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(`Request ${status}`); fetchAdminData(); }
  };

  const handleManualEntry = async () => {
    if (!user) return;
    // Look up user by email
    const { data: profile } = await supabase.from("profiles").select("id").eq("email", manualForm.employee_email).single();
    if (!profile) { toast.error("Employee not found"); return; }

    const clockInTime = new Date(`${manualForm.date}T${manualForm.clock_in}:00`);
    const clockOutTime = new Date(`${manualForm.date}T${manualForm.clock_out}:00`);
    const totalHours = Math.round(((clockOutTime.getTime() - clockInTime.getTime()) / 3600000) * 100) / 100;

    const { error } = await supabase.from("attendance_logs").insert({
      user_id: profile.id,
      date: manualForm.date,
      clock_in: clockInTime.toISOString(),
      clock_out: clockOutTime.toISOString(),
      total_hours: totalHours,
      overtime_hours: parseFloat(manualForm.overtime_hours) || 0,
    });
    if (error) toast.error(error.message);
    else { toast.success("Manual entry added"); setManualOpen(false); fetchAdminData(); }
  };

  const getRunningDuration = (clockIn: string) => {
    const diff = currentTime.getTime() - new Date(clockIn).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isClockedIn = todayLog && todayLog.clock_in && !todayLog.clock_out;
  const workedHours = isClockedIn
    ? Math.round(((currentTime.getTime() - new Date(todayLog.clock_in).getTime()) / 3600000) * 100) / 100
    : (todayLog?.total_hours || 0);
  const progressPercent = Math.min(100, (workedHours / 8) * 100);

  return (
    <div className="space-y-6">
      {/* Employee Section */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Current Time</CardDescription></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-center">{format(currentTime, "HH:mm:ss")}</div>
            <p className="text-center text-sm text-muted-foreground mt-1">{format(currentTime, "EEEE, MMMM d, yyyy")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardDescription>Today's Status</CardDescription></CardHeader>
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

        <Card>
          <CardHeader className="pb-2"><CardDescription>Daily Progress (8h standard)</CardDescription></CardHeader>
          <CardContent>
            <Progress value={progressPercent} className="h-4" />
            <p className="text-center text-sm mt-2 font-medium">
              {workedHours.toFixed(1)} / 8.0 hours
              {workedHours > 8 && (
                <span className="text-destructive ml-2">
                  <AlertCircle className="inline h-3 w-3 mr-1" />+{(workedHours - 8).toFixed(1)}h OT
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Admin/Manager Section */}
      {isManagerOrAdmin && (
        <>
          {/* Stat Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="pb-2"><CardDescription>Total OT Hours Today</CardDescription></CardHeader>
              <CardContent><div className="flex items-center gap-2"><Timer className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{stats.totalOTToday}h</span></div></CardContent>
            </Card>
            <Card className="border-l-4 border-l-destructive">
              <CardHeader className="pb-2"><CardDescription>Pending Approvals</CardDescription></CardHeader>
              <CardContent><div className="flex items-center gap-2"><CheckSquare className="h-5 w-5 text-destructive" /><span className="text-2xl font-bold">{stats.pendingCount}</span></div></CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="pb-2"><CardDescription>Active Employees (Clocked In)</CardDescription></CardHeader>
              <CardContent><div className="flex items-center gap-2"><Users className="h-5 w-5 text-green-500" /><span className="text-2xl font-bold">{stats.activeEmployees}</span></div></CardContent>
            </Card>
          </div>

          {/* Real-time Tracker */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Live Employee Tracker</CardTitle>
              <Dialog open={manualOpen} onOpenChange={setManualOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Manual Entry</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Manual Attendance/OT Log</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Employee Email</Label><Input value={manualForm.employee_email} onChange={(e) => setManualForm(f => ({ ...f, employee_email: e.target.value }))} placeholder="employee@company.com" /></div>
                    <div><Label>Date</Label><Input type="date" value={manualForm.date} onChange={(e) => setManualForm(f => ({ ...f, date: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Clock In</Label><Input type="time" value={manualForm.clock_in} onChange={(e) => setManualForm(f => ({ ...f, clock_in: e.target.value }))} /></div>
                      <div><Label>Clock Out</Label><Input type="time" value={manualForm.clock_out} onChange={(e) => setManualForm(f => ({ ...f, clock_out: e.target.value }))} /></div>
                    </div>
                    <div><Label>Overtime Hours</Label><Input type="number" step="0.5" value={manualForm.overtime_hours} onChange={(e) => setManualForm(f => ({ ...f, overtime_hours: e.target.value }))} /></div>
                    <Button onClick={handleManualEntry} className="w-full">Add Entry</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Clock-in Time</TableHead>
                    <TableHead>Current Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No employees currently clocked in</TableCell></TableRow>
                  ) : activeLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{(log.profiles as any)?.full_name || (log.profiles as any)?.email || "Unknown"}</TableCell>
                      <TableCell>{format(new Date(log.clock_in), "HH:mm:ss")}</TableCell>
                      <TableCell><Badge variant="outline" className="font-mono"><Timer className="mr-1 h-3 w-3" />{getRunningDuration(log.clock_in)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pending Approvals */}
          <Card>
            <CardHeader><CardTitle>Pending OT Approvals</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingRequests.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No pending requests</TableCell></TableRow>
                  ) : pendingRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{(req.profiles as any)?.full_name || (req.profiles as any)?.email || "Unknown"}</TableCell>
                      <TableCell>{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                      <TableCell><Badge>{req.requested_hours}h</Badge></TableCell>
                      <TableCell className="max-w-48 truncate">{req.reason}</TableCell>
                      <TableCell className="space-x-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproval(req.id, "approved")}><Check className="h-4 w-4 mr-1" /> Approve</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleApproval(req.id, "rejected")}><X className="h-4 w-4 mr-1" /> Reject</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Approval History */}
          <Card>
            <CardHeader><CardTitle>Approval History</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvalHistory.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No history yet</TableCell></TableRow>
                  ) : approvalHistory.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>{(req.profiles as any)?.full_name || (req.profiles as any)?.email || "Unknown"}</TableCell>
                      <TableCell>{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                      <TableCell>{req.requested_hours}h</TableCell>
                      <TableCell>
                        <Badge variant={req.status === "approved" ? "default" : "destructive"}>
                          {req.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Employee Recent Attendance */}
      <Card>
        <CardHeader><CardTitle>My Recent Attendance</CardTitle></CardHeader>
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
