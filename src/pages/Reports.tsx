import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { mergeDailySessions, sessionWorkedSeconds, type AttendanceSession } from "@/lib/attendance";
import { fmtHMS, fmtClock, hoursToHMS } from "@/lib/time";

const Reports = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("all");
  const [month, setMonth] = useState(""); // YYYY-MM
  const [departments, setDepartments] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const days = useMemo(() => mergeDailySessions(logs as AttendanceSession[]), [logs]);


  const fetchLogs = async () => {
    let query = supabase
      .from("attendance_logs")
      .select("*, profiles!attendance_logs_user_id_fkey(full_name, email, department)")
      .order("date", { ascending: false })
      .limit(500);

    let effectiveFrom = dateFrom;
    let effectiveTo = dateTo;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      effectiveFrom = format(start, "yyyy-MM-dd");
      effectiveTo = format(end, "yyyy-MM-dd");
    }
    if (effectiveFrom) query = query.gte("date", effectiveFrom);
    if (effectiveTo) query = query.lte("date", effectiveTo);

    const { data } = await query;
    let rows = data || [];
    if (name.trim()) {
      const q = name.toLowerCase();
      rows = rows.filter((l) => {
        const p: any = l.profiles;
        return (p?.full_name || "").toLowerCase().includes(q) || (p?.email || "").toLowerCase().includes(q);
      });
    }
    if (department && department !== "all") {
      rows = rows.filter((l) => (l.profiles as any)?.department === department);
    }
    setLogs(rows);
  };

  useEffect(() => {
    fetchLogs();
    (async () => {
      const { data } = await supabase.from("profiles").select("department").not("department", "is", null);
      const unique = Array.from(new Set((data || []).map((d: any) => d.department).filter(Boolean))) as string[];
      setDepartments(unique.sort());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCSV = () => {
    const headers = ["Employee", "Department", "Date", "First In", "Last Out", "Sessions", "Break", "Total Worked", "Overtime"];
    const rows = days.map((d) => {
      const p: any = d.profiles;
      return [
        p?.full_name || "",
        p?.department || "",
        d.date,
        fmtClock(d.firstIn),
        d.open ? "In progress" : fmtClock(d.lastOut),
        d.sessions.length,
        fmtHMS(d.breakSeconds),
        fmtHMS(d.workedSeconds),
        hoursToHMS(d.overtimeHours),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `overtime-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setName(""); setDepartment("all"); setMonth("");
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
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="space-y-2">
            <Label>Name / Email</Label>
            <Input placeholder="Search employee" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month</Label>
            <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); if (e.target.value) { setDateFrom(""); setDateTo(""); } }} />
          </div>
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={dateFrom} disabled={!!month} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={dateTo} disabled={!!month} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchLogs} className="flex-1">Filter</Button>
            <Button variant="outline" onClick={clearFilters}>Clear</Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>First In</TableHead>
              <TableHead>Last Out</TableHead>
              <TableHead>Sessions</TableHead>
              <TableHead>Break</TableHead>
              <TableHead>Total Hours</TableHead>
              <TableHead>Overtime</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">No records</TableCell></TableRow>
            ) : days.map((day) => {
              const isOpen = !!expanded[day.key];
              const p: any = day.profiles;
              return (
                <Fragment key={day.key}>
                  <TableRow>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setExpanded((e) => ({ ...e, [day.key]: !e[day.key] }))}
                        aria-label={isOpen ? "Hide sessions" : "Show sessions"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell>{p?.full_name || "—"}</TableCell>
                    <TableCell>{p?.department || "—"}</TableCell>
                    <TableCell>{format(new Date(day.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtClock(day.firstIn)}</TableCell>
                    <TableCell className="font-mono text-xs">{day.open ? <Badge variant="secondary">In progress</Badge> : fmtClock(day.lastOut)}</TableCell>
                    <TableCell><Badge variant="outline">{day.sessions.length}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{fmtHMS(day.breakSeconds)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtHMS(day.workedSeconds)}</TableCell>
                    <TableCell>
                      {day.overtimeHours > 0
                        ? <Badge variant="destructive" className="font-mono">{hoursToHMS(day.overtimeHours)}</Badge>
                        : <span className="font-mono text-xs text-muted-foreground">00:00:00</span>}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell />
                      <TableCell colSpan={9} className="p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Individual sessions</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>#</TableHead>
                              <TableHead>Start</TableHead>
                              <TableHead>Close</TableHead>
                              <TableHead>Break</TableHead>
                              <TableHead>Duration</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {day.sessions.map((s, i) => (
                              <TableRow key={s.id}>
                                <TableCell className="text-xs">{i + 1}</TableCell>
                                <TableCell className="font-mono text-xs">{fmtClock(s.clock_in)}</TableCell>
                                <TableCell className="font-mono text-xs">{s.clock_out ? fmtClock(s.clock_out) : <Badge variant="secondary">Open</Badge>}</TableCell>
                                <TableCell className="font-mono text-xs">{fmtHMS((Number(s.break_minutes) || 0) * 60)}</TableCell>
                                <TableCell className="font-mono text-xs">{fmtHMS(sessionWorkedSeconds(s))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>

      </CardContent>
    </Card>
  );
};

export default Reports;
