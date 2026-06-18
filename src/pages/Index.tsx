import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, LogIn, LogOut, Timer, AlertCircle, Users, CheckSquare, Plus, Check, X, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import DailyWorkLogDialog from "@/components/DailyWorkLogDialog";
import DailyWorkSummary from "@/components/DailyWorkSummary";
import WorkCalendar from "@/components/WorkCalendar";
import { min48hDateISO, isWithin48h, RETRO_LOCK_MESSAGE } from "@/lib/dateRules";

/** Return today's date string in the user's local timezone (yyyy-MM-dd). */
const localToday = () => format(new Date(), "yyyy-MM-dd");

const Dashboard = () => {
  const { user, role } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayLog, setTodayLog] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [approvedOT, setApprovedOT] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const isManagerOrAdmin = role === "manager" || role === "admin";

  const [activeLogs, setActiveLogs] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalOTToday: 0, pendingCount: 0, activeEmployees: 0 });
  const [approvalHistory, setApprovalHistory] = useState<any[]>([]);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ employee_email: "", date: localToday(), clock_in: "09:00", clock_out: "18:00", overtime_hours: "1" });
  const [workLogOpen, setWorkLogOpen] = useState(false);
  const [pendingClockOut, setPendingClockOut] = useState<{ clockOutTime: string; logId: string; totalHours: number; overtimeHours: number; breakMins: number } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchEmployeeData = useCallback(async () => {
    if (!user) return;
    const today = localToday();
    const [{ data: todayData }, { data: recent }, { data: otData }] = await Promise.all([
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).eq("date", today).is("clock_out", null).maybeSingle(),
      supabase.from("attendance_logs").select("*").eq("user_id", user.id).order("date", { ascending: false }).limit(10),
      supabase.from("overtime_requests").select("*").eq("user_id", user.id).in("status", ["approved", "modified"]).order("date", { ascending: false }).limit(20),
    ]);
    if (!todayData) {
      const { data: completedToday } = await supabase.from("attendance_logs").select("*").eq("user_id", user.id).eq("date", today).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setTodayLog(completedToday);
    } else {
      setTodayLog(todayData);
    }
    setRecentLogs(recent || []);
    setApprovedOT(otData || []);
  }, [user]);

  const fetchAdminData = useCallback(async () => {
    if (!user || !isManagerOrAdmin) return;
    const today = localToday();

    const [{ data: active }, { data: pending }, { data: todayLogs }, { data: history }, { data: approvedOTToday }] = await Promise.all([
      supabase.from("attendance_logs").select("*, profiles!attendance_logs_user_id_fkey(full_name, email)").eq("date", today).is("clock_out", null),
      supabase.from("overtime_requests").select("*, profiles!overtime_requests_user_id_fkey(full_name, email)").eq("status", "pending"),
      supabase.from("attendance_logs").select("overtime_hours").eq("date", today),
      supabase.from("overtime_requests").select("*, profiles!overtime_requests_user_id_fkey(full_name, email)").neq("status", "pending").order("updated_at", { ascending: false }).limit(10),
      supabase.from("overtime_requests").select("requested_hours").eq("date", today).in("status", ["approved", "modified"]),
    ]);

    setActiveLogs(active || []);
    setPendingRequests(pending || []);
    setApprovalHistory(history || []);

    const clockOT = (todayLogs || []).reduce((sum: number, l: any) => sum + (l.overtime_hours || 0), 0);
    const requestOT = (approvedOTToday || []).reduce((sum: number, l: any) => sum + (l.requested_hours || 0), 0);
    const totalOTToday = clockOT + requestOT;
    setStats({
      totalOTToday: Math.round(totalOTToday * 10) / 10,
      pendingCount: (pending || []).length,
      activeEmployees: (active || []).length,
    });
  }, [user, isManagerOrAdmin]);

  useEffect(() => {
    fetchEmployeeData();
    fetchAdminData();
  }, [fetchEmployeeData, fetchAdminData]);

  useRealtimeSubscription("overtime_requests", () => { fetchEmployeeData(); fetchAdminData(); }, "dashboard-ot");
  useRealtimeSubscription("attendance_logs", () => { fetchEmployeeData(); fetchAdminData(); }, "dashboard-attendance");

  const handleClockIn = async () => {
    if (!user) return;
    setLoading(true);
    const now = new Date();
    const { error } = await supabase.from("attendance_logs").insert({
      user_id: user.id,
      date: localToday(),
      clock_in: now.toISOString(),
      ip_address: "192.168.1.1 (simulated)",
    });
    if (error) toast.error(error.message);
    else { toast.success("Clocked in!"); fetchEmployeeData(); fetchAdminData(); }
    setLoading(false);
  };

  /** Step 1: capture end-of-day time and prompt for the optional Daily Work Log. */
  const handleClockOut = () => {
    if (!user || !todayLog) return;
    const now = new Date();
    const clockIn = new Date(todayLog.clock_in);
    const totalMinutes = (now.getTime() - clockIn.getTime()) / 60000;
    const breakMins = todayLog.break_minutes || 0;
    const netMinutes = totalMinutes - breakMins;
    const totalHours = Math.round((netMinutes / 60) * 100) / 100;
    const overtimeHours = Math.max(0, Math.round((totalHours - 8) * 100) / 100);
    setPendingClockOut({
      clockOutTime: now.toISOString(),
      logId: todayLog.id,
      totalHours,
      overtimeHours,
      breakMins,
    });
    setWorkLogOpen(true);
  };

  /** Step 2: finalize the clock-out after the work log modal is submitted (or skipped blank). */
  const finalizeClockOut = async () => {
    if (!pendingClockOut) return;
    setLoading(true);
    const { clockOutTime, logId, totalHours, overtimeHours, breakMins } = pendingClockOut;
    const { error } = await supabase.from("attendance_logs").update({
      clock_out: clockOutTime,
      total_hours: totalHours,
      overtime_hours: overtimeHours,
      break_start: null,
      break_end: null,
    }).eq("id", logId);
    if (error) toast.error(error.message);
    else { toast.success(`Clocked out! Total: ${totalHours}h (breaks: ${breakMins}m), OT: ${overtimeHours}h`); fetchEmployeeData(); fetchAdminData(); }
    setPendingClockOut(null);
    setLoading(false);
  };


  const handleBreakStart = async () => {
    if (!user || !todayLog) return;
    setLoading(true);
    const { error } = await supabase.from("attendance_logs").update({
      break_start: new Date().toISOString(),
      break_end: null,
    }).eq("id", todayLog.id);
    if (error) toast.error(error.message);
    else { toast.success("Break started"); fetchEmployeeData(); }
    setLoading(false);
  };

  const handleBreakEnd = async () => {
    if (!user || !todayLog || !todayLog.break_start) return;
    setLoading(true);
    const now = new Date();
    const breakStart = new Date(todayLog.break_start);
    const breakDuration = Math.round((now.getTime() - breakStart.getTime()) / 60000);
    const totalBreak = (todayLog.break_minutes || 0) + breakDuration;
    const { error } = await supabase.from("attendance_logs").update({
      break_end: now.toISOString(),
      break_start: null,
      break_minutes: totalBreak,
    }).eq("id", todayLog.id);
    if (error) toast.error(error.message);
    else { toast.success(`Break ended (${breakDuration} min)`); fetchEmployeeData(); }
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
    if (role === "employee" && !isWithin48h(manualForm.date)) {
      toast.error("Employees cannot manually enter logs older than 48 hours.");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("id").eq("email", manualForm.employee_email).single();
    if (!profile) { toast.error("Employee not found"); return; }
    const clockInTime = new Date(`${manualForm.date}T${manualForm.clock_in}:00`);
    const clockOutTime = new Date(`${manualForm.date}T${manualForm.clock_out}:00`);
    const totalHours = Math.round(((clockOutTime.getTime() - clockInTime.getTime()) / 3600000) * 100) / 100;
    const { error } = await supabase.from("attendance_logs").insert({
      user_id: profile.id, date: manualForm.date, clock_in: clockInTime.toISOString(), clock_out: clockOutTime.toISOString(),
      total_hours: totalHours, overtime_hours: parseFloat(manualForm.overtime_hours) || 0,
    });
    if (error) toast.error(error.message);
    else { toast.success("Manual entry added"); setManualOpen(false); fetchAdminData(); }
  };

  const getRunningDuration = (clockIn: string, breakMins: number = 0, breakStartStr?: string | null) => {
    let elapsed = currentTime.getTime() - new Date(clockIn).getTime();
    elapsed -= breakMins * 60000;
    if (breakStartStr) {
      elapsed -= (currentTime.getTime() - new Date(breakStartStr).getTime());
    }
    if (elapsed < 0) elapsed = 0;
    const h = Math.floor(elapsed / 3600000);
    const m = Math.floor((elapsed % 3600000) / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isClockedIn = todayLog && todayLog.clock_in && !todayLog.clock_out;
  const isOnBreak = isClockedIn && todayLog.break_start && !todayLog.break_end;

  const getWorkedHours = () => {
    if (!isClockedIn) return todayLog?.total_hours || 0;
    let elapsed = currentTime.getTime() - new Date(todayLog.clock_in).getTime();
    elapsed -= (todayLog.break_minutes || 0) * 60000;
    if (isOnBreak) {
      elapsed -= (currentTime.getTime() - new Date(todayLog.break_start).getTime());
    }
    return Math.max(0, Math.round((elapsed / 3600000) * 100) / 100);
  };

  const workedHours = getWorkedHours();
  const progressPercent = Math.min(100, (workedHours / 8) * 100);

  /** Color helper for OT status badges */
  const otStatusStyle = (status: string) => {
    if (status === "approved") return "bg-lime-500 text-white hover:bg-lime-600 border-lime-500";
    if (status === "rejected") return "bg-[#FF6347] text-white hover:bg-[#E5533D] border-[#FF6347]";
    // modified = approved with edited hours — we treat "modified" as a separate display concept
    return ""; // pending uses default badge
  };

  return (
    <div className="space-y-6">
      {/* Hero greeting */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-hero p-6 md:p-8 shadow-glow">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-brand-foreground">
          <div>
            <p className="text-sm/6 opacity-80">{format(currentTime, "EEEE, MMMM d, yyyy")}</p>
            <h1 className="text-2xl md:text-3xl font-semibold mt-1">
              {(() => {
                const h = currentTime.getHours();
                const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
                const name = (user?.user_metadata as any)?.full_name || user?.email?.split("@")[0] || "there";
                return `${greet}, ${name} 👋`;
              })()}
            </h1>
            <p className="text-sm/6 opacity-90 mt-1 capitalize">{role} dashboard · live updates enabled</p>
          </div>
          <div className="text-right">
            <div className="text-4xl md:text-5xl font-bold font-mono tracking-tight">{format(currentTime, "HH:mm:ss")}</div>
            <p className="text-xs opacity-80 mt-1">Local time</p>
          </div>
        </div>
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 -bottom-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      </div>

      {/* Employee Section */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-card border-l-4 border-l-info">
          <CardHeader className="pb-2"><CardDescription>Today's Status</CardDescription></CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {isClockedIn ? (
              <>
                {isOnBreak ? (
                  <Badge variant="secondary" className="text-sm"><Pause className="mr-1 h-3 w-3" /> On Break</Badge>
                ) : (
                  <Badge className="bg-success text-success-foreground hover:bg-success/90 text-sm"><Timer className="mr-1 h-3 w-3" /> Working</Badge>
                )}
                <div className="text-3xl font-mono font-bold">
                  {getRunningDuration(todayLog.clock_in, todayLog.break_minutes || 0, isOnBreak ? todayLog.break_start : null)}
                </div>
                {(todayLog.break_minutes || 0) > 0 && (
                  <p className="text-xs text-muted-foreground">Total breaks: {todayLog.break_minutes}m</p>
                )}
                <div className="flex gap-2 w-full">
                  {isOnBreak ? (
                    <Button size="sm" variant="outline" onClick={handleBreakEnd} disabled={loading} className="flex-1">
                      <Play className="mr-1 h-4 w-4" /> Resume
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleBreakStart} disabled={loading} className="flex-1">
                      <Pause className="mr-1 h-4 w-4" /> Break
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={handleClockOut} disabled={loading || isOnBreak} className="flex-1">
                    <LogOut className="mr-1 h-4 w-4" /> Clock Out
                  </Button>
                </div>
              </>
            ) : todayLog?.clock_out ? (
              <Badge className="bg-success text-success-foreground hover:bg-success/90 text-sm">Day Complete ✓</Badge>
            ) : (
              <Button size="lg" onClick={handleClockIn} disabled={loading} className="w-full bg-gradient-hero hover:opacity-90">
                <LogIn className="mr-2 h-5 w-5" /> Clock In
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card border-l-4 border-l-brand">
          <CardHeader className="pb-2"><CardDescription>Daily Progress (8h standard)</CardDescription></CardHeader>
          <CardContent>
            <Progress value={progressPercent} className="h-4" />
            <p className="text-center text-sm mt-3 font-medium">
              <span className="text-2xl font-bold tabular-nums">{workedHours.toFixed(1)}</span>
              <span className="text-muted-foreground"> / 8.0 hours</span>
            </p>
            {workedHours > 8 && (
              <p className="text-center text-xs text-warning mt-1">
                <AlertCircle className="inline h-3 w-3 mr-1" />+{(workedHours - 8).toFixed(1)}h overtime
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card border-l-4 border-l-success">
          <CardHeader className="pb-2"><CardDescription>Recent Sessions</CardDescription></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{recentLogs.length}</div>
            <p className="text-xs text-muted-foreground mt-1">days logged in last 10</p>
            <div className="mt-3 flex items-end gap-1 h-10">
              {recentLogs.slice(0, 10).reverse().map((l, i) => {
                const h = Number(l.total_hours || 0);
                const pct = Math.min(100, (h / 10) * 100);
                return <div key={i} title={`${l.date}: ${h}h`} className="flex-1 rounded-sm bg-gradient-hero opacity-80 hover:opacity-100 transition" style={{ height: `${pct}%` }} />;
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin/Manager Section */}
      {isManagerOrAdmin && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="shadow-card overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-info opacity-10" />
              <CardHeader className="pb-2 relative"><CardDescription>Total OT Hours Today</CardDescription></CardHeader>
              <CardContent className="relative">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gradient-info p-2.5 shadow-soft"><Timer className="h-5 w-5 text-info-foreground" /></div>
                  <span className="text-3xl font-bold tabular-nums">{stats.totalOTToday}h</span>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-warning opacity-10" />
              <CardHeader className="pb-2 relative"><CardDescription>Pending Approvals</CardDescription></CardHeader>
              <CardContent className="relative">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gradient-warning p-2.5 shadow-soft"><CheckSquare className="h-5 w-5 text-warning-foreground" /></div>
                  <span className="text-3xl font-bold tabular-nums">{stats.pendingCount}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-success opacity-10" />
              <CardHeader className="pb-2 relative"><CardDescription>Active Employees</CardDescription></CardHeader>
              <CardContent className="relative">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-gradient-success p-2.5 shadow-soft"><Users className="h-5 w-5 text-success-foreground" /></div>
                  <span className="text-3xl font-bold tabular-nums">{stats.activeEmployees}</span>
                </div>
              </CardContent>
            </Card>
          </div>


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
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={manualForm.date}
                        min={(role as string) !== "admin" ? min48hDateISO() : undefined}
                        onChange={(e) => setManualForm(f => ({ ...f, date: e.target.value }))}
                      />
                      {(role as string) !== "admin" && !isWithin48h(manualForm.date) && (
                        <p className="text-xs text-destructive mt-1">Employees cannot manually enter logs older than 48 hours.</p>
                      )}
                      {(role as string) !== "admin" && (
                        <p className="text-xs text-muted-foreground mt-1">{RETRO_LOCK_MESSAGE}</p>
                      )}
                    </div>
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
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeLogs.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No employees currently clocked in</TableCell></TableRow>
                  ) : activeLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{(log.profiles as any)?.full_name || (log.profiles as any)?.email || "Unknown"}</TableCell>
                      <TableCell>{format(new Date(log.clock_in), "HH:mm:ss")}</TableCell>
                      <TableCell><Badge variant="outline" className="font-mono"><Timer className="mr-1 h-3 w-3" />{getRunningDuration(log.clock_in, log.break_minutes || 0, log.break_start)}</Badge></TableCell>
                      <TableCell>
                        {log.break_start && !log.break_end ? (
                          <Badge variant="secondary"><Pause className="mr-1 h-3 w-3" />On Break</Badge>
                        ) : (
                          <Badge variant="default">Working</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
                        <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => handleApproval(req.id, "approved")}><Check className="h-4 w-4 mr-1" /> Approve</Button>
                        <Button size="sm" className="bg-[#FF6347] hover:bg-[#E5533D] text-white" onClick={() => handleApproval(req.id, "rejected")}><X className="h-4 w-4 mr-1" /> Reject</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

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
                        <Badge className={otStatusStyle(req.status)}>
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

      {/* Daily Work Summary — grouped by date with task forwarding */}
      <DailyWorkSummary />

      {/* Daily Work Log modal — opens on Clock Out, finalizes the session on submit */}
      <DailyWorkLogDialog
        open={workLogOpen}
        onOpenChange={(v) => {
          setWorkLogOpen(v);
          // If the user dismisses without submitting (e.g., ESC/overlay click) while a clock-out is pending,
          // we still finalize so the session isn't left hanging.
          if (!v && pendingClockOut) {
            finalizeClockOut();
          }
        }}
        onSubmitted={finalizeClockOut}
        hideTrigger
        submitLabel="Submit & Finish Clock-out"
        title="Daily Work Log"
        description="Optionally log what you worked on today, then finish your clock-out. You can submit this blank."
      />
    </div>
  );
};

export default Dashboard;
