import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2 } from "lucide-react";

type LogEntry = {
  ts: string;
  deviceId: string;
  seq: number;
  userId: string;
  punch: "IN" | "OUT";
  match: boolean;
};

const DEVICES = ["F18-01", "K40-02", "F22-03"];
const USERS = ["EMP-1042", "EMP-1156", "EMP-0987", "EMP-1320", "EMP-0851", "EMP-2204"];

function makeLog(seq: number): LogEntry {
  return {
    ts: new Date().toISOString(),
    deviceId: DEVICES[Math.floor(Math.random() * DEVICES.length)],
    seq,
    userId: USERS[Math.floor(Math.random() * USERS.length)],
    punch: Math.random() > 0.5 ? "IN" : "OUT",
    match: Math.random() > 0.08,
  };
}

export function BiometricLogFeed() {
  const [logs, setLogs] = useState<LogEntry[]>(() =>
    Array.from({ length: 8 }, (_, i) => makeLog(50000 + i))
  );

  useEffect(() => {
    let seq = 50100;
    const t = setInterval(() => {
      setLogs((prev) => [makeLog(seq++), ...prev].slice(0, 40));
    }, 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-slate-800 text-base">
          <Activity className="h-4 w-4 text-emerald-600animate-pulse" /> Biometric Ingestion · Live Feed
        </CardTitle>
        <CardDescription>Real-time mirror of ZKTeco terminal log stream</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 rounded-md border border-slate-200 bg-slate-950 p-3 font-mono text-[11px] text-emerald-300">
          {logs.map((l, i) => (
            <div key={`${l.seq}-${i}`} className="flex items-center gap-2 py-0.5">
              <span className="text-slate-500">[{l.ts.slice(11, 19)}]</span>
              <span className="text-sky-300">DEV={l.deviceId}</span>
              <span className="text-amber-300">SEQ={l.seq}</span>
              <span className="text-fuchsia-300">UID={l.userId}</span>
              <span className="text-emerald-200">PUNCH={l.punch}</span>
              <Badge variant="outline" className={`h-4 text-[9px] px-1 ml-auto ${l.match ? "border-emerald-400 text-emerald-300" : "border-red-400 text-red-300"}`}>
                {l.match ? <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />MATCH OK</> : "NO MATCH"}
              </Badge>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
