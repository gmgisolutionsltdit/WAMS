import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { min48hDateISO, isWithin48h, RETRO_LOCK_MESSAGE } from "@/lib/dateRules";
import { notifyManagersAndAdmins } from "@/lib/notifications";
import { computeDailyTotals } from "@/lib/workSchedule";
import { DEFAULT_OFFICE_END, DEFAULT_OFFICE_START, humanMinutes, timeToMinutes } from "@/lib/officeTime";

const localToday = () => format(new Date(), "yyyy-MM-dd");

type FormState = {
  employee_email: string;
  date: string;
  clock_in: string;
  clock_out: string;
  due_hours: string;
  break_minutes: string;
  overtime_hours: string;
  task_id: string;
  task_note: string;
  gmgi_task: string;
  gm_task: string;
  gmgi_time: string;
  gm_time: string;
  reason: string;
};

const defaultForm: FormState = {
  employee_email: "",
  date: localToday(),
  clock_in: "09:00",
  clock_out: "17:00",
  due_hours: "8",
  break_minutes: "60",
  overtime_hours: "",
  task_id: "none",
  task_note: "",
  gmgi_task: "",
  gm_task: "",
  gmgi_time: "",
  gm_time: "",
  reason: "",
};

interface Props {
  onSubmitted?: () => void;
  /** Custom open trigger — defaults to the "+ Manual Entry" button. */
  trigger?: ReactNode;
  /** Pre-fills the form, e.g. when correcting an existing attendance day. */
  initial?: Partial<FormState>;
  /**
   * attendance_logs row this edit replaces. Once the correction is applied
   * (immediately for an admin, on approval otherwise) that row is deleted,
   * so editing a session no longer leaves the old, wrong punch behind it.
   */
  supersedesLogId?: string;
}

/**
 * Manual time entry available to every employee.
 * Employees submit a request routed to their reporting manager (or an admin);
 * admins can record the entry for any employee and it is applied immediately.
 */
export const ManualTimeEntryDialog = ({ onSubmitted, trigger, initial, supersedesLogId }: Props) => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const isEdit = !!initial;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({ ...defaultForm, ...initial });
  const [officeWindow, setOfficeWindow] = useState({ start: DEFAULT_OFFICE_START, end: DEFAULT_OFFICE_END });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("office_start_time, office_end_time, standard_daily_hours, unpaid_break_minutes")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setOfficeWindow({
          start: data.office_start_time?.slice(0, 5) || DEFAULT_OFFICE_START,
          end: data.office_end_time?.slice(0, 5) || DEFAULT_OFFICE_END,
        });
        // An edit prefill already carries the real figures for that day; the
        // schedule defaults would otherwise clobber them on mount.
        if (isEdit) return;
        setForm((f) => ({
          ...f,
          due_hours: String(Number(data.standard_daily_hours) || 8),
          break_minutes: String(Number(data.unpaid_break_minutes) ?? 60),
        }));
      }
    })();
  }, [user]);

  // Remaining office time is settled directly from this entry's clock-in and
  // clock-out — the portion of this employee's own office window (set on the
  // Employees page) that this manual entry does not cover.
  const remainingOfficeMinutes = useMemo(() => {
    const windowMinutes = Math.max(0, timeToMinutes(officeWindow.end) - timeToMinutes(officeWindow.start));
    const [ih, im] = form.clock_in.split(":").map(Number);
    const [oh, om] = form.clock_out.split(":").map(Number);
    if ([ih, im, oh, om].some((n) => Number.isNaN(n))) return windowMinutes;
    let usedMinutes = (oh * 60 + om) - (ih * 60 + im);
    if (usedMinutes < 0) usedMinutes += 24 * 60;
    return Math.max(0, windowMinutes - usedMinutes);
  }, [form.clock_in, form.clock_out, officeWindow]);

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
      // The break minutes typed here are the actual break taken, not an
      // estimate — a manual entry should never pad a short break up to the
      // scheduled hour and dock the employee for time they did work.
      useActualBreak: true,
    });
    const ot = form.overtime_hours.trim() !== ""
      ? parseFloat(form.overtime_hours) || 0
      : totals.overtimeHours;
    return {
      inT, outT,
      breakMins: totals.breakMinutes,
      dueHours,
      total: totals.totalHours,
      autoOt: totals.overtimeHours,
      ot,
    };
  }, [form]);

  const gmgiTime = Math.max(0, parseFloat(form.gmgi_time) || 0);
  const gmTime = Math.max(0, parseFloat(form.gm_time) || 0);
  const taskTimeTotal = Math.round((gmgiTime + gmTime) * 100) / 100;
  const taskTimeExceedsDuration = taskTimeTotal > computed.total;

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
    if (taskTimeExceedsDuration) {
      toast.error("GMGI Time + GM Time cannot exceed the entry's duration");
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
        task_id: null,
        task_note: form.task_note.trim() || null,
        gmgi_task: form.gmgi_task.trim() || null,
        gm_task: form.gm_task.trim() || null,
        gmgi_time: gmgiTime,
        gm_time: gmTime,
        reason: form.reason.trim() || null,
        supersedes_log_id: supersedesLogId || null,
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
        {trigger ?? <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Manual Entry</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Correct Attendance Entry" : "Manual Time Entry"}</DialogTitle>
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
          <p className="text-xs text-muted-foreground -mt-2">
            Remaining Office Time: <span className="font-mono">{humanMinutes(remainingOfficeMinutes)}</span>{" "}
            of the {officeWindow.start}–{officeWindow.end} office window, settled from this entry's clock in/out.
          </p>
          <div>
            <Label>Break Time (minutes)</Label>
            <Input type="number" step="5" min="0" value={form.break_minutes} onChange={(e) => setForm((f) => ({ ...f, break_minutes: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <Label>GMGI Task</Label>
                <Input
                  placeholder="What GMGI work was done?"
                  value={form.gmgi_task}
                  onChange={(e) => setForm((f) => ({ ...f, gmgi_task: e.target.value }))}
                />
              </div>
              <div>
                <Label>GM Task</Label>
                <Input
                  placeholder="What GM work was done?"
                  value={form.gm_task}
                  onChange={(e) => setForm((f) => ({ ...f, gm_task: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label>GMGI Time (hours)</Label>
                <Input
                  type="number" step="0.25" min="0"
                  value={form.gmgi_time}
                  onChange={(e) => setForm((f) => ({ ...f, gmgi_time: e.target.value }))}
                />
              </div>
              <div>
                <Label>GM Time (hours)</Label>
                <Input
                  type="number" step="0.25" min="0"
                  value={form.gm_time}
                  onChange={(e) => setForm((f) => ({ ...f, gm_time: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <p className={`text-xs -mt-2 ${taskTimeExceedsDuration ? "text-destructive" : "text-muted-foreground"}`}>
            Total time: {taskTimeTotal}h (GMGI + GM) — must be ≤ duration ({computed.total}h)
          </p>
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
