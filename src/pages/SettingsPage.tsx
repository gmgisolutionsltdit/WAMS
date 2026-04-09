import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const SettingsPage = () => {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("settings").select("*").limit(1).single().then(({ data }) => setSettings(data));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setLoading(true);
    const { error } = await supabase.from("settings").update({
      standard_shift_hours: settings.standard_shift_hours,
      weekday_ot_multiplier: settings.weekday_ot_multiplier,
      weekend_ot_multiplier: settings.weekend_ot_multiplier,
      holiday_ot_multiplier: settings.holiday_ot_multiplier,
    }).eq("id", settings.id);
    if (error) toast.error(error.message);
    else toast.success("Settings saved!");
    setLoading(false);
  };

  if (!settings) return <p className="text-muted-foreground">Loading settings...</p>;

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>System Settings</CardTitle>
        <CardDescription>Configure shift hours and overtime multipliers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Standard Shift Hours</Label>
          <Input type="number" step="0.5" value={settings.standard_shift_hours} onChange={(e) => setSettings({ ...settings, standard_shift_hours: parseFloat(e.target.value) })} />
        </div>
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
          {loading ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default SettingsPage;
