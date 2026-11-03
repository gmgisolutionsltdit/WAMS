import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

const RECURRING_OPTIONS = [
  { value: "none", label: "Never" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Monday to Friday" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const REMINDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "at_time", label: "At time of due date" },
  { value: "5_min_before", label: "5 minutes before" },
  { value: "10_min_before", label: "10 minutes before" },
  { value: "15_min_before", label: "15 minutes before" },
  { value: "1_hour_before", label: "1 hour before" },
  { value: "2_hours_before", label: "2 hours before" },
  { value: "3_hours_before", label: "3 hours before" },
  { value: "4_hours_before", label: "4 hours before" },
  { value: "5_hours_before", label: "5 hours before" },
  { value: "1_day_before", label: "1 day before" },
  { value: "2_days_before", label: "2 days before" },
  { value: "1_week_before", label: "1 week before" },
  { value: "2_weeks_before", label: "2 weeks before" },
];

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const ordinal = (n: number) => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

/** "weekly:2" -> 2 (Tuesday); bare "weekly" -> null (no day chosen yet). */
const parseWeeklyDay = (recurring: string | null): number | null => {
  if (!recurring?.startsWith("weekly:")) return null;
  const n = Number(recurring.slice(7));
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
};

const splitDateTime = (iso: string | null) => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  return { date, time };
};

const joinDateTime = (date: string, time: string): string | null => {
  if (!date) return null;
  const iso = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
};

interface Props {
  startDate: string | null;
  dueDate: string | null;
  recurring: string | null;
  reminder: string | null;
  onSave: (patch: { start_date: string | null; due_date: string | null; recurring: string | null; reminder: string | null }) => void;
}

export const TaskDatesPopover = ({ startDate, dueDate, recurring, reminder, onSave }: Props) => {
  const [open, setOpen] = useState(false);
  const [useStart, setUseStart] = useState(!!startDate);
  const [useDue, setUseDue] = useState(!!dueDate);
  const [startDraft, setStartDraft] = useState(startDate ? startDate.slice(0, 10) : "");
  const dueSplit = splitDateTime(dueDate);
  const [dueDateDraft, setDueDateDraft] = useState(dueSplit.date);
  const [dueTimeDraft, setDueTimeDraft] = useState(dueSplit.time || "17:00");
  const recurringKind = recurring?.startsWith("weekly") ? "weekly" : (recurring || "none");
  const [recurringDraft, setRecurringDraft] = useState(recurringKind);
  const [weeklyDay, setWeeklyDay] = useState(() => parseWeeklyDay(recurring) ?? new Date(dueDate || Date.now()).getDay());
  const [reminderDraft, setReminderDraft] = useState(reminder || "none");

  const openChange = (o: boolean) => {
    if (o) {
      setUseStart(!!startDate);
      setUseDue(!!dueDate);
      setStartDraft(startDate ? startDate.slice(0, 10) : "");
      const s = splitDateTime(dueDate);
      setDueDateDraft(s.date);
      setDueTimeDraft(s.time || "17:00");
      setRecurringDraft(recurring?.startsWith("weekly") ? "weekly" : (recurring || "none"));
      setWeeklyDay(parseWeeklyDay(recurring) ?? new Date(dueDate || Date.now()).getDay());
      setReminderDraft(reminder || "none");
    }
    setOpen(o);
  };

  const save = () => {
    const recurringValue = recurringDraft === "weekly" ? `weekly:${weeklyDay}` : recurringDraft;
    onSave({
      start_date: useStart && startDraft ? startDraft : null,
      due_date: useDue ? joinDateTime(dueDateDraft, dueTimeDraft) : null,
      recurring: useDue && recurringDraft !== "none" ? recurringValue : null,
      reminder: useDue && reminderDraft !== "none" ? reminderDraft : null,
    });
    setOpen(false);
  };

  const remove = () => {
    onSave({ start_date: null, due_date: null, recurring: null, reminder: null });
    setOpen(false);
  };

  const summary = () => {
    const parts: string[] = [];
    if (startDate) parts.push(`Start: ${new Date(startDate).toLocaleDateString()}`);
    if (dueDate) parts.push(`Due: ${new Date(dueDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`);
    return parts.length ? parts.join(" · ") : null;
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-start gap-2 h-auto py-1.5 font-normal">
          <CalendarClock className="h-4 w-4" />
          {summary() || "Dates"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <p className="text-sm font-semibold">Dates</p>

        <Calendar
          mode="single"
          selected={dueDateDraft ? new Date(dueDateDraft) : undefined}
          onSelect={(d) => d && setDueDateDraft(d.toISOString().slice(0, 10))}
          className="p-0"
        />

        <div className="flex items-center gap-2">
          <Checkbox checked={useStart} onCheckedChange={(c) => setUseStart(!!c)} id="use-start" />
          <Label htmlFor="use-start" className="text-sm font-normal flex-1">Start date</Label>
          <Input
            type="date"
            value={startDraft}
            onChange={(e) => setStartDraft(e.target.value)}
            disabled={!useStart}
            className="w-[140px] h-8"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox checked={useDue} onCheckedChange={(c) => setUseDue(!!c)} id="use-due" />
          <Label htmlFor="use-due" className="text-sm font-normal flex-1">Due date</Label>
          <Input
            type="date"
            value={dueDateDraft}
            onChange={(e) => setDueDateDraft(e.target.value)}
            disabled={!useDue}
            className="w-[140px] h-8"
          />
        </div>
        {useDue && (
          <Input
            type="time"
            value={dueTimeDraft}
            onChange={(e) => setDueTimeDraft(e.target.value)}
            className="h-8 ml-6 w-[110px]"
          />
        )}

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Recurring</Label>
          <Select value={recurringDraft} onValueChange={setRecurringDraft} disabled={!useDue}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RECURRING_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.value === "monthly" && dueDateDraft
                    ? `Monthly on the ${ordinal(new Date(`${dueDateDraft}T00:00:00`).getDate())}`
                    : o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {recurringDraft === "weekly" && useDue && (
            <div className="flex gap-1 pt-1">
              {DAY_LETTERS.map((letter, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setWeeklyDay(i)}
                  className={cn(
                    "h-7 w-7 rounded-full text-xs font-medium border transition-colors",
                    weeklyDay === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                  aria-label={`Repeat on ${letter}`}
                  aria-pressed={weeklyDay === i}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Set due date reminder</Label>
          <Select value={reminderDraft} onValueChange={setReminderDraft} disabled={!useDue}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REMINDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {(recurringDraft !== "none" || reminderDraft !== "none") && useDue && (
          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2">
            Saved for reference only — recurring cards aren't auto-created and reminders aren't sent yet.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1" size="sm" onClick={save}>Save</Button>
          {(startDate || dueDate) && (
            <Button variant="outline" size="sm" onClick={remove}>Remove</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TaskDatesPopover;
