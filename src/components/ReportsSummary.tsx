import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, TimerOff, Timer } from "lucide-react";
import { format } from "date-fns";
import { netRequiredHours } from "@/lib/workSchedule";
import { humanMinutes } from "@/lib/officeTime";

type Schedule = { standard_daily_hours: number | null; unpaid_break_minutes: number | null };

type EmployeeOption = { id: string; full_name: string | null; email: string | null; role: string };

type Summary = {
  userId: string;
  name: string;
  role: string;
  lateDays: number;
  lateMinutesTotal: number;
  shortDays: number;
  shortfallHoursTotal: number;
  otDays: number;
  otHoursTotal: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

const ReportsSummary = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [month, setMonth] = useState("");
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Summary[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleMap = new Map((roles || []).map((r) => [r.user_id, r.role as string]));
      setEmployees((profiles || []).map((p: any) => ({ ...p, role: roleMap.get(p.id) || "employee" })));
    })();
  }, [isAdmin]);

  const effectiveRange = useMemo(() => {
    if (month) {
      const [y, m] = month.split("-").map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    return { from: dateFrom, to: dateTo };
  }, [month, dateFrom, dateTo]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const targetIds = isAdmin
        ? (employeeFilter === "all" ? employees.map((e) => e.id) : [employeeFilter])
        : (user ? [user.id] : []);
      if (targetIds.length === 0) { setRows([]); return; }

      const [{ data: scheduleRows }, { data: attRows }, { data: otRows }, { data: roleRows }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, standard_daily_hours, unpaid_break_minutes").in("id", targetIds),
        (() => {
          let q = supabase.from("attendance_logs").select("user_id, date, late_minutes, total_hours").in("user_id", targetIds);
          if (effectiveRange.from) q = q.gte("date", effectiveRange.from);
          if (effectiveRange.to) q = q.lte("date", effectiveRange.to);
          return q;
        })(),
        (() => {
          let q = supabase.from("overtime_requests").select("user_id, date, requested_hours").in("user_id", targetIds).eq("status", "approved");
          if (effectiveRange.from) q = q.gte("date", effectiveRange.from);
          if (effectiveRange.to) q = q.lte("date", effectiveRange.to);
          return q;
        })(),
        supabase.from("user_roles").select("user_id, role").in("user_id", targetIds),
      ]);

      const roleMap = new Map((roleRows || []).map((r) => [r.user_id, r.role as string]));
      const scheduleMap = new Map<string, Schedule & { full_name: string | null; email: string | null }>(
        (scheduleRows || []).map((p: any) => [p.id, p])
      );

      const byUser = new Map<string, Summary>();
      targetIds.forEach((id) => {
        const p = scheduleMap.get(id);
        byUser.set(id, {
          userId: id,
          name: p?.full_name || p?.email || "—",
          role: roleMap.get(id) || "employee",
          lateDays: 0, lateMinutesTotal: 0,
          shortDays: 0, shortfallHoursTotal: 0,
          otDays: 0, otHoursTotal: 0,
        });
      });

      (attRows || []).forEach((r: any) => {
        const s = byUser.get(r.user_id);
        if (!s) return;
        if (Number(r.late_minutes) > 0) {
          s.lateDays += 1;
          s.lateMinutesTotal += Number(r.late_minutes) || 0;
        }
        const schedule = scheduleMap.get(r.user_id);
        const required = netRequiredHours(schedule);
        const total = Number(r.total_hours) || 0;
        if (total < required) {
          s.shortDays += 1;
          s.shortfallHoursTotal += required - total;
        }
      });

      const otDaySets = new Map<string, Set<string>>();
      (otRows || []).forEach((r: any) => {
        const s = byUser.get(r.user_id);
        if (!s) return;
        s.otHoursTotal += Number(r.requested_hours) || 0;
        const set = otDaySets.get(r.user_id) || new Set<string>();
        set.add(r.date);
        otDaySets.set(r.user_id, set);
      });
      otDaySets.forEach((set, id) => {
        const s = byUser.get(id);
        if (s) s.otDays = set.size;
      });

      setRows(Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, employeeFilter, employees, effectiveRange, user]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const clearFilters = () => { setDateFrom(""); setDateTo(""); setMonth(""); setEmployeeFilter("all"); };

  const mine = rows.find((r) => r.userId === user?.id) || rows[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Performance Summary</CardTitle>
          <CardDescription>Late arrivals, short-duration days, and approved overtime.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
            {isAdmin && (
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All employees</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
              <Button onClick={fetchSummary} className="flex-1">Filter</Button>
              <Button variant="outline" onClick={clearFilters}>Clear</Button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isAdmin ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Late Days</TableHead>
                    <TableHead>Total Late Time</TableHead>
                    <TableHead>Short Duration Days</TableHead>
                    <TableHead>Total Shortfall</TableHead>
                    <TableHead>Approved OT Days</TableHead>
                    <TableHead>Total OT Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No records</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><Badge variant={r.role === "admin" ? "default" : r.role === "manager" ? "secondary" : "outline"}>{r.role}</Badge></TableCell>
                      <TableCell>{r.lateDays}</TableCell>
                      <TableCell>{humanMinutes(r.lateMinutesTotal)}</TableCell>
                      <TableCell>{r.shortDays}</TableCell>
                      <TableCell>{round1(r.shortfallHoursTotal)}h</TableCell>
                      <TableCell>{r.otDays}</TableCell>
                      <TableCell>{round1(r.otHoursTotal)}h</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Clock className="h-4 w-4" /> Late Arrivals</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.lateDays ?? 0} days</div>
                  <p className="text-xs text-muted-foreground mt-1">{humanMinutes(mine?.lateMinutesTotal ?? 0)} total, against due time</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><TimerOff className="h-4 w-4" /> Short Duration Days</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.shortDays ?? 0} days</div>
                  <p className="text-xs text-muted-foreground mt-1">{round1(mine?.shortfallHoursTotal ?? 0)}h short of due time</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Timer className="h-4 w-4" /> Approved Overtime</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{mine?.otDays ?? 0} days</div>
                  <p className="text-xs text-muted-foreground mt-1">{round1(mine?.otHoursTotal ?? 0)}h total overtime</p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsSummary;
