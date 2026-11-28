import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  onMoved: () => void;
}

/** Trello's "Move card" dialog, Board tab only — WAMS has no equivalent to
 * Trello's personal "Inbox" tab, so this is just Board → List → Position. */
export const MoveCardDialog = ({ task, currentProjectId, currentTaskBoardId, onClose, onMoved }: Props) => {
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
      // "board" here is a projects.id; a project's single task_boards row is
      // its board — same relationship TaskBoard.tsx itself relies on.
      const { data: boardRow } = await supabase.from("task_boards").select("id").eq("project_id", boardId).maybeSingle();
      const tbId = boardRow?.id;
      if (!tbId) { setColumns([]); return; }
      setTaskBoardId(tbId);
      const { data: cols } = await supabase.from("task_columns").select("id, name, status").eq("board_id", tbId).eq("archived", false).order("position");
      setColumns((cols || []) as ColumnOption[]);
      // Default to the task's current column only when still on its own
      // board; switching boards defaults to that board's first list.
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
      setPosition((p) => Math.min(Math.max(p, 1), n + 1));
    })();
  }, [columnId]);

  if (!task) return null;

  const move = async () => {
    const col = columns.find((c) => c.id === columnId);
    if (!col) return;
    setSaving(true);
    try {
      // Shift tasks already at/after the target position in the destination
      // column, same approach as creating a card at a specific spot.
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
      const { error } = await supabase.from("tasks").update({
        project_id: boardId,
        board_id: taskBoardId,
        column_id: columnId,
        status: col.status as Database["public"]["Enums"]["task_status"],
        position: position - 1,
      }).eq("id", task.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Card moved");
      onMoved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle className="text-sm">Move card</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Select destination</p>
          <div className="space-y-1">
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
          <Button className="w-full" size="sm" onClick={move} disabled={saving || !columnId}>Move</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MoveCardDialog;
