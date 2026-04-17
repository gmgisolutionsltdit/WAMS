import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_OPTIONS = [
  "Done",
  "In Progress",
  "Not Started",
  "Waiting for dependent part done",
] as const;

type TaskRow = { task: string; status: string };

const emptyRow = (): TaskRow => ({ task: "", status: "" });

interface DailyWorkLogDialogProps {
  /** Controlled open state. When omitted, the component manages its own state and renders a trigger button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after a successful submit (or skip). Useful for chaining e.g. clock-out flow. */
  onSubmitted?: () => void | Promise<void>;
  /** Custom label for the submit button. */
  submitLabel?: string;
  /** Hide the default trigger button (e.g., when opened programmatically). */
  hideTrigger?: boolean;
  /** Custom title text. */
  title?: string;
  /** Custom description text. */
  description?: string;
}

const DailyWorkLogDialog = ({
  open: controlledOpen,
  onOpenChange,
  onSubmitted,
  submitLabel = "Submit",
  hideTrigger = false,
  title = "Daily Work Log",
  description = "Optionally list what you worked on today. You can submit this blank.",
}: DailyWorkLogDialogProps) => {
  const { user } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const [rows, setRows] = useState<TaskRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const updateRow = (idx: number, patch: Partial<TaskRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (idx: number) =>
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx)));

  const handleSubmit = async () => {
    if (!user) {
      toast.error("You must be signed in to submit a work log");
      return;
    }
    setSubmitting(true);

    // Filter out completely empty rows; allow fully blank submission
    const cleanTasks = rows
      .map((r) => ({ task: r.task.trim(), status: r.status.trim() }))
      .filter((r) => r.task !== "" || r.status !== "");

    const { error } = await supabase.from("daily_work_logs").insert({
      user_id: user.id,
      log_date: format(new Date(), "yyyy-MM-dd"),
      tasks: cleanTasks,
    });

    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (cleanTasks.length > 0) {
      toast.success(`Logged ${cleanTasks.length} task${cleanTasks.length === 1 ? "" : "s"}`);
    }
    setRows([emptyRow()]);
    setOpen(false);
    await onSubmitted?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <ClipboardList className="h-4 w-4 mr-2" />
            Log End of Day Work
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {rows.map((row, idx) => (
            <div
              key={idx}
              className="grid gap-3 md:grid-cols-[1fr_220px_auto] items-start border rounded-md p-3"
            >
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Task #{idx + 1}
                </Label>
                <Textarea
                  placeholder="Describe the work item (optional)"
                  value={row.task}
                  onChange={(e) => updateRow(idx, { task: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={row.status || undefined}
                  onValueChange={(v) => updateRow(idx, { status: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex md:pt-7">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(idx)}
                  aria-label="Remove row"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          <Button type="button" variant="secondary" onClick={addRow} className="w-full">
            <Plus className="h-4 w-4 mr-2" /> Add Another Task
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting ? "Submitting..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DailyWorkLogDialog;
