import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CalendarHeart } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

type LeaveType = {
  id: string; name: string; code: string; color: string;
  annual_quota: number; half_day_allowed: boolean; is_paid: boolean; active: boolean;
  sandwich_leave: boolean;
};

const SettingsPage = () => {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [savingLeave, setSavingLeave] = useState(false);

  const fetchLeaveTypes = useCallback(async () => {
    const { data } = await supabase.from("leave_types").select("*").order("name");
    setLeaveTypes((data || []) as LeaveType[]);
  }, []);

  useEffect(() => { fetchLeaveTypes(); }, [fetchLeaveTypes]);
  useRealtimeSubscription("leave_types", fetchLeaveTypes, "settings-leave-types");

  const updateLeaveType = (id: string, patch: Partial<LeaveType>) => {
    setLeaveTypes((prev) => prev.map((lt) => (lt.id === id ? { ...lt, ...patch } : lt)));
  };

  const saveLeaveDefaults = async () => {
    setSavingLeave(true);
    const updates = leaveTypes.map((lt) =>
      supabase.from("leave_types").update({
        annual_quota: Number(lt.annual_quota) || 0,
        half_day_allowed: lt.half_day_allowed,
        is_paid: lt.is_paid,
        color: lt.color,
        sandwich_leave: lt.sandwich_leave,
      }).eq("id", lt.id)
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) toast.error(firstErr.error.message);
    else toast.success("Leave defaults updated");
    setSavingLeave(false);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarHeart className="h-5 w-5" /> Leave Defaults</CardTitle>
          <CardDescription>
            Set the default annual quota for each leave type. Office hours, shift length, break allowance and
            working days are configured per employee on the Employees page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {leaveTypes.map((lt) => (
              <div key={lt.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center rounded-lg border p-3 bg-card">
                <div className="md:col-span-4 flex items-center gap-3">
                  <input
                    type="color"
                    value={lt.color}
                    onChange={(e) => updateLeaveType(lt.id, { color: e.target.value })}
                    className="h-8 w-8 rounded border cursor-pointer"
                  />
                  <div>
                    <div className="font-medium text-sm">{lt.name}</div>
                    <div className="text-xs text-muted-foreground">{lt.code}</div>
                  </div>
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs">Annual Quota (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={lt.annual_quota}
                    onChange={(e) => updateLeaveType(lt.id, { annual_quota: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Switch checked={lt.is_paid} onCheckedChange={(v) => updateLeaveType(lt.id, { is_paid: v })} />
                  <Label className="text-xs">Paid</Label>
                </div>
                <div className="md:col-span-2 flex items-center gap-2">
                  <Switch checked={lt.half_day_allowed} onCheckedChange={(v) => updateLeaveType(lt.id, { half_day_allowed: v })} />
                  <Label className="text-xs">Half-day</Label>
                </div>
                <div className="md:col-span-1 flex items-center gap-2" title="Charge weekends/holidays adjacent (either side) to leave days">
                  <Switch checked={!!lt.sandwich_leave} onCheckedChange={(v) => updateLeaveType(lt.id, { sandwich_leave: v })} />
                  <Label className="text-xs">Sandwich</Label>
                </div>
              </div>
            ))}
          </div>
          <Button onClick={saveLeaveDefaults} disabled={savingLeave}>
            {savingLeave ? "Saving..." : "Save Leave Defaults"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
