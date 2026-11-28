import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { KanbanTask } from "@/components/kanban/KanbanCard";

type BoardOption = { id: string; name: string };
type ColumnOption = { id: string; name: string; status: string };

interface Props {
  task: KanbanTask | null;
  /** The task's current board, i.e. projects.id (what the Tasks list calls a "board"). */
  currentProjectId: string;
  /** The task's current task_boards.id (projects : task_boards is 1:1 today). */
  currentTaskBoardId: string;
  onClose: () => void;
  onCopied: () => void;
}

/** Trello's "Copy card" dialog, Board tab only — WAMS has no equivalent to
 * Trello's personal "Inbox" tab, same scope decision as MoveCardDialog. */
export const CopyCardDialog = ({ task, currentProjectId, currentTaskBoardId, onClose, onCopied }: Props) => {
  const [name, setName] = useState("");
  const [keepLabels, setKeepLabels] = useState(true);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [boardId, setBoardId] = useState(currentProjectId);
  const [columns, setColumns] = useState<ColumnOption[]>([]);
  const [columnId, setColumnId] = useState("");
  const [taskBoardId, setTaskBoardId] = useState(currentTaskBoardId);
  const [columnTaskCount, setColumnTaskCount] = useState(0);
  const [position, setPosition] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return;
    setName(`${task.title} (copy)`);
    setKeepLabels(true);
    setBoardId(currentProjectId);
    setColumnId(task.column_id || "");
    setTaskBoardId(currentTaskBoardId);
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").eq("archived", false).order("name");
      setBoards((data || []) as BoardOption[]);
    })();
  }, [task, currentProjectId, currentTaskBoardId]);

  useEffect(() => {
    if (!task || !boardId) return;
    (async () => {
      const { data: boardRow } = await supabase.from("task_boards").select("id").eq("project_id", boardId).maybeSingle();
      const tbId = boardRow?.id;
      if (!tbId) { setColumns([]); return; }
      setTaskBoardId(tbId);
      const { data: cols } = await supabase.from("task_columns").select("id, name, status").eq("board_id", tbId).eq("archived", false).order("position");
      setColumns((cols || []) as ColumnOption[]);
      const defaultCol = boardId === currentProjectId ? task.column_id : cols?.[0]?.id;
      setColumnId(defaultCol || cols?.[0]?.id || "");
    })();
  }, [task, boardId, currentProjectId]);

  useEffect(() => {
    if (!columnId) { setColumnTaskCount(0); return; }
    (async () => {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("column_id", columnId)
        .eq("archived", false);
      const n = count || 0;
      setColumnTaskCount(n);
      // Default to right after the source card when copying within its own
      // column; otherwise (different column/board) default to the end.
      const defaultPos = columnId === task?.column_id ? (task?.position ?? 0) + 2 : n + 1;
      setPosition(Math.min(Math.max(defaultPos, 1), n + 1));
    })();
  }, [columnId, task]);

  if (!task) return null;

  const copy = async () => {
    const col = columns.find((c) => c.id === columnId);
    if (!col) return;
    setSaving(true);
    try {
      const { data: toShift } = await supabase
        .from("tasks")
        .select("id, position")
        .eq("column_id", columnId)
        .eq("archived", false)
        .gte("position", position - 1)
        .order("position");
      if (toShift?.length) {
        await Promise.all(toShift.map((t) => supabase.from("tasks").update({ position: t.position + 1 }).eq("id", t.id)));
      }
      const { data: projectRow } = await supabase.from("projects").select("key").eq("id", boardId).maybeSingle();
      const { count: taskCount } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("project_id", boardId);
      const ticketKey = `${projectRow?.key || "TSK"}-${(taskCount || 0) + 1}`;
      const { error } = await supabase.from("tasks").insert({
        project_id: boardId,
        board_id: taskBoardId,
        column_id: columnId,
        ticket_key: ticketKey,
        title: name.trim() || task.title,
        description: task.description,
        status: col.status as Database["public"]["Enums"]["task_status"],
        priority: task.priority as Database["public"]["Enums"]["task_priority"],
        assignee_id: task.assignee_id,
        due_date: task.due_date,
        labels: keepLabels ? task.labels : null,
        reporter_id: (await supabase.auth.getUser()).data.user?.id,
        position: position - 1,
      });
      if (error) { toast.error(error.message); return; }
      toast.success("Card copied");
      onCopied();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle className="text-sm">Copy card</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
          </div>

          {task.labels && task.labels.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Keep...</p>
              <div className="flex items-center gap-2">
                <Checkbox checked={keepLabels} onCheckedChange={(c) => setKeepLabels(!!c)} id="keep-labels" />
                <Label htmlFor="keep-labels" className="text-sm cursor-pointer">Labels ({task.labels.length})</Label>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Copy to...</p>
            <Label className="text-xs text-muted-foreground">Board</Label>
            <Select value={boardId} onValueChange={setBoardId}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">List</Label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Position</Label>
              <Select value={String(position)} onValueChange={(v) => setPosition(Number(v))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: columnTaskCount + 1 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" size="sm" onClick={copy} disabled={saving || !columnId}>Create card</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CopyCardDialog;
