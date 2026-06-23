import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScanFace, Fingerprint, Clock, CheckCircle2, Camera } from "lucide-react";
import { toast } from "sonner";

type Phase = "idle" | "scanning" | "verified";

export function AttendancePunchCard({ employeeId = "EMP-1042" }: { employeeId?: string }) {
  const [faceMode, setFaceMode] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lastPunch, setLastPunch] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Manage webcam stream when face mode toggles
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
      } catch {
        toast.error("Camera permission denied — using mock scan");
      }
    }
    if (faceMode) start(); else stop();
    return () => { cancelled = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceMode]);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const punch = () => {
    if (phase !== "idle") return;
    if (!faceMode) {
      const ts = new Date().toLocaleTimeString();
      setLastPunch(ts);
      toast.success(`Punch registered at ${ts}`);
      return;
    }
    setPhase("scanning");
    setTimeout(() => {
      setPhase("verified");
      const ts = new Date().toLocaleTimeString();
      setLastPunch(ts);
      toast.success(`Face Verified · ${employeeId} · ${ts}`, { description: "Synced via API to attendance ledger" });
      setTimeout(() => setPhase("idle"), 2400);
    }, 2000);
  };

  return (
    <Card className="shadow-card border-slate-200 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <Fingerprint className="h-5 w-5 text-emerald-600" /> Attendance Punch Card
            </CardTitle>
            <CardDescription>{employeeId} · {now.toLocaleDateString()}</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums text-slate-800">{now.toLocaleTimeString()}</div>
            {lastPunch && <div className="text-[11px] text-muted-foreground">Last: {lastPunch}</div>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            <ScanFace className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">Enable Face-Recognition Check-In</span>
          </div>
          <Switch checked={faceMode} onCheckedChange={setFaceMode} />
        </div>

        {faceMode && (
          <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 aspect-video">
            <video ref={videoRef} className="w-full h-full object-cover opacity-90" muted playsInline />
            {!streamRef.current && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <Camera className="h-10 w-10 opacity-50" />
              </div>
            )}
            {/* Scan overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-6 border-2 border-emerald-400/70 rounded-lg" />
              <div className="absolute inset-6 overflow-hidden rounded-lg">
                <div className={`absolute left-0 right-0 h-0.5 bg-emerald-400 shadow-[0_0_12px_2px_rgba(16,185,129,0.7)] ${phase === "scanning" ? "animate-[scan_1.5s_linear_infinite]" : "top-1/2"}`} />
              </div>
              <div className="absolute top-2 left-3 text-[10px] font-mono text-emerald-300">
                {phase === "scanning" ? "Scanning Face Geometry…" : phase === "verified" ? "MATCH ✓" : "READY"}
              </div>
              <div className="absolute bottom-2 right-3 text-[10px] font-mono text-slate-300">
                NODE: F18-01 · GAIN: AUTO
              </div>
            </div>
            {phase === "verified" && (
              <div className="absolute inset-0 flex items-center justify-center bg-emerald-600/30 backdrop-blur-sm">
                <div className="flex items-center gap-2 rounded-full bg-emerald-600 text-white px-4 py-2 text-sm font-semibold shadow-lg">
                  <CheckCircle2 className="h-4 w-4" /> Verified · {employeeId}
                </div>
              </div>
            )}
            <style>{`@keyframes scan { 0% { top: 0; } 50% { top: 100%; } 100% { top: 0; } }`}</style>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            onClick={punch}
            disabled={phase === "scanning"}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Clock className="h-4 w-4 mr-1" />
            {phase === "scanning" ? "Verifying…" : faceMode ? "Face Punch" : "Manual Punch"}
          </Button>
          <Badge variant="outline" className="border-slate-300 text-slate-600">
            {faceMode ? "Biometric" : "Manual"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
