import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarClock } from "lucide-react";

const RECURRING_OPTIONS = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const REMINDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "at_time", label: "At time of due date" },
  { value: "10_min_before", label: "10 minutes before" },
  { value: "1_hour_before", label: "1 hour before" },
  { value: "1_day_before", label: "1 day before" },
  { value: "2_days_before", label: "2 days before" },
];

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
  const [recurringDraft, setRecurringDraft] = useState(recurring || "none");
  const [reminderDraft, setReminderDraft] = useState(reminder || "none");

  const openChange = (o: boolean) => {
    if (o) {
      setUseStart(!!startDate);
      setUseDue(!!dueDate);
      setStartDraft(startDate ? startDate.slice(0, 10) : "");
      const s = splitDateTime(dueDate);
      setDueDateDraft(s.date);
      setDueTimeDraft(s.time || "17:00");
      setRecurringDraft(recurring || "none");
      setReminderDraft(reminder || "none");
    }
    setOpen(o);
  };

  const save = () => {
    onSave({
      start_date: useStart && startDraft ? startDraft : null,
      due_date: useDue ? joinDateTime(dueDateDraft, dueTimeDraft) : null,
      recurring: useDue && recurringDraft !== "none" ? recurringDraft : null,
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
              {RECURRING_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
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
