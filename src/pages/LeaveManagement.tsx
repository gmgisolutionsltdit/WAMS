import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { CalendarHeart, Plus, CheckCircle2, XCircle, Clock, Users, Pencil } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { format } from "date-fns";
import { notifyManagersAndAdmins, notifyEmployee } from "@/lib/notifications";

type LeaveType = {
  id: string; name: string; code: string; color: string; annual_quota: number;
  half_day_allowed: boolean; is_paid: boolean; active: boolean; sandwich_leave?: boolean;
};

type LeaveRequest = {
  id: string; user_id: string; leave_type_id: string; start_date: string; end_date: string;
  day_type: "full" | "first_half" | "second_half"; total_days: number;
  reason: string | null; status: "pending" | "approved" | "rejected" | "cancelled" | "modified";
  approver_id: string | null; approver_note: string | null; created_at: string;
  modified_by: string | null; modified_at: string | null;
  original_start_date: string | null; original_end_date: string | null;
  original_leave_type_id: string | null; original_day_type: string | null; original_total_days: number | null;
};

type Balance = { id: string; user_id: string; leave_type_id: string; year: number; allocated: number; used: number; carried_forward: number; };
type Holiday = { id: string; holiday_date: string; name: string; wing: string | null };
type Settings = { weekend_days: number[] };

/**
 * Compute leave days. By default weekends and holidays are excluded.
 * If `sandwich` is true, weekend/holiday days are counted when an immediately
 * adjacent day (either side, within the request range) is a working leave day.
 * Half-day always = 0.5.
 */
const computeWorkingDays = (
  start: string,
  end: string,
  dayType: string,
  weekendDays: number[],
  holidaySet: Set<string>,
  sandwich = false,
): number => {
  if (dayType !== "full") return 0.5;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (e < s) return 0;

  const isNonWorking = (d: Date) =>
    weekendDays.includes(d.getDay()) || holidaySet.has(format(d, "yyyy-MM-dd"));

  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (!isNonWorking(d)) { count += 1; continue; }
    if (!sandwich) continue;
    // Sandwich (either side): count if previous OR next day in range is a working day.
    const prev = new Date(d); prev.setDate(prev.getDate() - 1);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const prevInRange = prev >= s && prev <= e && !isNonWorking(prev);
    const nextInRange = next >= s && next <= e && !isNonWorking(next);
    if (prevInRange || nextInRange) count += 1;
  }
  return count;
};

