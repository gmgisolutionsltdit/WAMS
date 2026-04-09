import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Download } from "lucide-react";
import { format } from "date-fns";

const Reports = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchLogs = async () => {
    let query = supabase.from("attendance_logs").select("*, profiles!attendance_logs_user_id_fkey(full_name, email, department)").order("date", { ascending: false }).limit(100);
    if (dateFrom) query = query.gte("date", dateFrom);
    if (dateTo) query = query.lte("date", dateTo);
    const { data } = await query;
    setLogs(data || []);
  };

  useEffect(() => { fetchLogs(); }, []);

  const exportCSV = () => {
    const headers = ["Employee", "Department", "Date", "Clock In", "Clock Out", "Total Hours", "Overtime"];
    const rows = logs.map((l) => [
      (l.profiles as any)?.full_name || "",
      (l.profiles as any)?.department || "",
      l.date,
      l.clock_in || "",
      l.clock_out || "",
      l.total_hours || 0,
      l.overtime_hours || 0,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `overtime-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <CardTitle>Attendance & Overtime Reports</CardTitle>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> Export CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4 items-end">
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button onClick={fetchLogs}>Filter</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Clock In</TableHead>
              <TableHead>Clock Out</TableHead>
              <TableHead>Total Hours</TableHead>
              <TableHead>Overtime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No records</TableCell></TableRow>
            ) : logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{(log.profiles as any)?.full_name || "—"}</TableCell>
                <TableCell>{(log.profiles as any)?.department || "—"}</TableCell>
                <TableCell>{format(new Date(log.date), "MMM d, yyyy")}</TableCell>
                <TableCell>{log.clock_in ? format(new Date(log.clock_in), "HH:mm") : "—"}</TableCell>
                <TableCell>{log.clock_out ? format(new Date(log.clock_out), "HH:mm") : "—"}</TableCell>
                <TableCell>{log.total_hours?.toFixed(1) || "—"}</TableCell>
                <TableCell>{log.overtime_hours > 0 ? <Badge variant="destructive">{log.overtime_hours.toFixed(1)}h</Badge> : "0.0"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default Reports;
