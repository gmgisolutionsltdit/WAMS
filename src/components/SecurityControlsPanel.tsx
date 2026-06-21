import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Fingerprint, Globe, ScanFace, RefreshCw } from "lucide-react";
import { format, subMinutes } from "date-fns";

interface Props {
  faceRecognition: boolean;
  onToggleFace: (v: boolean) => void;
  ipWhitelistOk?: boolean;
}

const SecurityControlsPanel = ({ faceRecognition, onToggleFace, ipWhitelistOk = true }: Props) => {
  const [ip, setIp] = useState<string>("…");
  const [syncLogs, setSyncLogs] = useState<Array<{ time: Date; device: string; status: string }>>([]);

  useEffect(() => {
    fetch("https://api.ipify.org?format=json").then(r => r.json()).then(d => setIp(d.ip)).catch(()=>setIp("unknown"));
    // simulate biometric ingestion log entries
    const now = new Date();
    setSyncLogs([
      { time: subMinutes(now, 2), device: "ZKTeco K40 — Gate A", status: "synced" },
      { time: subMinutes(now, 15), device: "ZKTeco SpeedFace — Reception", status: "synced" },
      { time: subMinutes(now, 47), device: "ZKTeco K40 — Gate B", status: "synced" },
      { time: subMinutes(now, 92), device: "ZKTeco SpeedFace — Floor 3", status: "synced" },
    ]);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-primary" />Security Controls</CardTitle>
        <CardDescription>Verify identity and source before logging attendance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <ScanFace className="h-4 w-4 text-primary" />
            <div>
              <Label className="text-sm">Face Recognition</Label>
              <p className="text-xs text-muted-foreground">Require webcam face match on check-in</p>
            </div>
          </div>
          <Switch checked={faceRecognition} onCheckedChange={onToggleFace} />
        </div>

        <div className="flex items-center justify-between border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <div>
              <Label className="text-sm">IP Whitelist Check</Label>
              <p className="text-xs text-muted-foreground">Current IP: <span className="font-mono">{ip}</span></p>
            </div>
          </div>
          {ipWhitelistOk ? <Badge className="bg-success text-white">Allowed</Badge> : <Badge variant="destructive">Blocked</Badge>}
        </div>

        <div className="border rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4 text-primary" />
              <Label className="text-sm">Biometric Ingestion Log</Label>
            </div>
            <Badge variant="outline" className="text-xs"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Live sync</Badge>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {syncLogs.map((l, i) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b last:border-b-0">
                <span className="truncate">{l.device}</span>
                <span className="text-muted-foreground shrink-0 ml-2">{format(l.time, "HH:mm")} · <span className="text-success">{l.status}</span></span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SecurityControlsPanel;
