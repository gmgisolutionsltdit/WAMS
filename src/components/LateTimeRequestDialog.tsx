import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock4 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { notifyManagersAndAdmins } from "@/lib/notifications";
import {
  DEFAULT_OFFICE_END, DEFAULT_OFFICE_START, LATE_PENALTY_MINUTES,
  humanMinutes, minOfficeChangeDateISO,
} from "@/lib/officeTime";

interface Props {
  officeStartTime?: string | null;
  officeEndTime?: string | null;
  onSubmitted?: () => void;
}

/**
 * Late Time Request — employees either ask to adjust the 2h40m late penalty for
 * a specific day, or request a permanent change to their approved office time
 * (which must be submitted at least one day in advance).
 */
export const LateTimeRequestDialog = ({ officeStartTime, officeEndTime, onSubmitted }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    request_type: "late_adjustment" as "late_adjustment" | "office_time_change",
    effective_date: format(new Date(), "yyyy-MM-dd"),
    requested_start_time: officeStartTime?.slice(0, 5) || DEFAULT_OFFICE_START,
    requested_end_time: officeEndTime?.slice(0, 5) || DEFAULT_OFFICE_END,
    adjustment_minutes: String(LATE_PENALTY_MINUTES),
    reason: "",
  });

  useEffect(() => {
    setForm((f) => ({
      ...f,
      requested_start_time: officeStartTime?.slice(0, 5) || DEFAULT_OFFICE_START,
      requested_end_time: officeEndTime?.slice(0, 5) || DEFAULT_OFFICE_END,
    }));
  }, [officeStartTime, officeEndTime]);

  const isOfficeChange = form.request_type === "office_time_change";

  const setType = (v: string) => {
    const type = v as "late_adjustment" | "office_time_change";
    setForm((f) => ({
      ...f,
      request_type: type,
      effective_date: type === "office_time_change" ? minOfficeChangeDateISO() : format(new Date(), "yyyy-MM-dd"),
    }));
  };

  const submit = async () => {
    if (!user) return;
    if (!form.reason.trim()) { toast.error("Please add a reason"); return; }
    if (isOfficeChange && form.effective_date <= format(new Date(), "yyyy-MM-dd")) {
      toast.error("Office time changes must be requested at least 1 day in advance");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("late_time_requests").insert({
        user_id: user.id,
        request_type: form.request_type,
        effective_date: form.effective_date,
        requested_start_time: isOfficeChange ? form.requested_start_time : null,
        requested_end_time: isOfficeChange ? form.requested_end_time : null,
        adjustment_minutes: isOfficeChange ? 0 : Math.max(0, parseFloat(form.adjustment_minutes) || 0),
        reason: form.reason.trim(),
      }).select().single();
      if (error) throw error;
      await notifyManagersAndAdmins(
        isOfficeChange ? "Office Time Change Request" : "Late Time Request",
        `${user.email} submitted a ${isOfficeChange ? "office time change" : "late time adjustment"} for ${form.effective_date}.`,
        data?.id,
        { route: "/approvals", type: "late_time_request", requesterId: user.id },
      );
      toast.success("Request submitted for approval");
      setOpen(false);
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Clock4 className="mr-1 h-4 w-4" /> Late Time Request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Late Time Request</DialogTitle>
          <DialogDescription>
            Approved office time: {(officeStartTime || DEFAULT_OFFICE_START).slice(0, 5)}–
            {(officeEndTime || DEFAULT_OFFICE_END).slice(0, 5)}. Arriving more than 11 minutes late adds{" "}
            {humanMinutes(LATE_PENALTY_MINUTES)} of extra required work for that day.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Request Type</Label>
            <Select value={form.request_type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="late_adjustment">Adjust late penalty for a day</SelectItem>
                <SelectItem value="office_time_change">Change approved office time</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isOfficeChange ? "Effective From" : "Date"}</Label>
            <Input
              type="date"
              value={form.effective_date}
              min={isOfficeChange ? minOfficeChangeDateISO() : undefined}
              onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
            />
            {isOfficeChange && (
              <p className="text-xs text-muted-foreground mt-1">Must be at least 1 day in advance.</p>
            )}
          </div>
          {isOfficeChange ? (
            <div className="grid grid-cols-2 gap-4">
              <div><Label>New Start Time</Label><Input type="time" value={form.requested_start_time} onChange={(e) => setForm((f) => ({ ...f, requested_start_time: e.target.value }))} /></div>
              <div><Label>New End Time</Label><Input type="time" value={form.requested_end_time} onChange={(e) => setForm((f) => ({ ...f, requested_end_time: e.target.value }))} /></div>
            </div>
          ) : (
            <div>
              <Label>Extra Work Minutes to Waive</Label>
              <Input
                type="number" min="0" step="10"
                value={form.adjustment_minutes}
                onChange={(e) => setForm((f) => ({ ...f, adjustment_minutes: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Default penalty is {humanMinutes(LATE_PENALTY_MINUTES)} — request all or part of it to be waived.
              </p>
            </div>
          )}
          <div>
            <Label>Reason</Label>
            <Textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          </div>
          <Button onClick={submit} disabled={saving} className="w-full">
            {saving ? "Submitting…" : "Submit Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LateTimeRequestDialog;
