import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { notifyManagersAndAdmins, notifyEmployee } from "@/lib/notifications";

/** Color helper for OT status badges */
const otStatusStyle = (status: string) => {
  if (status === "approved") return "bg-lime-500 text-white hover:bg-lime-600 border-lime-500";
  if (status === "rejected") return "bg-[#FF6347] text-white hover:bg-[#E5533D] border-[#FF6347]";
  if (status === "modified") return "bg-[#FFD700] text-black hover:bg-[#E6C200] border-[#FFD700]";
  return ""; // pending uses default
};

const OTRequests = () => {
  const { user, role } = useAuth();
  const isManagerOrAdmin = role === "manager" || role === "admin";

  const [requests, setRequests] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editReq, setEditReq] = useState<any>(null);
  const [editHours, setEditHours] = useState("");

  const calculatedHours = useMemo(() => {
    if (!startTime || !endTime) return "";
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    const diff = (endMin - startMin) / 60;
    return Math.round(diff * 100) / 100;
  }, [startTime, endTime]);

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("overtime_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setRequests(data || []);
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

  useEffect(() => {
    fetchRequests();
    fetchPendingRequests();
  }, [fetchRequests, fetchPendingRequests]);

  useRealtimeSubscription("overtime_requests", () => {
    fetchRequests();
    fetchPendingRequests();
  }, "ot-requests-page");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!calculatedHours || calculatedHours <= 0) { toast.error("Please enter valid start and end times"); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("overtime_requests")
      .insert({ user_id: user.id, date, requested_hours: calculatedHours, reason })
      .select()
      .single();
    if (error) toast.error(error.message);
    else {
      toast.success("OT request submitted!");
      await notifyManagersAndAdmins(
        "New OT Request",
        `${user.email} requested ${calculatedHours}h overtime for ${date}`,
        data?.id
      );
      setStartTime("");
      setEndTime("");
      setReason("");
      fetchRequests();
    }
    setLoading(false);
  };

  const handleApproval = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase
      .from("overtime_requests")
      .update({ status, approved_by: user.id })
      .eq("id", req.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Request ${status}`);
      await notifyEmployee(
        req.user_id,
        `OT Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your ${req.requested_hours}h OT request for ${format(new Date(req.date), "MMM d")} was ${status}.`,
        req.id
      );
      fetchPendingRequests();
    }
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
      toast.success("Hours modified & approved");
      await notifyEmployee(
        editReq.user_id,
        "OT Hours Modified",
        `Your OT request was modified to ${newHours}h and approved.`,
        editReq.id
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
  const getDisplayStatus = (req: any) => {
    // We can't know the original hours after edit, so we track it via the approval flow:
    // If status is approved and it went through the "modify" path, the notification says "Modified"
    // For now, just return the raw status
    return req.status;
  };

  return (
    <div className="space-y-6">
      {/* Employee Submit Form */}
      <Card>
        <CardHeader><CardTitle>Submit Overtime Request</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
              </div>
            </div>
            {startTime && endTime && calculatedHours && (
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

      {/* My Requests */}
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
                  <TableCell>{req.requested_hours}h</TableCell>
                  <TableCell className="max-w-48 truncate">{req.reason}</TableCell>
                  <TableCell>
                    <Badge className={otStatusStyle(getDisplayStatus(req))}>
                      {getDisplayStatus(req)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(req.created_at), "MMM d")}</TableCell>
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
