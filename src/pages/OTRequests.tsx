import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { notifyManagersAndAdmins, notifyEmployee } from "@/lib/notifications";
import { applyOTFulfillment } from "@/lib/otFulfillment";
import DailyWorkLogDialog from "@/components/DailyWorkLogDialog";
import TimeWithMeridiem from "@/components/TimeWithMeridiem";
import LateTimeRequestDialog from "@/components/LateTimeRequestDialog";
import { min48hDateISO, max2DaysAheadISO, isWithin48h, canBypass48h, RETRO_LOCK_MESSAGE } from "@/lib/dateRules";
import { computeWorkingDays } from "@/lib/leaveDays";

/** Color helper for request status badges */
const otStatusStyle = (status: string) => {
  if (status === "approved") return "bg-lime-500 text-white hover:bg-lime-600 border-lime-500";
  if (status === "rejected") return "bg-[#FF6347] text-white hover:bg-[#E5533D] border-[#FF6347]";
  if (status === "modified") return "bg-[#FFD700] text-black hover:bg-[#E6C200] border-[#FFD700]";
  return ""; // pending uses default
};

type LeaveType = { id: string; name: string; color: string };

const OTRequests = () => {
  const { user, role } = useAuth();
  const isManagerOrAdmin = role === "manager" || role === "admin";

  const [requests, setRequests] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [useCurrentTime, setUseCurrentTime] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const [officeTimes, setOfficeTimes] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });

  // Leave application
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [myLeaveRequests, setMyLeaveRequests] = useState<any[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  const [weekendDays, setWeekendDays] = useState<number[]>([5, 6]);
  const [leaveForm, setLeaveForm] = useState({
    leave_type_id: "", start_date: "", end_date: "",
    day_type: "full" as "full" | "first_half" | "second_half", reason: "",
  });
  const [leaveSaving, setLeaveSaving] = useState(false);

  // Own late/office-time-change requests, for the combined log
  const [myLateRequests, setMyLateRequests] = useState<any[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editReq, setEditReq] = useState<any>(null);
  const [editHours, setEditHours] = useState("");

  const calculatedHours = useMemo(() => {
    if (useCurrentTime) {
      const h = parseFloat(manualHours);
      return h > 0 ? Math.round(h * 100) / 100 : "";
    }
    if (!startTime || !endTime) return "";
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    const diff = (endMin - startMin) / 60;
    return Math.round(diff * 100) / 100;
  }, [useCurrentTime, manualHours, startTime, endTime]);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("overtime_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setRequests(data || []);
    const { data: pf } = await supabase.from("profiles").select("id, full_name, email");
    const map: Record<string, string> = {};
    (pf || []).forEach((p: any) => { map[p.id] = p.full_name || p.email || "—"; });
    setProfilesMap(map);
  }, [user]);

  const fetchPendingRequests = useCallback(async () => {
    if (!user || !isManagerOrAdmin) return;
    const { data } = await supabase
      .from("overtime_requests")
      .select("*, profiles!overtime_requests_user_id_fkey(full_name, email)")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setPendingRequests(data || []);
  }, [user, isManagerOrAdmin]);

  const fetchLeaveData = useCallback(async () => {
    if (!user) return;
    const [{ data: types }, { data: myLeave }, { data: hols }, { data: cfg }] = await Promise.all([
      supabase.from("leave_types").select("id, name, color").eq("active", true).order("name"),
      supabase.from("leave_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("holidays").select("holiday_date"),
      supabase.from("settings").select("weekend_days").limit(1).maybeSingle(),
    ]);
    setLeaveTypes((types || []) as LeaveType[]);
    setMyLeaveRequests(myLeave || []);
    setHolidaySet(new Set((hols || []).map((h: { holiday_date: string }) => h.holiday_date)));
    if (cfg?.weekend_days) setWeekendDays(cfg.weekend_days as number[]);
  }, [user]);

  const fetchLateRequests = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("late_time_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setMyLateRequests(data || []);
  }, [user]);

  useEffect(() => {
    fetchRequests();
    fetchPendingRequests();
    fetchLeaveData();
    fetchLateRequests();
  }, [fetchRequests, fetchPendingRequests, fetchLeaveData, fetchLateRequests]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("office_start_time, office_end_time").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setOfficeTimes({ start: data.office_start_time, end: data.office_end_time });
      });
  }, [user]);

  useRealtimeSubscription("overtime_requests", () => {
    fetchRequests();
    fetchPendingRequests();
  }, "ot-requests-page");
  useRealtimeSubscription("leave_requests", fetchLeaveData, "requests-page-leave");
  useRealtimeSubscription("late_time_requests", fetchLateRequests, "requests-page-late");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!calculatedHours || calculatedHours <= 0) {
      toast.error(useCurrentTime ? "Please enter valid hours" : "Please enter valid start and end times");
      return;
    }
    if (!canBypass48h(role) && !isWithin48h(date)) { toast.error(RETRO_LOCK_MESSAGE); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("overtime_requests")
      .insert({ user_id: user.id, date, requested_hours: calculatedHours, original_hours: calculatedHours, reason })
      .select()
      .single();
    if (error) toast.error(error.message);
    else {
      toast.success("OT request submitted!");
      await notifyManagersAndAdmins(
        "New OT Request",
        `${user.email} requested ${calculatedHours}h overtime for ${date}`,
        data?.id,
        { route: "/approvals", type: "ot_request", requesterId: user.id }
      );
      setStartTime("");
      setEndTime("");
      setManualHours("");
      setReason("");
      fetchRequests();
    }
    setLoading(false);
  };

  const handleApproval = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;

    let finalHours = req.requested_hours;
    if (status === "approved") {
      finalHours = await applyOTFulfillment(req.user_id, req.date, req.requested_hours);
    }

    const { error } = await supabase
      .from("overtime_requests")
      .update({ status, approved_by: user.id, requested_hours: finalHours })
      .eq("id", req.id);
    if (error) toast.error(error.message);
    else {
      const detail = status === "approved" && finalHours < req.requested_hours
        ? ` (adjusted from ${req.requested_hours}h to ${finalHours}h after standard hours fulfillment)`
        : "";
      toast.success(`Request ${status}${detail}`);
      await notifyEmployee(
        req.user_id,
        `OT Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your ${finalHours}h OT request for ${format(new Date(req.date), "MMM d")} was ${status}.${detail}`,
        req.id,
        { route: "/ot-requests", type: "ot_update" }
      );
      fetchPendingRequests();
    }
  };

  const handleEdit = async () => {
    if (!editReq || !user) return;
    const newHours = parseFloat(editHours);
    if (isNaN(newHours) || newHours <= 0) { toast.error("Invalid hours"); return; }

    // Intelligent OT fulfillment: check worked hours vs standard
    const adjustedHours = await applyOTFulfillment(editReq.user_id, editReq.date, newHours);

    const { error } = await supabase
      .from("overtime_requests")
      .update({
        requested_hours: adjustedHours,
        original_hours: editReq.original_hours ?? editReq.requested_hours,
        status: "modified" as any,
        approved_by: user.id,
        modified_by: user.id,
        modified_at: new Date().toISOString(),
      })
      .eq("id", editReq.id);
    if (error) toast.error(error.message);
    else {
      const msg = adjustedHours < newHours
        ? `Modified to ${newHours}h, adjusted to ${adjustedHours}h after fulfillment rule`
        : `Hours modified to ${adjustedHours}h & approved`;
      toast.success(msg);
      await notifyEmployee(
        editReq.user_id,
        "OT Hours Modified",
        `Your OT request was modified to ${adjustedHours}h (adjusted for standard hours fulfillment).`,
        editReq.id,
        { route: "/ot-requests", type: "ot_update" }
      );
      setEditOpen(false);
      fetchPendingRequests();
      fetchRequests();
    }
  };

  const openEdit = (req: any) => {
    setEditReq(req);
    setEditHours(String(req.requested_hours));
    setEditOpen(true);
  };

  /** Determine display status — if hours were modified from original, show "modified" */
  const getDisplayStatus = (req: any) => req.status;

  const leavePreviewLt = leaveTypes.find((t) => t.id === leaveForm.leave_type_id);
  const leavePreviewDays = leaveForm.start_date && leaveForm.end_date
    ? computeWorkingDays(leaveForm.start_date, leaveForm.end_date, leaveForm.day_type, weekendDays, holidaySet)
    : 0;

  const submitLeave = async () => {
    if (!user) return;
    if (!leaveForm.leave_type_id || !leaveForm.start_date || !leaveForm.end_date) { toast.error("Fill all fields"); return; }
    if (!canBypass48h(role) && !isWithin48h(leaveForm.start_date)) { toast.error(RETRO_LOCK_MESSAGE); return; }
    if (leavePreviewDays <= 0) { toast.error("No working days in the selected range"); return; }
    setLeaveSaving(true);
    const { data, error } = await supabase.from("leave_requests").insert({
      user_id: user.id,
      leave_type_id: leaveForm.leave_type_id,
      start_date: leaveForm.start_date,
      end_date: leaveForm.end_date,
      day_type: leaveForm.day_type,
      total_days: leavePreviewDays,
      reason: leaveForm.reason.trim() || null,
    }).select().single();
    if (error) toast.error(error.message);
    else {
      toast.success("Leave request submitted for approval");
      await notifyManagersAndAdmins(
        "Leave Request",
        `${user.email} applied for leave (${leaveForm.start_date} → ${leaveForm.end_date}).`,
        data?.id,
        { route: "/approvals", type: "leave_request", requesterId: user.id },
      );
      setLeaveForm({ leave_type_id: "", start_date: "", end_date: "", day_type: "full", reason: "" });
      fetchLeaveData();
    }
    setLeaveSaving(false);
  };

  const leaveTypeName = (id: string) => leaveTypes.find((t) => t.id === id)?.name || "Leave";

  /** Combined log of every request type this employee has submitted. */
  const combinedLog = useMemo(() => {
    const otRows = requests.map((r) => ({
      id: `ot-${r.id}`, type: "Overtime",
      date: format(new Date(r.date), "MMM d, yyyy"),
      details: `${r.requested_hours}h`,
      status: r.status, created_at: r.created_at,
    }));
    const leaveRows = myLeaveRequests.map((r) => ({
      id: `leave-${r.id}`, type: "Leave",
      date: `${format(new Date(r.start_date), "MMM d")} – ${format(new Date(r.end_date), "MMM d, yyyy")}`,
      details: `${leaveTypeName(r.leave_type_id)} · ${r.total_days}d`,
      status: r.status, created_at: r.created_at,
    }));
    const lateRows = myLateRequests.map((r) => ({
      id: `late-${r.id}`, type: "Office Time Change",
      date: format(new Date(r.effective_date), "MMM d, yyyy"),
      details: `${String(r.requested_start_time).slice(0, 5)} – ${String(r.requested_end_time).slice(0, 5)}`,
      status: r.status, created_at: r.created_at,
    }));
    return [...otRows, ...leaveRows, ...lateRows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [requests, myLeaveRequests, myLateRequests, leaveTypes]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <DailyWorkLogDialog />
      </div>

      {/* Employee Submit Form */}
      <Card>
        <CardHeader><CardTitle>Submit Overtime Request</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  min={canBypass48h(role) ? undefined : min48hDateISO()}
                  max={max2DaysAheadISO()}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                {!canBypass48h(role) && (
                  <p className="text-xs text-muted-foreground">Limited to the last 48 hours, up to 2 days ahead.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Calculated Hours</Label>
                <Input
                  readOnly
                  value={calculatedHours ? `${calculatedHours} hours` : "—"}
                  className="bg-muted"
                  placeholder="Auto-calculated from start & end time"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useCurrentTime}
                onChange={(e) => setUseCurrentTime(e.target.checked)}
                className="h-4 w-4"
              />
              Send with current time only (skip start/end time, enter hours directly)
            </label>
            {useCurrentTime ? (
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number" step="0.5" min="0.5"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="e.g. 2"
                  required
                />
                <p className="text-xs text-muted-foreground">Request timestamped at the current time — no start/end time required.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <TimeWithMeridiem label="Start Time" value={startTime} onChange={setStartTime} required />
                <TimeWithMeridiem label="End Time" value={endTime} onChange={setEndTime} required />
              </div>
            )}
            {!useCurrentTime && startTime && endTime && calculatedHours && (
              <p className="text-sm text-muted-foreground">
                {startTime} → {endTime}
                {(() => {
                  const [sh] = startTime.split(":").map(Number);
                  const [eh] = endTime.split(":").map(Number);
                  return eh <= sh ? " (next day)" : "";
                })()}
                {" = "}{calculatedHours} hours
              </p>
            )}
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea placeholder="Describe the reason for overtime work..." value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} />
            </div>
            <Button type="submit" disabled={loading || !calculatedHours}>{loading ? "Submitting..." : "Submit Request"}</Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Approved Office Time — inline, always visible */}
      <LateTimeRequestDialog officeStartTime={officeTimes.start} officeEndTime={officeTimes.end} onSubmitted={fetchLateRequests} />

      {/* Apply for Leave */}
      <Card>
        <CardHeader>
          <CardTitle>Apply for Leave</CardTitle>
          <CardDescription>Weekends and holidays are excluded by default.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Leave Type</Label>
            <Select value={leaveForm.leave_type_id} onValueChange={(v) => setLeaveForm((f) => ({ ...f, leave_type_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: t.color }} />
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={leaveForm.start_date}
                min={canBypass48h(role) ? undefined : min48hDateISO()}
                onChange={(e) => setLeaveForm((f) => ({
                  ...f,
                  start_date: e.target.value,
                  end_date: f.end_date && f.end_date < e.target.value ? e.target.value : f.end_date,
                }))}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={leaveForm.end_date}
                min={leaveForm.start_date || (canBypass48h(role) ? undefined : min48hDateISO())}
                onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Day Type</Label>
            <Select value={leaveForm.day_type} onValueChange={(v: any) => setLeaveForm((f) => ({ ...f, day_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Day</SelectItem>
                <SelectItem value="first_half">First Half</SelectItem>
                <SelectItem value="second_half">Second Half</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} rows={2} />
          </div>
          <p className="text-sm text-muted-foreground">
            Chargeable days: <strong>{leavePreviewDays}</strong>
            {leavePreviewLt && <span className="ml-1">({leavePreviewLt.name})</span>}
          </p>
          <Button onClick={submitLeave} disabled={leaveSaving} className="w-full">
            {leaveSaving ? "Submitting…" : "Submit Leave Request"}
          </Button>
        </CardContent>
      </Card>

      {/* Manager/Admin Pending Requests */}
      {isManagerOrAdmin && (
        <Card>
          <CardHeader><CardTitle>Pending OT Requests</CardTitle></CardHeader>
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
                    <TableCell className="space-x-1">
                      <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => handleApproval(req, "approved")}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" className="bg-[#FF6347] hover:bg-[#E5533D] text-white" onClick={() => handleApproval(req, "rejected")}>
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(req)}>
                        <Pencil className="h-4 w-4 mr-1" /> Modify
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* My OT Requests */}
      <Card>
        <CardHeader><CardTitle>My OT Requests</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No requests</TableCell></TableRow>
              ) : requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell>{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                  <TableCell>
                    {req.requested_hours}h
                    {req.original_hours != null && Number(req.original_hours) !== Number(req.requested_hours) && (
                      <span className="ml-1 text-xs text-muted-foreground line-through">{req.original_hours}h</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{req.reason}</TableCell>
                  <TableCell>
                    <Badge className={otStatusStyle(getDisplayStatus(req))}>
                      {getDisplayStatus(req)}
                    </Badge>
                    {req.modified_by && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Modified by {profilesMap[req.modified_by] || "Manager"}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(req.created_at), "MMM d")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Unified request log */}
      <Card>
        <CardHeader>
          <CardTitle>My Requests Log</CardTitle>
          <CardDescription>Every overtime, leave, and office-time-change request you've submitted, in one place.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {combinedLog.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No requests yet</TableCell></TableRow>
              ) : combinedLog.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><Badge variant="outline">{row.type}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{row.date}</TableCell>
                  <TableCell className="text-xs">{row.details}</TableCell>
                  <TableCell><Badge className={otStatusStyle(row.status)}>{row.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(row.created_at), "MMM d")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Hours Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modify OT Hours</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <p className="text-sm text-muted-foreground">{(editReq?.profiles as any)?.full_name || "Unknown"}</p>
            </div>
            <div>
              <Label>Original Hours</Label>
              <p className="text-sm">{editReq?.requested_hours}h</p>
            </div>
            <div>
              <Label>New Hours</Label>
              <Input type="number" step="0.5" min="0.5" value={editHours} onChange={(e) => setEditHours(e.target.value)} />
            </div>
            <Button onClick={handleEdit} className="w-full bg-[#FFD700] hover:bg-[#E6C200] text-black">Save & Approve (Modified)</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OTRequests;
