import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, Clock, Users, Timer, Pencil } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { notifyEmployee } from "@/lib/notifications";
import { applyOTFulfillment } from "@/lib/otFulfillment";

const otStatusStyle = (status: string) => {
  if (status === "approved") return "bg-lime-500 text-white hover:bg-lime-600 border-lime-500";
  if (status === "rejected") return "bg-[#FF6347] text-white hover:bg-[#E5533D] border-[#FF6347]";
  if (status === "modified") return "bg-[#FFD700] text-black hover:bg-[#E6C200] border-[#FFD700]";
  return "";
};

const Approvals = () => {
  const { user, role } = useAuth();
  const [pending, setPending] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalOT: 0, pendingCount: 0, activeEmployees: 0 });
  const [manualPending, setManualPending] = useState<any[]>([]);
  const [latePending, setLatePending] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editReq, setEditReq] = useState<any>(null);
  const [editHours, setEditHours] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [{ data: requests }, { data: resolved }, { data: manualReqs }, { data: lateReqs }] = await Promise.all([
      supabase
        .from("overtime_requests")
        .select("*, profiles!overtime_requests_user_id_fkey(full_name, email)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("overtime_requests")
        .select("*, profiles!overtime_requests_user_id_fkey(full_name, email)")
        .neq("status", "pending")
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase.from("manual_time_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("late_time_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    ]);
    setPending(requests || []);
    setHistory(resolved || []);
    setManualPending(manualReqs || []);
    setLatePending(lateReqs || []);

    const ids = Array.from(new Set([...(manualReqs || []), ...(lateReqs || [])].map((r: any) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.full_name || p.email || "Unknown"; });
      setNames(map);
    }

    const now = new Date();
    const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    const { data: monthLogs } = await supabase.from("attendance_logs").select("overtime_hours, user_id").gte("date", monthStart);
    const totalOT = (monthLogs || []).reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
    const activeEmployees = new Set((monthLogs || []).map(l => l.user_id)).size;
    setStats({ totalOT: Math.round(totalOT * 10) / 10, pendingCount: (requests || []).length, activeEmployees });
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRealtimeSubscription("overtime_requests", fetchData, "approvals-page");
  useRealtimeSubscription("manual_time_requests", fetchData, "approvals-manual");
  useRealtimeSubscription("late_time_requests", fetchData, "approvals-late");

  const decideManual = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase
      .from("manual_time_requests")
      .update({ status, approved_by: user.id, approver_note: notes[req.id] || null })
      .eq("id", req.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Manual time request ${status}`);
    await notifyEmployee(
      req.user_id,
      `Manual Time Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your manual time entry for ${format(new Date(req.date), "MMM d")} was ${status}.`,
      req.id,
      { route: "/attendance", type: "manual_time_update" }
    );
    fetchData();
  };

  const decideLate = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase
      .from("late_time_requests")
      .update({ status, approved_by: user.id, approver_note: notes[req.id] || null })
      .eq("id", req.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Late time request ${status}`);
    await notifyEmployee(
      req.user_id,
      `Late Time Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your ${req.request_type === "office_time_change" ? "office time change" : "late adjustment"} request for ${format(new Date(req.effective_date), "MMM d")} was ${status}.`,
      req.id,
      { route: "/", type: "late_time_update" }
    );
    fetchData();
  };


  const handleAction = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    let finalHours = req.requested_hours;
    if (status === "approved") {
      finalHours = await applyOTFulfillment(req.user_id, req.date, req.requested_hours);
    }
    const { error } = await supabase.from("overtime_requests").update({ status, approved_by: user.id, requested_hours: finalHours }).eq("id", req.id);
    if (error) toast.error(error.message);
    else {
      const detail = status === "approved" && finalHours < req.requested_hours
        ? ` (adjusted from ${req.requested_hours}h to ${finalHours}h after standard hours fulfillment)`
        : "";
      toast.success(`Request ${status} successfully${detail}`);
      await notifyEmployee(
        req.user_id,
        `OT Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your ${finalHours}h OT request for ${format(new Date(req.date), "MMM d")} was ${status}.${detail}`,
        req.id,
        { route: "/ot-requests", type: "ot_update" }
      );
      fetchData();
    }
  };

  const openEdit = (req: any) => {
    setEditReq(req);
    setEditHours(String(req.requested_hours));
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editReq || !user) return;
    const newHours = parseFloat(editHours);
    if (isNaN(newHours) || newHours <= 0) { toast.error("Invalid hours"); return; }
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
        ? `Modified to ${newHours}h, adjusted to ${adjustedHours}h after fulfillment`
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
      fetchData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total OT This Month</CardDescription></CardHeader>
          <CardContent><div className="flex items-center gap-2"><Timer className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{stats.totalOT}h</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Pending Requests</CardDescription></CardHeader>
          <CardContent><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-destructive" /><span className="text-2xl font-bold">{stats.pendingCount}</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Active Employees</CardDescription></CardHeader>
          <CardContent><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{stats.activeEmployees}</span></div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Pending Approvals</CardTitle></CardHeader>
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
              {pending.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No pending requests</TableCell></TableRow>
              ) : pending.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{(req.profiles as any)?.full_name || (req.profiles as any)?.email || "Unknown"}</TableCell>
                  <TableCell>{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                  <TableCell><Badge>{req.requested_hours}h</Badge></TableCell>
                  <TableCell className="max-w-48 truncate">{req.reason}</TableCell>
                  <TableCell className="space-x-1">
                    <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => handleAction(req, "approved")}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" className="bg-[#FF6347] hover:bg-[#E5533D] text-white" onClick={() => handleAction(req, "rejected")}>
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

      {/* Manual Time Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Manual Time Requests</CardTitle>
          <CardDescription>Approved entries are written straight into the employee's attendance record.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>In / Out</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Reason / Task</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manualPending.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending manual time requests</TableCell></TableRow>
              ) : manualPending.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{names[req.user_id] || "Unknown"}</TableCell>
                  <TableCell className="whitespace-nowrap">{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs font-mono">
                    {format(new Date(req.clock_in), "HH:mm")} – {format(new Date(req.clock_out), "HH:mm")}
                    {Number(req.break_minutes) > 0 && <span className="text-muted-foreground"> (−{req.break_minutes}m)</span>}
                  </TableCell>
                  <TableCell>
                    <Badge>{Number(req.total_hours).toFixed(2)}h</Badge>
                    {Number(req.overtime_hours) > 0 && <Badge variant="outline" className="ml-1">OT {Number(req.overtime_hours).toFixed(2)}h</Badge>}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{req.task_note || req.reason || "—"}</TableCell>
                  <TableCell>
                    <Input
                      placeholder="Optional note"
                      value={notes[req.id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                      className="h-8 w-40"
                    />
                  </TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => decideManual(req, "approved")}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" className="bg-[#FF6347] hover:bg-[#E5533D] text-white" onClick={() => decideManual(req, "rejected")}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Late Time Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Late Time Requests</CardTitle>
          <CardDescription>Late penalty adjustments and approved office-time changes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latePending.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending late time requests</TableCell></TableRow>
              ) : latePending.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{names[req.user_id] || "Unknown"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{req.request_type === "office_time_change" ? "Office time change" : "Late adjustment"}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{format(new Date(req.effective_date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {req.request_type === "office_time_change"
                      ? `${String(req.requested_start_time).slice(0, 5)} – ${String(req.requested_end_time).slice(0, 5)}`
                      : `Late ${humanMinutes(Number(req.late_minutes) || 0)} · waive ${humanMinutes(Number(req.adjustment_minutes) || 0)}`}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{req.reason || "—"}</TableCell>
                  <TableCell>
                    <Input
                      placeholder="Optional note"
                      value={notes[req.id] || ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                      className="h-8 w-40"
                    />
                  </TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => decideLate(req, "approved")}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" className="bg-[#FF6347] hover:bg-[#E5533D] text-white" onClick={() => decideLate(req, "rejected")}>
                      <X className="h-4 w-4 mr-1" /> Reject
                    </Button>
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
              {history.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No history yet</TableCell></TableRow>
              ) : history.map((req) => (
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

export default Approvals;
