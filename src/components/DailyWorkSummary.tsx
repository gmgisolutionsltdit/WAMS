import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, addDays, isWeekend } from "date-fns";
import { ClipboardList } from "lucide-react";

type Task = { task: string; status: string };
type WorkLog = { id: string; log_date: string; tasks: Task[] };
type Attendance = {
  id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
};

type DisplayTask = Task & { firstEntryDate: string; forwarded: boolean };
type DayGroup = {
  date: string;
  attendance: Attendance | null;
  tasks: DisplayTask[];
};

const FORWARD_STATUSES = new Set([
  "In Progress",
  "Pending",
  "Not Started",
  "Waiting for dependent part done",
]);

const localToday = () => format(new Date(), "yyyy-MM-dd");

/** Move date forward to the next working day (Mon-Fri). */
const nextWorkingDay = (d: Date): Date => {
  let next = addDays(d, 1);
  while (isWeekend(next)) next = addDays(next, 1);
  return next;
};

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "Done":
      return "bg-lime-500 text-white border-lime-500 hover:bg-lime-600";
    case "In Progress":
      return "bg-blue-500 text-white border-blue-500 hover:bg-blue-600";
    case "Pending":
      return "bg-amber-500 text-white border-amber-500 hover:bg-amber-600";
    case "Not Started":
      return "bg-muted text-muted-foreground border-border";
    case "Waiting for dependent part done":
      return "bg-orange-400 text-white border-orange-400 hover:bg-orange-500";
    default:
      return "";
  }
};

/** Build per-date groups, forwarding unfinished tasks to subsequent working days. */
const buildGroups = (
  attendance: Attendance[],
  workLogs: WorkLog[],
): DayGroup[] => {
  const today = localToday();

  // Collect all relevant dates (attendance dates + log dates + today).
  const dateSet = new Set<string>([today]);
  attendance.forEach((a) => dateSet.add(a.date));
  workLogs.forEach((w) => dateSet.add(w.log_date));

  // Expand: for each unfinished task on date X, also surface it on every subsequent working day up to today.
  const allDates = Array.from(dateSet).sort(); // ascending
  workLogs.forEach((wl) => {
    wl.tasks.forEach((t) => {
      if (!FORWARD_STATUSES.has(t.status)) return;
      let cursor = nextWorkingDay(parseISO(wl.log_date));
      const todayDate = parseISO(today);
      while (cursor <= todayDate) {
        dateSet.add(format(cursor, "yyyy-MM-dd"));
        cursor = nextWorkingDay(cursor);
      }
    });
  });

  const sortedDates = Array.from(dateSet).sort().reverse(); // descending
  const attendanceByDate = new Map(attendance.map((a) => [a.date, a]));

  // For each date, gather tasks: native (logged that day) + forwarded (unfinished from earlier dates).
  const groups: DayGroup[] = sortedDates.map((date) => {
    const dateObj = parseISO(date);
    const tasks: DisplayTask[] = [];

    // Native tasks logged on this date.
    workLogs
      .filter((w) => w.log_date === date)
      .forEach((w) =>
        w.tasks.forEach((t) =>
          tasks.push({ ...t, firstEntryDate: date, forwarded: false }),
        ),
      );

    // Forwarded tasks: unfinished tasks from earlier work logs that should appear here.
    workLogs
      .filter((w) => w.log_date < date)
      .forEach((w) => {
        w.tasks.forEach((t) => {
          if (!FORWARD_STATUSES.has(t.status)) return;
          // Check this date is one of the forwarded working days after w.log_date.
          let cursor = nextWorkingDay(parseISO(w.log_date));
          const todayDate = parseISO(localToday());
          let appears = false;
          while (cursor <= todayDate) {
            if (format(cursor, "yyyy-MM-dd") === date) {
              appears = true;
              break;
            }
            cursor = nextWorkingDay(cursor);
          }
          if (appears) {
            tasks.push({ ...t, firstEntryDate: w.log_date, forwarded: true });
          }
        });
      });

    return {
      date,
      attendance: attendanceByDate.get(date) ?? null,
      tasks,
    };
  });

  // Drop empty groups except today.
  return groups.filter(
    (g) => g.date === today || g.attendance || g.tasks.length > 0,
  );
};

const DailyWorkSummary = () => {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    // Pull last 60 days to give us enough history for forwarding.
    const since = format(addDays(new Date(), -60), "yyyy-MM-dd");
    const [{ data: att }, { data: logs }] = await Promise.all([
      supabase
        .from("attendance_logs")
        .select("id, date, clock_in, clock_out, total_hours")
        .eq("user_id", user.id)
        .gte("date", since)
        .order("date", { ascending: false }),
      supabase
        .from("daily_work_logs")
        .select("id, log_date, tasks")
        .eq("user_id", user.id)
        .gte("log_date", since)
        .order("log_date", { ascending: false }),
    ]);
    setAttendance((att ?? []) as Attendance[]);
    setWorkLogs(
      ((logs ?? []) as any[]).map((l) => ({
        id: l.id,
        log_date: l.log_date,
        tasks: Array.isArray(l.tasks) ? (l.tasks as Task[]) : [],
      })),
    );
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription("attendance_logs", fetchData, "summary-attendance");
  useRealtimeSubscription("daily_work_logs", fetchData, "summary-worklogs");

  const groups = buildGroups(attendance, workLogs);


  // Flatten rows: one row per task, plus one "no tasks" row for days without entries.
  type FlatRow = {
    key: string;
    date: string;
    isToday: boolean;
    clockIn: string;
    clockOut: string;
    totalHours: string;
    firstEntryDate: string | null;
    task: string;
    status: string;
    forwarded: boolean;
  };
  const rows: FlatRow[] = [];
  groups.forEach((g) => {
    const att = g.attendance;
    const clockIn = att?.clock_in ? format(new Date(att.clock_in), "HH:mm") : "—";
    const clockOut = att?.clock_out ? format(new Date(att.clock_out), "HH:mm") : "—";
    const totalHours = att?.total_hours != null ? `${att.total_hours.toFixed(2)} hrs` : "—";
    if (g.tasks.length === 0) {
      rows.push({
        key: `${g.date}-empty`, date: g.date, isToday: g.date === localToday(),
        clockIn, clockOut, totalHours,
        firstEntryDate: null, task: "", status: "", forwarded: false,
      });
    } else {
      g.tasks.forEach((t, idx) => {
        rows.push({
          key: `${g.date}-${idx}`, date: g.date, isToday: g.date === localToday(),
          clockIn, clockOut, totalHours,
          firstEntryDate: t.firstEntryDate, task: t.task, status: t.status, forwarded: t.forwarded,
        });
      });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Daily Work Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            No records yet. Clock in to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead>First Entry</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="whitespace-nowrap">
                      {format(parseISO(r.date), "MMM d, yyyy")}
                      {r.isToday && <Badge variant="outline" className="ml-2 text-xs">Today</Badge>}
                    </TableCell>
                    <TableCell>{r.clockIn}</TableCell>
                    <TableCell>{r.clockOut}</TableCell>
                    <TableCell>{r.totalHours}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {r.firstEntryDate
                        ? <>
                            {format(parseISO(r.firstEntryDate), "MMM d, yyyy")}
                            {r.forwarded && <Badge variant="outline" className="ml-2 text-xs">Forwarded</Badge>}
                          </>
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap">
                      {r.task || <span className="text-muted-foreground italic">No tasks logged</span>}
                    </TableCell>
                    <TableCell>
                      {r.status
                        ? <Badge className={statusBadgeClass(r.status)}>{r.status}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyWorkSummary;