const LeaveManagement = () => {
  const { user, role } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [settings, setSettings] = useState<Settings>({ weekend_days: [5, 6] });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    leave_type_id: string; start_date: string; end_date: string;
    day_type: "full" | "first_half" | "second_half"; reason: string;
  }>({
    leave_type_id: "", start_date: "", end_date: "", day_type: "full", reason: "",
  });
  const [tab, setTab] = useState("calendar");
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date());
  const year = new Date().getFullYear();

  // Modify & Approve modal state
  const [modOpen, setModOpen] = useState(false);
  const [modReq, setModReq] = useState<LeaveRequest | null>(null);
  const [modForm, setModForm] = useState({
    leave_type_id: "", start_date: "", end_date: "",
    day_type: "full" as "full" | "first_half" | "second_half", note: "",
  });

  const fetchAll = useCallback(async () => {
    const [{ data: types }, { data: reqs }, { data: bals }, { data: pf }, { data: hols }, { data: cfg }] = await Promise.all([
      supabase.from("leave_types").select("*").eq("active", true).order("name"),
      supabase.from("leave_requests").select("*").order("start_date", { ascending: false }),
      supabase.from("leave_balances").select("*").eq("year", year),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("holidays").select("*"),
      supabase.from("settings").select("weekend_days").limit(1).maybeSingle(),
    ]);
    setLeaveTypes((types || []) as LeaveType[]);
    setRequests((reqs || []) as LeaveRequest[]);
    setBalances((bals || []) as Balance[]);
    const map: Record<string, any> = {};
    (pf || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
    setProfiles(map);
    setHolidays((hols || []) as Holiday[]);
    if (cfg?.weekend_days) setSettings({ weekend_days: cfg.weekend_days as number[] });
  }, [year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useRealtimeSubscription("leave_requests", fetchAll, "leave-reqs");
  useRealtimeSubscription("leave_balances", fetchAll, "leave-bals");
  useRealtimeSubscription("leave_types", fetchAll, "leave-types");

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.holiday_date)), [holidays]);

  const myBalances = useMemo(() => balances.filter((b) => b.user_id === user?.id), [balances, user]);
  const myRequests = useMemo(() => requests.filter((r) => r.user_id === user?.id), [requests, user]);
  const teamRequests = useMemo(
    () => requests.filter((r) => r.user_id !== user?.id),
    [requests, user]
  );

  const submit = async () => {
    if (!form.leave_type_id || !form.start_date || !form.end_date) { toast.error("Fill leave type and dates"); return; }
    const submitLt = leaveTypes.find((t) => t.id === form.leave_type_id);
    const days = computeWorkingDays(form.start_date, form.end_date, form.day_type, settings.weekend_days, holidaySet, !!submitLt?.sandwich_leave);
    if (days <= 0) { toast.error("No working days in this range (weekends/holidays excluded)"); return; }
    const { data, error } = await supabase.from("leave_requests").insert({
      user_id: user!.id,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date,
      day_type: form.day_type,
      total_days: days,
      reason: form.reason || null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    toast.success(`Leave applied (${days} working day${days !== 1 ? "s" : ""})`);
    const lt = leaveTypes.find((t) => t.id === form.leave_type_id);
    await notifyManagersAndAdmins(
      "New Leave Request",
      `${user?.email} requested ${lt?.name || "leave"} from ${form.start_date} to ${form.end_date} (${days}d)`,
      data?.id,
      { route: "/leave", type: "leave_request", requesterId: user?.id }
    );
    setOpen(false);
    setForm({ leave_type_id: "", start_date: "", end_date: "", day_type: "full", reason: "" });
  };

  /** Apply a leave-balance debit. */
  const applyBalance = async (req: { user_id: string; leave_type_id: string; start_date: string; total_days: number }) => {
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("*")
      .eq("user_id", req.user_id)
      .eq("leave_type_id", req.leave_type_id)
      .eq("year", new Date(req.start_date).getFullYear())
      .maybeSingle();
    const lt = leaveTypes.find((l) => l.id === req.leave_type_id);
    const allocated = bal?.allocated ?? lt?.annual_quota ?? 0;
    const used = (bal?.used ?? 0) + Number(req.total_days);
    const carried = bal?.carried_forward ?? 0;
    if (bal) {
      await supabase.from("leave_balances").update({ used }).eq("id", bal.id);
    } else {
      await supabase.from("leave_balances").insert({
        user_id: req.user_id, leave_type_id: req.leave_type_id, year: new Date(req.start_date).getFullYear(),
        allocated, used, carried_forward: carried,
      });
    }
  };

  const decide = async (req: LeaveRequest, status: "approved" | "rejected", note?: string) => {
    const { error } = await supabase.from("leave_requests").update({
      status, approver_id: user!.id, approver_note: note || null, approved_at: new Date().toISOString(),
    }).eq("id", req.id);
    if (error) { toast.error(error.message); return; }

    if (status === "approved") {
      await applyBalance(req);
    }
    toast.success(`Leave ${status}`);
    const lt = leaveTypes.find((l) => l.id === req.leave_type_id);
    await notifyEmployee(
      req.user_id,
      `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your ${lt?.name || "leave"} request (${req.start_date} → ${req.end_date}) was ${status}.`,
      req.id,
      { route: "/leave", type: "leave_update" }
    );
  };

  const openModify = (req: LeaveRequest) => {
    setModReq(req);
    setModForm({
      leave_type_id: req.leave_type_id,
      start_date: req.start_date,
      end_date: req.end_date,
      day_type: req.day_type,
      note: "",
    });
    setModOpen(true);
  };

  const submitModify = async () => {
    if (!modReq || !user) return;
    if (!modForm.leave_type_id || !modForm.start_date || !modForm.end_date) { toast.error("Fill all fields"); return; }
    const days = computeWorkingDays(modForm.start_date, modForm.end_date, modForm.day_type, settings.weekend_days, holidaySet);
    if (days <= 0) { toast.error("No working days in modified range"); return; }
    const { error } = await supabase.from("leave_requests").update({
      leave_type_id: modForm.leave_type_id,
      start_date: modForm.start_date,
      end_date: modForm.end_date,
      day_type: modForm.day_type,
      total_days: days,
      status: "approved",
      approver_id: user.id,
      approver_note: modForm.note || null,
      approved_at: new Date().toISOString(),
      modified_by: user.id,
      modified_at: new Date().toISOString(),
      original_start_date: modReq.original_start_date ?? modReq.start_date,
      original_end_date: modReq.original_end_date ?? modReq.end_date,
      original_leave_type_id: modReq.original_leave_type_id ?? modReq.leave_type_id,
      original_day_type: (modReq.original_day_type ?? modReq.day_type) as "full" | "first_half" | "second_half",
      original_total_days: modReq.original_total_days ?? modReq.total_days,
    }).eq("id", modReq.id);
    if (error) { toast.error(error.message); return; }
    await applyBalance({
      user_id: modReq.user_id, leave_type_id: modForm.leave_type_id,
      start_date: modForm.start_date, total_days: days,
    });
    const lt = leaveTypes.find((l) => l.id === modForm.leave_type_id);
    await notifyEmployee(
      modReq.user_id,
      "Leave Modified & Approved",
      `Your leave was modified to ${lt?.name} (${modForm.start_date} → ${modForm.end_date}, ${days}d) and approved.`,
      modReq.id,
      { route: "/leave", type: "leave_update" }
    );
    toast.success("Leave modified & approved");
    setModOpen(false);
    setModReq(null);
  };

  const cancel = async (req: LeaveRequest) => {
    const { error } = await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", req.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cancelled");
  };

  const typeColor = (id: string) => leaveTypes.find((t) => t.id === id)?.color || "#3b82f6";
  const typeName = (id: string) => leaveTypes.find((t) => t.id === id)?.name || "—";

  /** Approved leave dates visible to the viewer. RLS already restricts the rows
   *  returned (admin: all, manager: management chain, employee: same wing+department),
   *  so we simply surface every approved request the user can read. */
  const visibleApproved = useMemo(
    () => requests.filter((r) => r.status === "approved"),
    [requests]
  );

  const leaveDays: Date[] = useMemo(() => {
    const days: Date[] = [];
    visibleApproved.forEach((r) => {
      const s = new Date(r.start_date + "T00:00:00");
      const e = new Date(r.end_date + "T00:00:00");
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const dow = d.getDay();
        if (settings.weekend_days.includes(dow)) continue;
        if (holidaySet.has(format(d, "yyyy-MM-dd"))) continue;
        days.push(new Date(d));
      }
    });
    return days;
  }, [visibleApproved, settings, holidaySet]);

  /** Who is on leave on the selected calendar day. */
  const peopleOnSelectedDay = useMemo(() => {
    if (!selectedDay) return [];
    const iso = format(selectedDay, "yyyy-MM-dd");
    return visibleApproved.filter((r) => r.start_date <= iso && iso <= r.end_date);
  }, [selectedDay, visibleApproved]);

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-success/15 text-success border-success/30" variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>;
    if (s === "modified") return <Badge className="bg-[#FFD700]/20 text-yellow-700 border-yellow-500/40" variant="outline"><Pencil className="mr-1 h-3 w-3" />Modified</Badge>;
    if (s === "rejected") return <Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
    if (s === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
    return <Badge className="bg-warning/15 text-warning border-warning/30" variant="outline"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
  };

  const previewDays = form.start_date && form.end_date
    ? computeWorkingDays(form.start_date, form.end_date, form.day_type, settings.weekend_days, holidaySet)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <CalendarHeart className="h-6 w-6" /> Leave Management
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> Apply Leave</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
              <DialogDescription>Weekends and holidays are automatically excluded from the day count.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Leave Type</Label>
                <Select value={form.leave_type_id} onValueChange={(v) => setForm((f) => ({ ...f, leave_type_id: v }))}>
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
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
                <div><Label>End Date</Label><Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
              </div>
              <div>
                <Label>Day Type</Label>
                <Select value={form.day_type} onValueChange={(v: any) => setForm((f) => ({ ...f, day_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Day</SelectItem>
                    <SelectItem value="first_half">First Half</SelectItem>
                    <SelectItem value="second_half">Second Half</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></div>
              <div className="text-sm text-muted-foreground">
                Working days (excl. weekends &amp; holidays): <strong>{previewDays}</strong>
              </div>
            </div>
            <DialogFooter><Button onClick={submit}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
        {leaveTypes.map((t) => {
          const bal = myBalances.find((b) => b.leave_type_id === t.id);
          const allocated = bal?.allocated ?? t.annual_quota;
          const used = bal?.used ?? 0;
          const remaining = Math.max(0, allocated + (bal?.carried_forward ?? 0) - used);
          return (
            <Card key={t.id} className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{remaining}</div>
                <div className="text-xs text-muted-foreground">
                  of {allocated + (bal?.carried_forward ?? 0)} days · used {used}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="my">My Requests</TabsTrigger>
          {(role === "manager" || role === "admin") && <TabsTrigger value="team">Team Requests</TabsTrigger>}
        </TabsList>

        <TabsContent value="calendar">
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Team Leave Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDay}
                  onSelect={setSelectedDay}
                  modifiers={{ onLeave: leaveDays, holiday: Array.from(holidaySet).map((d) => new Date(d + "T00:00:00")) }}
                  modifiersClassNames={{
                    onLeave: "bg-brand/15 text-brand font-semibold ring-1 ring-brand/30",
                    holiday: "bg-warning/15 text-warning",
                  }}
                  className="rounded-md border w-fit"
                />
                <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-brand/30" /> On leave</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-warning/30" /> Holiday</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  {selectedDay ? format(selectedDay, "EEEE, MMM d, yyyy") : "Pick a date"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {peopleOnSelectedDay.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No one is on leave on this day.</p>
                ) : (
                  <div className="space-y-2">
                    {peopleOnSelectedDay.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-md border p-2.5">
                        <div className="flex items-center gap-3">
                          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: typeColor(r.leave_type_id) }} />
                          <div>
                            <div className="font-medium text-sm">{profiles[r.user_id]?.full_name || profiles[r.user_id]?.email || "—"}</div>
                            <div className="text-xs text-muted-foreground">{typeName(r.leave_type_id)} · {r.start_date} → {r.end_date}</div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">{r.day_type === "full" ? "Full" : r.day_type === "first_half" ? "AM" : "PM"}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="my">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRequests.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No leave requests yet</TableCell></TableRow>
                  ) : myRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><Badge variant="outline" style={{ borderColor: typeColor(r.leave_type_id), color: typeColor(r.leave_type_id) }}>{typeName(r.leave_type_id)}</Badge></TableCell>
                      <TableCell>{r.start_date}</TableCell>
                      <TableCell>{r.end_date}</TableCell>
                      <TableCell>{r.total_days}</TableCell>
                      <TableCell className="max-w-xs truncate">{r.reason || "—"}</TableCell>
                      <TableCell>
                        {statusBadge(r.status)}
                        {r.modified_by && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            Modified by {profiles[r.modified_by]?.full_name || profiles[r.modified_by]?.email || "Manager"}
                            {r.original_start_date && r.original_end_date && (
                              <> · was {r.original_start_date} → {r.original_end_date}</>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.status === "pending" && (
                          <Button size="sm" variant="ghost" onClick={() => cancel(r)}>Cancel</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {(role === "manager" || role === "admin") && (
          <TabsContent value="team">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamRequests.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No team requests</TableCell></TableRow>
                    ) : teamRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{profiles[r.user_id]?.full_name || profiles[r.user_id]?.email || "—"}</TableCell>
                        <TableCell><Badge variant="outline" style={{ borderColor: typeColor(r.leave_type_id), color: typeColor(r.leave_type_id) }}>{typeName(r.leave_type_id)}</Badge></TableCell>
                        <TableCell>{r.start_date}</TableCell>
                        <TableCell>{r.end_date}</TableCell>
                        <TableCell>{r.total_days}</TableCell>
                        <TableCell className="max-w-xs truncate">{r.reason || "—"}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="text-right">
                          {r.status === "pending" && (
                            <div className="flex gap-1 justify-end flex-wrap">
                              <Button size="sm" variant="default" onClick={() => decide(r, "approved")}>Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => openModify(r)}>
                                <Pencil className="h-3 w-3 mr-1" /> Modify
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => decide(r, "rejected")}>Reject</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Modify & Approve Leave dialog */}
      <Dialog open={modOpen} onOpenChange={setModOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify &amp; Approve Leave</DialogTitle>
            <DialogDescription>
              Adjust the leave type, dates or day type before approving. The employee will be notified of the changes.
            </DialogDescription>
          </DialogHeader>
          {modReq && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Original: <strong>{typeName(modReq.leave_type_id)}</strong> · {modReq.start_date} → {modReq.end_date} ({modReq.total_days}d)
              </div>
              <div>
                <Label>Leave Type</Label>
                <Select value={modForm.leave_type_id} onValueChange={(v) => setModForm((f) => ({ ...f, leave_type_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={modForm.start_date} onChange={(e) => setModForm((f) => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={modForm.end_date} onChange={(e) => setModForm((f) => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Day Type</Label>
                <Select value={modForm.day_type} onValueChange={(v: any) => setModForm((f) => ({ ...f, day_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Day</SelectItem>
                    <SelectItem value="first_half">First Half</SelectItem>
                    <SelectItem value="second_half">Second Half</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Note to employee (optional)</Label>
                <Textarea value={modForm.note} onChange={(e) => setModForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
              <div className="text-sm text-muted-foreground">
                New working days: <strong>
                  {computeWorkingDays(modForm.start_date, modForm.end_date, modForm.day_type, settings.weekend_days, holidaySet)}
                </strong>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModOpen(false)}>Cancel</Button>
            <Button onClick={submitModify}>Save &amp; Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaveManagement;
