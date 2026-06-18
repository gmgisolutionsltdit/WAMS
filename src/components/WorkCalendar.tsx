import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, CalendarDays, Briefcase, Plane, Timer, PartyPopper } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameMonth,
  isSameDay,
  parseISO,
  isWithinInterval,
} from "date-fns";
import { cn } from "@/lib/utils";

type EventKind = "task" | "leave" | "overtime" | "holiday";

interface CalEvent {
  id: string;
  kind: EventKind;
  title: string;
  date: Date;          // anchor date used for grid placement
  startDate?: Date;
  endDate?: Date;
  time?: string;
  meta?: Record<string, any>;
}

const kindStyles: Record<EventKind, { dot: string; chip: string; icon: any; label: string }> = {
  task:     { dot: "bg-primary",   chip: "bg-primary/10 text-primary border-primary/20",            icon: Briefcase,   label: "Task" },
  leave:    { dot: "bg-warning",   chip: "bg-warning/10 text-warning border-warning/20",            icon: Plane,       label: "Leave" },
  overtime: { dot: "bg-info",      chip: "bg-info/10 text-info border-info/20",                     icon: Timer,       label: "Overtime" },
  holiday:  { dot: "bg-success",   chip: "bg-success/10 text-success border-success/20",            icon: PartyPopper, label: "Holiday" },
};

