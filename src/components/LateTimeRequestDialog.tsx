import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format } from "date-fns";
import { notifyManagersAndAdmins } from "@/lib/notifications";
import { DEFAULT_OFFICE_END, DEFAULT_OFFICE_START, LATE_PENALTY_MINUTES, humanMinutes } from "@/lib/officeTime";

interface Props {
  officeStartTime?: string | null;
  officeEndTime?: string | null;
  onSubmitted?: () => void;
}

/**
 * Change Approved Office Time — shown as an inline section (not a dialog) on
 * the Requests tab so the form is visible without an extra click.
 */
export const LateTimeRequestDialog = ({ officeStartTime, officeEndTime, onSubmitted }: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    effective_date: format(new Date(), "yyyy-MM-dd"),
    requested_start_time: officeStartTime?.slice(0, 5) || DEFAULT_OFFICE_START,
    requested_end_time: officeEndTime?.slice(0, 5) || DEFAULT_OFFICE_END,
    reason: "",
  });

  useEffect(() => {
    setForm((f) => ({
      ...f,
      requested_start_time: officeStartTime?.slice(0, 5) || DEFAULT_OFFICE_START,
      requested_end_time: officeEndTime?.slice(0, 5) || DEFAULT_OFFICE_END,
    }));
  }, [officeStartTime, officeEndTime]);

  const submit = async () => {
    if (!user) return;
    if (!form.reason.trim()) { toast.error("Please add a reason"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from("late_time_requests").insert({
        user_id: user.id,
        request_type: "office_time_change",
        effective_date: form.effective_date,
        requested_start_time: form.requested_start_time,
        requested_end_time: form.requested_end_time,
        adjustment_minutes: 0,
        reason: form.reason.trim(),
      }).select().single();
      if (error) throw error;
      await notifyManagersAndAdmins(
        "Office Time Change Request",
        `${user.email} submitted an office time change for ${form.effective_date}.`,
        data?.id,
        { route: "/approvals", type: "late_time_request", requesterId: user.id },
      );
      toast.success("Request submitted for approval");
      setForm((f) => ({ ...f, reason: "" }));
      onSubmitted?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit request");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Approved Office Time</CardTitle>
        <CardDescription>
          Approved office time: {(officeStartTime || DEFAULT_OFFICE_START).slice(0, 5)}–
          {(officeEndTime || DEFAULT_OFFICE_END).slice(0, 5)}. Arriving more than 11 minutes late adds{" "}
          {humanMinutes(LATE_PENALTY_MINUTES)} of extra required work for that day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Effective From</Label>
          <Input
            type="date"
            value={form.effective_date}
            onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>New Start Time</Label><Input type="time" value={form.requested_start_time} onChange={(e) => setForm((f) => ({ ...f, requested_start_time: e.target.value }))} /></div>
          <div><Label>New End Time</Label><Input type="time" value={form.requested_end_time} onChange={(e) => setForm((f) => ({ ...f, requested_end_time: e.target.value }))} /></div>
        </div>
        <div>
          <Label>Reason</Label>
          <Textarea rows={3} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
        <Button onClick={submit} disabled={saving} className="w-full">
          {saving ? "Submitting…" : "Submit Request"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default LateTimeRequestDialog;
