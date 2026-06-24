import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, Loader2, Inbox } from "lucide-react";

type LogRow = {
  id: string;
  user_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  device_source: string | null;
  face_verified: boolean | null;
  profiles?: { full_name: string | null; email: string | null } | null;
};

export function BiometricLogFeed() {
  const { user, role } = useAuth();
  const isPrivileged = role === "admin" || role === "hr" || role === "manager" || role === "executive" || role === "supervisor";
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const query = supabase
        .from("attendance_logs")
        .select("id, user_id, date, clock_in, clock_out, device_source, face_verified, profiles!attendance_logs_user_id_fkey(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(40);
      const { data, error } = isPrivileged ? await query : await query.eq("user_id", user.id);
      if (error) throw error;
      setLogs((data || []) as unknown as LogRow[]);
    } catch (err) {
      console.error("[BiometricLogFeed] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [user, isPrivileged]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    const ch = supabase
      .channel("biometric-log-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_logs" }, () => fetchLogs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchLogs]);

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-slate-800 text-base">
          <Activity className="h-4 w-4 text-emerald-600 animate-pulse" /> Attendance Ingestion · Live Feed
        </CardTitle>
        <CardDescription>Recent punches from the production attendance ledger</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 rounded-md border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-1">
              <Inbox className="h-6 w-6" />
              <span>No attendance records yet.</span>
            </div>
          ) : (
            logs.map((l) => {
              const ts = l.clock_out ?? l.clock_in ?? `${l.date}T00:00:00`;
              const punch = l.clock_out ? "OUT" : "IN";
              const name = l.profiles?.full_name ?? l.profiles?.email ?? l.user_id.slice(0, 8);
              const verified = !!l.face_verified;
              return (
                <div key={l.id} className="flex items-center gap-2 py-0.5">
                  <span className="text-slate-500">[{new Date(ts).toLocaleTimeString()}]</span>
                  <span className="text-sky-300">{(l.device_source ?? "manual").toUpperCase()}</span>
                  <span className="text-fuchsia-300 truncate max-w-[140px]">{name}</span>
                  <span className="text-emerald-200">PUNCH={punch}</span>
                  <Badge variant="outline" className={`h-4 text-[9px] px-1 ml-auto ${verified ? "border-emerald-400 text-emerald-300" : "border-slate-400 text-slate-300"}`}>
                    {verified ? <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />FACE OK</> : "STANDARD"}
                  </Badge>
                </div>
              );
            })
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
