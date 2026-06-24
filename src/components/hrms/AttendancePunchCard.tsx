import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScanFace, Fingerprint, Clock, CheckCircle2, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type AttendanceRow = {
  id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  face_verified: boolean | null;
};

export function AttendancePunchCard() {
  const { user, profile } = useAuth();
  const [faceMode, setFaceMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [now, setNow] = useState(new Date());
  const [todayLog, setTodayLog] = useState<AttendanceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");

  const fetchToday = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("attendance_logs")
        .select("id, date, clock_in, clock_out, face_verified")
        .eq("user_id", user.id)
        .eq("date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setTodayLog(data as AttendanceRow | null);
    } catch (err) {
      console.error("[AttendancePunchCard] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [user, today]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
      } catch {
        toast.error("Camera permission denied");
        setFaceMode(false);
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

  const punch = async () => {
    if (!user) { toast.error("Not authenticated"); return; }
    if (busy) return;

    const doPunch = async () => {
      setBusy(true);
      try {
        const nowIso = new Date().toISOString();
        const isClockIn = !todayLog || (todayLog.clock_in && todayLog.clock_out);
        if (isClockIn) {
          const { data, error } = await supabase
            .from("attendance_logs")
            .insert({
              user_id: user.id,
              date: today,
              clock_in: nowIso,
              face_verified: faceMode,
              device_source: faceMode ? "biometric" : "manual",
            })
            .select()
            .single();
          if (error) throw error;
          setTodayLog(data as AttendanceRow);
          toast.success(`Clocked in at ${format(new Date(nowIso), "HH:mm:ss")}`);
        } else if (todayLog && todayLog.clock_in && !todayLog.clock_out) {
          const totalHours = (new Date(nowIso).getTime() - new Date(todayLog.clock_in).getTime()) / 3_600_000;
          const { data, error } = await supabase
            .from("attendance_logs")
            .update({ clock_out: nowIso, total_hours: Math.round(totalHours * 100) / 100 })
            .eq("id", todayLog.id)
            .select()
            .single();
          if (error) throw error;
          setTodayLog(data as AttendanceRow);
          toast.success(`Clocked out at ${format(new Date(nowIso), "HH:mm:ss")}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Punch failed";
        console.error("[AttendancePunchCard] punch failed", err);
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    };

    if (faceMode) {
      setScanning(true);
      setTimeout(async () => {
        setScanning(false);
        await doPunch();
      }, 1600);
    } else {
      await doPunch();
    }
  };

  const isOpen = !!(todayLog?.clock_in && !todayLog?.clock_out);
  const buttonLabel = busy ? "Saving…" : scanning ? "Verifying…" : isOpen ? "Clock Out" : "Clock In";

  return (
    <Card className="shadow-card border-slate-200 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <Fingerprint className="h-5 w-5 text-emerald-600" /> Attendance Punch Card
            </CardTitle>
            <CardDescription>{profile.full_name ?? user?.email ?? "Employee"} · {now.toLocaleDateString()}</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums text-slate-800">{now.toLocaleTimeString()}</div>
            {loading ? (
              <div className="text-[11px] text-muted-foreground flex items-center justify-end gap-1"><Loader2 className="h-3 w-3 animate-spin" /> loading</div>
            ) : todayLog?.clock_in ? (
              <div className="text-[11px] text-muted-foreground">
                In: {format(new Date(todayLog.clock_in), "HH:mm")}{todayLog.clock_out ? ` · Out: ${format(new Date(todayLog.clock_out), "HH:mm")}` : ""}
              </div>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            <ScanFace className="h-4 w-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">Face-Recognition Check-In</span>
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
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-6 border-2 border-emerald-400/70 rounded-lg" />
              <div className="absolute inset-6 overflow-hidden rounded-lg">
                <div className={`absolute left-0 right-0 h-0.5 bg-emerald-400 shadow-[0_0_12px_2px_rgba(16,185,129,0.7)] ${scanning ? "animate-[scan_1.5s_linear_infinite]" : "top-1/2"}`} />
              </div>
              <div className="absolute top-2 left-3 text-[10px] font-mono text-emerald-300">
                {scanning ? "Scanning Face Geometry…" : "READY"}
              </div>
            </div>
            <style>{`@keyframes scan { 0% { top: 0; } 50% { top: 100%; } 100% { top: 0; } }`}</style>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={punch} disabled={busy || scanning || loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
            {busy || scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : isOpen ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <Clock className="h-4 w-4 mr-1" />}
            {buttonLabel}
          </Button>
          <Badge variant="outline" className="border-slate-300 text-slate-600">
            {faceMode ? "Biometric" : "Manual"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
