import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, Clock, Users, Timer } from "lucide-react";

const Approvals = () => {
  const { user } = useAuth();
  const [pending, setPending] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalOT: 0, pendingCount: 0, activeEmployees: 0 });

  const fetchData = async () => {
    if (!user) return;
    const { data: requests } = await supabase.from("overtime_requests").select("*, profiles!overtime_requests_user_id_fkey(full_name, email)").eq("status", "pending");
    setPending(requests || []);

    // Stats
    const now = new Date();
    const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    const { data: monthLogs } = await supabase.from("attendance_logs").select("overtime_hours, user_id").gte("date", monthStart);
    const totalOT = (monthLogs || []).reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
    const activeEmployees = new Set((monthLogs || []).map(l => l.user_id)).size;
    setStats({ totalOT: Math.round(totalOT * 10) / 10, pendingCount: (requests || []).length, activeEmployees });
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    if (!user) return;
    const { error } = await supabase.from("overtime_requests").update({ status, approved_by: user.id }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(`Request ${status}`); fetchData(); }
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
        <CardHeader>
          <CardTitle>Pending Approvals</CardTitle>
        </CardHeader>
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
                  <TableCell>{(req.profiles as any)?.full_name || (req.profiles as any)?.email || "Unknown"}</TableCell>
                  <TableCell>{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                  <TableCell><Badge>{req.requested_hours}h</Badge></TableCell>
                  <TableCell className="max-w-48 truncate">{req.reason}</TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" onClick={() => handleAction(req.id, "approved")}><Check className="h-4 w-4 mr-1" /> Approve</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleAction(req.id, "rejected")}><X className="h-4 w-4 mr-1" /> Reject</Button>
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

export default Approvals;
