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

  const [editOpen, setEditOpen] = useState(false);
  const [editReq, setEditReq] = useState<any>(null);
  const [editHours, setEditHours] = useState("");

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [{ data: requests }, { data: resolved }] = await Promise.all([
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
    ]);
    setPending(requests || []);
    setHistory(resolved || []);

    const now = new Date();
    const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    const { data: monthLogs } = await supabase.from("attendance_logs").select("overtime_hours, user_id").gte("date", monthStart);
    const totalOT = (monthLogs || []).reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
    const activeEmployees = new Set((monthLogs || []).map(l => l.user_id)).size;
    setStats({ totalOT: Math.round(totalOT * 10) / 10, pendingCount: (requests || []).length, activeEmployees });
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRealtimeSubscription("overtime_requests", fetchData, "approvals-page");

  const handleAction = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase.from("overtime_requests").update({ status, approved_by: user.id }).eq("id", req.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Request ${status} successfully`);
      await notifyEmployee(
        req.user_id,
        `OT Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your ${req.requested_hours}h OT request for ${format(new Date(req.date), "MMM d")} was ${status}.`,
        req.id
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
    const { error } = await supabase
      .from("overtime_requests")
      .update({ requested_hours: newHours, status: "approved" as any, approved_by: user.id })
      .eq("id", editReq.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Hours modified & approved successfully");
      await notifyEmployee(
        editReq.user_id,
        "OT Hours Modified",
        `Your OT request was modified to ${newHours}h and approved.`,
        editReq.id
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
