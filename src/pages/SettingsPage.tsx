import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Settings as SettingsIcon } from "lucide-react";

const DOW = [
  { v: 0, label: "Sun" },
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
];

const SettingsPage = () => {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").limit(1).single().then(({ data }) => setSettings(data));
  }, []);

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

  if (!settings) return <p className="text-muted-foreground">Loading settings...</p>;

  return (
    <div className="grid gap-6 md:grid-cols-2 max-w-5xl">
      <Card>
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
            <Label>Weekend Days</Label>
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

      <Card>
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
            {loading ? "Saving..." : "Save All Settings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
