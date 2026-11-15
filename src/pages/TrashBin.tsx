import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format, differenceInCalendarDays } from "date-fns";
import { RotateCcw, Trash2 } from "lucide-react";
import { PhraseConfirmDialog } from "@/components/PhraseConfirmDialog";
import { TRASH_LABEL, type TrashEntityType } from "@/lib/trash";

type TrashRow = {
  id: string;
  entity_type: TrashEntityType;
  source_table: string;
  original_id: string;
  data: Record<string, any>;
  deleted_by: string;
  deleted_reason: string;
  deleted_at: string;
  expires_at: string;
};

const ENTITY_TABS: TrashEntityType[] = ["overtime", "manual_time", "late_time", "leave", "loan", "expense"];

/** One short line describing the trashed row — pulled straight from its own
 *  jsonb snapshot, same fields each type's own history table already shows. */
const summarize = (row: TrashRow): string => {
  const d = row.data;
  switch (row.entity_type) {
    case "overtime":
      return `${d.requested_hours ?? "?"}h OT on ${d.date ? format(new Date(d.date), "MMM d, yyyy") : "—"}`;
    case "manual_time":
      return `${d.date ? format(new Date(d.date), "MMM d, yyyy") : "—"} — ${Number(d.total_hours ?? 0).toFixed(2)}h total, ${Number(d.overtime_hours ?? 0).toFixed(2)}h OT`;
    case "late_time":
      return `${d.request_type === "office_time_change" ? "Office time change" : "Late adjustment"} for ${d.effective_date ? format(new Date(d.effective_date), "MMM d, yyyy") : "—"}`;
    case "leave":
      return `${d.start_date ?? "—"} → ${d.end_date ?? "—"} (${d.total_days ?? "?"}d)`;
    case "loan":
      return `${Number(d.amount ?? 0).toLocaleString()} loan, ${Number(d.remaining_balance ?? 0).toLocaleString()} remaining`;
    case "expense":
      return `${d.category ?? "Expense"} claim for ${Number(d.amount ?? 0).toLocaleString()}`;
    default:
      return "—";
  }
};

const TrashBin = () => {
  const [rows, setRows] = useState<TrashRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<TrashEntityType>("overtime");
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    // Best-effort purge of anything past its 30-day window — keeps Trash
    // accurate even on a project where the daily pg_cron job isn't enabled.
    await supabase.rpc("purge_expired_trash" as any);
    const { data, error } = await supabase
      .from("trash_bin" as any)
      .select("*")
      .order("deleted_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data || []) as unknown as TrashRow[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.deleted_by).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p) => { map[p.id] = p.full_name || p.email || "Unknown"; });
      setNames(map);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const restore = async (row: TrashRow) => {
    setBusyId(row.id);
    try {
      // The snapshot carries its own id — upserting it back by id either
      // recreates the row (the common case) or, if something else already
      // reused the same id in the meantime, silently re-fills over it,
      // which never happens in practice since ids are UUIDs.
      const { error: insErr } = await supabase.from(row.source_table as any).upsert(row.data as any);
      if (insErr) { toast.error(`Could not restore: ${insErr.message}`); return; }
      const { error: delErr } = await supabase.from("trash_bin" as any).delete().eq("id", row.id);
      if (delErr) { toast.error(delErr.message); return; }
      toast.success("Restored");
      fetchData();
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDelete = async (row: TrashRow) => {
    const { error } = await supabase.from("trash_bin" as any).delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Permanently deleted");
    fetchData();
  };

  const byType = (type: TrashEntityType) => rows.filter((r) => r.entity_type === type);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Trash</CardTitle>
          <CardDescription>
            Deleted Overtime, Manual Time, Late Time, Leave, Loan and Expense history lands here first — restorable for 30 days, then it's gone for good.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TrashEntityType)}>
            <TabsList>
              {ENTITY_TABS.map((t) => (
                <TabsTrigger key={t} value={t}>{TRASH_LABEL[t]} ({byType(t).length})</TabsTrigger>
              ))}
            </TabsList>
            {ENTITY_TABS.map((t) => (
              <TabsContent key={t} value={t}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Details</TableHead>
                      <TableHead>Deleted By</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead>Days Left</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                    ) : byType(t).length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Trash is empty</TableCell></TableRow>
                    ) : byType(t).map((row) => {
                      const daysLeft = Math.max(0, differenceInCalendarDays(new Date(row.expires_at), new Date()));
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm">{summarize(row)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{names[row.deleted_by] || "—"}</TableCell>
                          <TableCell className="max-w-56 truncate text-xs text-muted-foreground">{row.deleted_reason}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{format(new Date(row.deleted_at), "MMM d, yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant={daysLeft <= 3 ? "destructive" : "outline"}>{daysLeft}d</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap space-x-1">
                            <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => restore(row)}>
                              <RotateCcw className="h-4 w-4 mr-1" /> Restore
                            </Button>
                            <PhraseConfirmDialog
                              title="Permanently delete this?"
                              description="This cannot be undone — it will no longer be in Trash to restore."
                              phrase="permanently delete"
                              confirmLabel="Permanently Delete"
                              onConfirm={() => permanentlyDelete(row)}
                              trigger={
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4 mr-1" /> Permanently Delete
                                </Button>
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrashBin;
