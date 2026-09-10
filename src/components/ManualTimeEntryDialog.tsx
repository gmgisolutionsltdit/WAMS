import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { min48hDateISO, isWithin48h, RETRO_LOCK_MESSAGE } from "@/lib/dateRules";
import { notifyManagersAndAdmins } from "@/lib/notifications";
import { computeDailyTotals } from "@/lib/workSchedule";

const localToday = () => format(new Date(), "yyyy-MM-dd");

interface Props {
  onSubmitted?: () => void;
}

/**
 * Manual time entry available to every employee.
 * Employees submit a request routed to their reporting manager (or an admin);
 * admins can record the entry for any employee and it is applied immediately.
 */
export const ManualTimeEntryDialog = ({ onSubmitted }: Props) => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);
  const [form, setForm] = useState({
    employee_email: "",
    date: localToday(),
    clock_in: "09:00",
    clock_out: "17:00",
    due_hours: "8",
    break_minutes: "60",
    overtime_hours: "",
    task_id: "none",
    task_note: "",
    reason: "",
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("settings").select("standard_shift_hours, break_allowance_minutes").limit(1).maybeSingle();
      if (data) {
        setForm((f) => ({
          ...f,
          due_hours: String(Number(data.standard_shift_hours) || 8),
          break_minutes: String(Number(data.break_allowance_minutes) || 60),
        }));
      }
    })();
  }, []);

  useEffect(() => {
    if (!user || !open) return;
    supabase
      .from("tasks")
      .select("id, title")
      .or(`assignee_id.eq.${user.id},reporter_id.eq.${user.id}`)
      .neq("status", "done")
      .order("updated_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setTasks((data || []) as any));
  }, [user, open]);

  const computed = useMemo(() => {
    const inT = new Date(`${form.date}T${form.clock_in}:00`);
    const outT = new Date(`${form.date}T${form.clock_out}:00`);
    const breakMins = Math.max(0, parseFloat(form.break_minutes) || 0);
    const dueHours = Math.max(0, parseFloat(form.due_hours) || 0);
    const totals = computeDailyTotals({
      clockIn: inT,
      clockOut: outT,
      breakMinutes: breakMins,
      schedule: dueHours > 0 ? { standard_daily_hours: dueHours } : null,
    });
    const ot = form.overtime_hours.trim() !== ""
      ? parseFloat(form.overtime_hours) || 0
      : totals.overtimeHours;
    return { inT, outT, breakMins: totals.breakMinutes, dueHours, total: totals.totalHours, ot };
  }, [form]);

  const submit = async () => {
    if (!user) return;
    if (!isAdmin && !isWithin48h(form.date)) {
      toast.error(RETRO_LOCK_MESSAGE);
      return;
    }
    if (computed.outT <= computed.inT) {
      toast.error("Clock out must be after clock in");
      return;
    }
    if (!form.task_note.trim() && form.task_id === "none") {
      toast.error("Select or describe the task for this time entry");
      return;
    }
    setSaving(true);
    try {
      let targetUser = user.id;
      if (isAdmin && form.employee_email.trim()) {
        const { data: profile } = await supabase
          .from("profiles").select("id").eq("email", form.employee_email.trim()).maybeSingle();
        if (!profile) { toast.error("Employee not found"); setSaving(false); return; }
        targetUser = profile.id;
      }

      const payload = {
        user_id: targetUser,
        date: form.date,
        clock_in: computed.inT.toISOString(),
        clock_out: computed.outT.toISOString(),
        break_minutes: computed.breakMins,
        due_hours: computed.dueHours,
        total_hours: computed.total,
        overtime_hours: computed.ot,
        task_id: form.task_id === "none" ? null : form.task_id,
        task_note: form.task_note.trim() || null,
        reason: form.reason.trim() || null,
      };

      const { data: inserted, error } = await supabase
        .from("manual_time_requests").insert(payload).select().single();
      if (error) throw error;

      if (isAdmin) {
        // Admin entries are self-approved and applied to attendance immediately.
        const { error: appErr } = await supabase
          .from("manual_time_requests")
          .update({ status: "approved", approved_by: user.id })
          .eq("id", inserted.id);
        if (appErr) throw appErr;
        toast.success("Manual entry recorded and applied");
      } else {
        await notifyManagersAndAdmins(
          "Manual Time Entry Request",
          `${user.email} submitted a manual time entry for ${form.date} (${computed.total}h).`,
          inserted.id,
          { route: "/approvals", type: "manual_time_request", requesterId: user.id },
        );
        toast.success("Manual entry submitted for approval");
      }
      setOpen(false);
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit manual entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Manual Entry</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manual Time Entry</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Recorded immediately as an admin-approved entry."
              : "Sent to your reporting manager (or an admin) for approval before it appears in your attendance."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isAdmin && (
            <div>
              <Label>Employee Email</Label>
              <Input
                value={form.employee_email}
                onChange={(e) => setForm((f) => ({ ...f, employee_email: e.target.value }))}
                placeholder="Leave blank for yourself"
              />
            </div>
          )}
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={form.date}
              min={isAdmin ? undefined : min48hDateISO()}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            {!isAdmin && <p className="text-xs text-muted-foreground mt-1">{RETRO_LOCK_MESSAGE}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Clock In</Label><Input type="time" value={form.clock_in} onChange={(e) => setForm((f) => ({ ...f, clock_in: e.target.value }))} /></div>
            <div><Label>Clock Out</Label><Input type="time" value={form.clock_out} onChange={(e) => setForm((f) => ({ ...f, clock_out: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Due Time (hours)</Label><Input type="number" step="0.5" min="0" value={form.due_hours} onChange={(e) => setForm((f) => ({ ...f, due_hours: e.target.value }))} /></div>
            <div><Label>Break Time (minutes)</Label><Input type="number" step="5" min="0" value={form.break_minutes} onChange={(e) => setForm((f) => ({ ...f, break_minutes: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Task</Label>
            <Select value={form.task_id} onValueChange={(v) => setForm((f) => ({ ...f, task_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select a task" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No linked task</SelectItem>
                {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              className="mt-2"
              placeholder="Task description (required if no task selected)"
              value={form.task_note}
              onChange={(e) => setForm((f) => ({ ...f, task_note: e.target.value }))}
            />
          </div>
          <div>
            <Label>Overtime Hours</Label>
            <Input type="number" step="0.5" value={form.overtime_hours} onChange={(e) => setForm((f) => ({ ...f, overtime_hours: e.target.value }))} placeholder="Blank = auto-calculate" />
            <p className="text-xs text-muted-foreground mt-1">
              Worked: {computed.total}h · Auto overtime: {Math.max(0, Math.round((computed.total - computed.dueHours) * 100) / 100)}h
            </p>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why is this entry being added manually?" />
          </div>
          <Button onClick={submit} disabled={saving} className="w-full">
            {saving ? "Submitting…" : isAdmin ? "Add Entry" : "Submit for Approval"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManualTimeEntryDialog;