export default function WorkCalendar() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [active, setActive] = useState<CalEvent | null>(null);

  useEffect(() => {
    if (!user) return;
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const fromISO = format(startOfWeek(monthStart), "yyyy-MM-dd");
    const toISO = format(endOfWeek(monthEnd), "yyyy-MM-dd");

    (async () => {
      const [tasksRes, leavesRes, otRes, holRes] = await Promise.all([
        supabase
          .from("tasks")
          .select("id,title,due_date,start_date,priority,status")
          .eq("assignee_id", user.id)
          .not("due_date", "is", null)
          .gte("due_date", fromISO)
          .lte("due_date", toISO),
        supabase
          .from("leave_requests")
          .select("id,start_date,end_date,status,reason,leave_type_id")
          .eq("user_id", user.id)
          .in("status", ["approved", "pending"])
          .gte("end_date", fromISO)
          .lte("start_date", toISO),
        supabase
          .from("overtime_requests")
          .select("id,date,requested_hours,status,reason")
          .eq("user_id", user.id)
          .in("status", ["approved", "modified", "pending"])
          .gte("date", fromISO)
          .lte("date", toISO),
        supabase
          .from("holidays")
          .select("id,date,name")
          .gte("date", fromISO)
          .lte("date", toISO),
      ]);

      const all: CalEvent[] = [];

      (tasksRes.data || []).forEach((t: any) => {
        all.push({
          id: `task-${t.id}`,
          kind: "task",
          title: t.title,
          date: parseISO(t.due_date),
          meta: { priority: t.priority, status: t.status },
        });
      });

      (leavesRes.data || []).forEach((l: any) => {
        const s = parseISO(l.start_date);
        const e = parseISO(l.end_date);
        // Expand range across visible days
        let d = s;
        while (d <= e) {
          all.push({
            id: `leave-${l.id}-${format(d, "yyyy-MM-dd")}`,
            kind: "leave",
            title: l.status === "pending" ? "Leave (pending)" : "Leave",
            date: d,
            startDate: s,
            endDate: e,
            meta: { reason: l.reason, status: l.status },
          });
          d = addDays(d, 1);
        }
      });

      (otRes.data || []).forEach((o: any) => {
        all.push({
          id: `ot-${o.id}`,
          kind: "overtime",
          title: `Overtime ${o.requested_hours}h`,
          date: parseISO(o.date),
          meta: { hours: o.requested_hours, reason: o.reason, status: o.status },
        });
      });

      (holRes.data || []).forEach((h: any) => {
        all.push({
          id: `hol-${h.id}`,
          kind: "holiday",
          title: h.name,
          date: parseISO(h.date),
        });
      });

      setEvents(all);
    })();
  }, [user, cursor]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    const arr: Date[] = [];
    let d = start;
    while (d <= end) {
      arr.push(d);
      d = addDays(d, 1);
    }
    return arr;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      const k = format(e.date, "yyyy-MM-dd");
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [events]);

  const selectedEvents = eventsByDay.get(format(selected, "yyyy-MM-dd")) || [];

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarDays className="h-5 w-5 text-primary" />
            Work Calendar
          </CardTitle>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[110px] text-center text-sm font-medium tabular-nums">
              {format(cursor, "MMMM yyyy")}
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex h-8" onClick={() => { const t = new Date(); setCursor(startOfMonth(t)); setSelected(t); }}>
              Today
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center py-1">
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{d[0]}</span>
              </div>
            ))}
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const k = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(k) || [];
              const inMonth = isSameMonth(day, cursor);
              const isSel = isSameDay(day, selected);
              const isToday = isSameDay(day, new Date());
              return (
                <button
                  key={k}
                  onClick={() => setSelected(day)}
                  className={cn(
                    "relative flex flex-col items-stretch text-left rounded-md border transition-colors p-1 sm:p-1.5",
                    "min-h-[52px] sm:min-h-[92px]",
                    inMonth ? "bg-card" : "bg-muted/30 text-muted-foreground",
                    isSel ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-[11px] sm:text-xs font-semibold tabular-nums",
                      isToday && "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    )}>
                      {format(day, "d")}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="sm:hidden flex gap-0.5">
                        {Array.from(new Set(dayEvents.map(e => e.kind))).slice(0,3).map(k => (
                          <span key={k} className={cn("h-1.5 w-1.5 rounded-full", kindStyles[k].dot)} />
                        ))}
                      </span>
                    )}
                  </div>

                  {/* Desktop: chips */}
                  <div className="mt-1 hidden sm:flex flex-col gap-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        onClick={(ev) => { ev.stopPropagation(); setSelected(day); setActive(e); }}
                        className={cn(
                          "truncate rounded px-1.5 py-0.5 text-[10px] font-medium border cursor-pointer hover:opacity-80",
                          kindStyles[e.kind].chip
                        )}
                      >
                        {e.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected day list (always shown; primary on mobile, secondary on desktop) */}
          <div className="mt-4 border-t pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold">{format(selected, "EEEE, MMMM d")}</h4>
              <span className="text-xs text-muted-foreground">{selectedEvents.length} item{selectedEvents.length === 1 ? "" : "s"}</span>
            </div>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No work items scheduled for this day.</p>
            ) : (
              <ul className="space-y-2">
                {selectedEvents
                  .slice()
                  .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
                  .map((e) => {
                    const S = kindStyles[e.kind];
                    const Icon = S.icon;
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => setActive(e)}
                          className="w-full flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
                        >
                          <div className={cn("rounded-md p-2", S.chip)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{e.title}</div>
                            <div className="text-xs text-muted-foreground">{S.label}{e.time ? ` · ${e.time}` : ""}</div>
                          </div>
                          <Badge variant="outline" className="text-[10px] capitalize hidden sm:inline-flex">{e.meta?.status || S.label}</Badge>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {(Object.keys(kindStyles) as EventKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", kindStyles[k].dot)} />
                {kindStyles[k].label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="sm:max-w-md">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => { const Icon = kindStyles[active.kind].icon; return <Icon className="h-5 w-5 text-primary" />; })()}
                  {active.title}
                </DialogTitle>
                <DialogDescription className="capitalize">{kindStyles[active.kind].label}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">{format(active.date, "EEE, MMM d, yyyy")}</span>
                </div>
                {active.startDate && active.endDate && !isSameDay(active.startDate, active.endDate) && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Range</span>
                    <span className="font-medium">{format(active.startDate, "MMM d")} – {format(active.endDate, "MMM d")}</span>
                  </div>
                )}
                {active.meta?.status && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className="capitalize">{active.meta.status}</Badge>
                  </div>
                )}
                {active.meta?.priority && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Priority</span>
                    <Badge variant="outline" className="capitalize">{active.meta.priority}</Badge>
                  </div>
                )}
                {active.meta?.hours && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-muted-foreground">Hours</span>
                    <span className="font-medium">{active.meta.hours}h</span>
                  </div>
                )}
                {active.meta?.reason && (
                  <div>
                    <div className="text-muted-foreground mb-1">Notes</div>
                    <p className="rounded-md bg-muted/50 p-2 text-sm">{active.meta.reason}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
