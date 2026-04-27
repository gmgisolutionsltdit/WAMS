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
import { CalendarHeart, Plus, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

type LeaveType = {
  id: string; name: string; code: string; color: string; annual_quota: number;
  half_day_allowed: boolean; is_paid: boolean; active: boolean;
};

type LeaveRequest = {
  id: string; user_id: string; leave_type_id: string; start_date: string; end_date: string;
  day_type: "full" | "first_half" | "second_half"; total_days: number;
  reason: string | null; status: "pending" | "approved" | "rejected" | "cancelled";
  approver_id: string | null; approver_note: string | null; created_at: string;
};

type Balance = { id: string; user_id: string; leave_type_id: string; year: number; allocated: number; used: number; carried_forward: number; };

const computeDays = (start: string, end: string, dayType: string): number => {
  if (dayType !== "full") return 0.5;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
};

const LeaveManagement = () => {
  const { user, role } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; email: string | null }>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    leave_type_id: "", start_date: "", end_date: "", day_type: "full" as const, reason: "",
  });
  const [tab, setTab] = useState("calendar");
  const year = new Date().getFullYear();

  const fetchAll = useCallback(async () => {
    const [{ data: types }, { data: reqs }, { data: bals }, { data: pf }] = await Promise.all([
      supabase.from("leave_types").select("*").eq("active", true).order("name"),
      supabase.from("leave_requests").select("*").order("start_date", { ascending: false }),
      supabase.from("leave_balances").select("*").eq("year", year),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    setLeaveTypes((types || []) as LeaveType[]);
    setRequests((reqs || []) as LeaveRequest[]);
    setBalances((bals || []) as Balance[]);
    const map: Record<string, any> = {};
    (pf || []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, email: p.email }; });
    setProfiles(map);
  }, [year]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useRealtimeSubscription("leave_requests", fetchAll, "leave-reqs");
  useRealtimeSubscription("leave_balances", fetchAll, "leave-bals");

  const myBalances = useMemo(() => balances.filter((b) => b.user_id === user?.id), [balances, user]);
  const myRequests = useMemo(() => requests.filter((r) => r.user_id === user?.id), [requests, user]);
  const teamRequests = useMemo(
    () => requests.filter((r) => r.user_id !== user?.id),
    [requests, user]
  );

  const submit = async () => {
    if (!form.leave_type_id || !form.start_date || !form.end_date) { toast.error("Fill leave type and dates"); return; }
    const days = computeDays(form.start_date, form.end_date, form.day_type);
    if (days <= 0) { toast.error("End date must be on/after start date"); return; }
    const { error } = await supabase.from("leave_requests").insert({
      user_id: user!.id,
      leave_type_id: form.leave_type_id,
      start_date: form.start_date,
      end_date: form.end_date,
      day_type: form.day_type,
      total_days: days,
      reason: form.reason || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Leave applied");
    setOpen(false);
    setForm({ leave_type_id: "", start_date: "", end_date: "", day_type: "full", reason: "" });
  };

  const decide = async (req: LeaveRequest, status: "approved" | "rejected", note?: string) => {
    const { error } = await supabase.from("leave_requests").update({
      status, approver_id: user!.id, approver_note: note || null, approved_at: new Date().toISOString(),
    }).eq("id", req.id);
    if (error) { toast.error(error.message); return; }

    if (status === "approved") {
      // Increment used in balance (upsert)
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
    }
    toast.success(`Leave ${status}`);
  };

  const cancel = async (req: LeaveRequest) => {
    const { error } = await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", req.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cancelled");
  };

  const typeColor = (id: string) => leaveTypes.find((t) => t.id === id)?.color || "#3b82f6";
  const typeName = (id: string) => leaveTypes.find((t) => t.id === id)?.name || "—";

  // Calendar markers: compute approved dates for visual highlight
  const leaveDays: Date[] = useMemo(() => {
    const days: Date[] = [];
    requests.filter((r) => r.status === "approved").forEach((r) => {
      const s = new Date(r.start_date + "T00:00:00");
      const e = new Date(r.end_date + "T00:00:00");
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d));
      }
    });
    return days;
  }, [requests]);

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-green-100 text-green-700 border-green-300" variant="outline"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>;
    if (s === "rejected") return <Badge className="bg-red-100 text-red-700 border-red-300" variant="outline"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
    if (s === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300" variant="outline"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
  };

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
              <DialogDescription>Submit a leave request. Your reporting manager will be notified.</DialogDescription>
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
                Total days: <strong>{form.start_date && form.end_date ? computeDays(form.start_date, form.end_date, form.day_type) : 0}</strong>
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
            <Card key={t.id}>
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
          <Card>
            <CardHeader><CardTitle>Approved Leave Calendar</CardTitle></CardHeader>
            <CardContent>
              <Calendar
                mode="multiple"
                selected={leaveDays}
                className="rounded-md border w-fit"
              />
              <p className="text-xs text-muted-foreground mt-2">Highlighted dates indicate approved leave for the visible team scope.</p>
            </CardContent>
          </Card>
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
                      <TableCell>{statusBadge(r.status)}</TableCell>
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
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="default" onClick={() => decide(r, "approved")}>Approve</Button>
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
    </div>
  );
};

export default LeaveManagement;
