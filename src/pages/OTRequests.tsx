import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

const statusColor = (s: string) => s === "approved" ? "default" : s === "rejected" ? "destructive" : "secondary";

const OTRequests = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchRequests = async () => {
    if (!user) return;
    const { data } = await supabase.from("overtime_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setRequests(data || []);
  };

  useEffect(() => { fetchRequests(); }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("overtime_requests").insert({
      user_id: user.id,
      date,
      requested_hours: parseFloat(hours),
      reason,
    });
    if (error) toast.error(error.message);
    else { toast.success("OT request submitted!"); setHours(""); setReason(""); fetchRequests(); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Submit Overtime Request</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-4 items-end">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input type="number" step="0.5" min="0.5" max="12" placeholder="e.g. 2" value={hours} onChange={(e) => setHours(e.target.value)} required />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label>Reason</Label>
              <Textarea placeholder="Reason for overtime" value={reason} onChange={(e) => setReason(e.target.value)} required rows={1} />
            </div>
            <Button type="submit" disabled={loading}>{loading ? "Submitting..." : "Submit Request"}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My OT Requests</CardTitle>
        </CardHeader>
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
                  <TableCell><Badge variant={statusColor(req.status)}>{req.status}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(req.created_at), "MMM d")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default OTRequests;
