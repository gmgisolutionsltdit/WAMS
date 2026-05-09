import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings as SettingsIcon, CalendarHeart } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const DOW = [
  { v: 0, label: "Sun" },
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
];

type LeaveType = {
  id: string; name: string; code: string; color: string;
  annual_quota: number; half_day_allowed: boolean; is_paid: boolean; active: boolean;
  sandwich_leave: boolean;
};

const SettingsPage = () => {
  const [settings, setSettings] = useState<any>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingLeave, setSavingLeave] = useState(false);

  const fetchSettings = useCallback(async () => {
    const { data } = await supabase.from("settings").select("*").limit(1).single();
    setSettings(data);
  }, []);

  const fetchLeaveTypes = useCallback(async () => {
    const { data } = await supabase.from("leave_types").select("*").order("name");
    setLeaveTypes((data || []) as LeaveType[]);
  }, []);

  useEffect(() => { fetchSettings(); fetchLeaveTypes(); }, [fetchSettings, fetchLeaveTypes]);
  useRealtimeSubscription("leave_types", fetchLeaveTypes, "settings-leave-types");

  const toggleWeekend = (v: number) => {
    const cur: number[] = settings.weekend_days || [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort();
    setSettings({ ...settings, weekend_days: next });
  };

  const handleSave = async () => {
    if (!settings) return;
    setLoading(true);
    const { error } = await supabase.from("settings").update({
      standard_shift_hours: settings.standard_shift_hours,
      weekday_ot_multiplier: settings.weekday_ot_multiplier,
      weekend_ot_multiplier: settings.weekend_ot_multiplier,
      holiday_ot_multiplier: settings.holiday_ot_multiplier,
      office_start_time: settings.office_start_time,
      office_end_time: settings.office_end_time,
      weekend_days: settings.weekend_days,
    }).eq("id", settings.id);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
    setLoading(false);
  };

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
      }).eq("id", lt.id)
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) toast.error(firstErr.error.message);
    else toast.success("Leave defaults updated");
    setSavingLeave(false);
  };

  if (!settings) return <p className="text-muted-foreground">Loading settings...</p>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><SettingsIcon className="h-5 w-5" /> Office Hours</CardTitle>
            <CardDescription>Standard working schedule used for OT calculations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Office Start</Label>
                <Input type="time" value={settings.office_start_time?.slice(0, 5) || "09:00"} onChange={(e) => setSettings({ ...settings, office_start_time: e.target.value + ":00" })} />
              </div>
              <div className="space-y-2">
                <Label>Office End</Label>
                <Input type="time" value={settings.office_end_time?.slice(0, 5) || "17:00"} onChange={(e) => setSettings({ ...settings, office_end_time: e.target.value + ":00" })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Standard Shift Hours</Label>
              <Input type="number" step="0.5" value={settings.standard_shift_hours} onChange={(e) => setSettings({ ...settings, standard_shift_hours: parseFloat(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Weekend Days <span className="text-xs text-muted-foreground">(excluded from leave & OT calculations)</span></Label>
              <div className="flex flex-wrap gap-3">
                {DOW.map((d) => (
                  <label key={d.v} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={(settings.weekend_days || []).includes(d.v)} onCheckedChange={() => toggleWeekend(d.v)} />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>OT Multipliers</CardTitle>
            <CardDescription>Pay-rate multipliers applied to overtime hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Weekday OT Multiplier</Label>
              <Input type="number" step="0.1" value={settings.weekday_ot_multiplier} onChange={(e) => setSettings({ ...settings, weekday_ot_multiplier: parseFloat(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Weekend OT Multiplier</Label>
              <Input type="number" step="0.1" value={settings.weekend_ot_multiplier} onChange={(e) => setSettings({ ...settings, weekend_ot_multiplier: parseFloat(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Holiday OT Multiplier</Label>
              <Input type="number" step="0.1" value={settings.holiday_ot_multiplier} onChange={(e) => setSettings({ ...settings, holiday_ot_multiplier: parseFloat(e.target.value) })} />
            </div>
            <Button onClick={handleSave} disabled={loading} className="w-full">
              {loading ? "Saving..." : "Save Office & OT Settings"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarHeart className="h-5 w-5" /> Leave Defaults</CardTitle>
          <CardDescription>Set the default annual quota for each leave type. Weekends and holidays are automatically excluded.</CardDescription>
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
                <div className="md:col-span-3 flex items-center gap-2">
                  <Switch checked={lt.half_day_allowed} onCheckedChange={(v) => updateLeaveType(lt.id, { half_day_allowed: v })} />
                  <Label className="text-xs">Half-day allowed</Label>
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
