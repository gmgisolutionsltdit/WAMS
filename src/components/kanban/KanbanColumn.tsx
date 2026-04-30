import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Plus, MoreVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanCard, KanbanTask, Profile } from "./KanbanCard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type KanbanColumnData = {
  id: string;
  name: string;
  status: string;
  position: number;
};

interface Props {
  column: KanbanColumnData;
  tasks: KanbanTask[];
  profiles: Profile[];
  onCreateTask: (columnId: string) => void;
  onOpenTask: (task: KanbanTask) => void;
  onDeleteColumn?: (columnId: string) => void;
  canDelete?: boolean;
}

const COLUMN_ACCENT: Record<string, string> = {
  todo: "from-slate-500/30 to-slate-500/0",
  in_progress: "from-blue-500/30 to-blue-500/0",
  in_review: "from-purple-500/30 to-purple-500/0",
  done: "from-emerald-500/30 to-emerald-500/0",
};

export function KanbanColumn({
  column,
  tasks,
  profiles,
  onCreateTask,
  onOpenTask,
  onDeleteColumn,
  canDelete,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });

  const accent = COLUMN_ACCENT[column.status] || "from-primary/30 to-primary/0";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-[300px] w-[300px] flex flex-col rounded-2xl",
        "bg-muted/30 backdrop-blur-sm border border-border/60",
        "transition-all duration-200",
        isOver && "ring-2 ring-primary/50 bg-primary/5 scale-[1.01]",
      )}
    >
      {/* Header with subtle accent */}
      <div
        className={cn(
          "relative rounded-t-2xl px-3 py-2.5 bg-gradient-to-b",
          accent,
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{column.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-background/60 text-muted-foreground font-medium">
              {tasks.length}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onCreateTask(column.id)}
              aria-label="Add task"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            {canDelete && onDeleteColumn && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => onDeleteColumn(column.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete column
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Cards */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 px-2 pb-2 space-y-2 min-h-[120px] max-h-[calc(100vh-280px)] overflow-y-auto">
          {tasks.length === 0 ? (
            <button
              onClick={() => onCreateTask(column.id)}
              className="w-full mt-2 py-6 px-3 rounded-xl border-2 border-dashed border-border/60 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
            >
              <Plus className="h-4 w-4 mx-auto mb-1" />
              Add task
            </button>
          ) : (
            tasks.map((t) => (
              <KanbanCard
                key={t.id}
                task={t}
                assignee={profiles.find((p) => p.id === t.assignee_id) || null}
                onClick={() => onOpenTask(t)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
