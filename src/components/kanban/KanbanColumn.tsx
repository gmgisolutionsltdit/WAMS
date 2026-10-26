import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  onToggleComplete?: (task: KanbanTask) => void;
  canDelete?: boolean;
  checklistCounts?: Record<string, { done: number; total: number }>;
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
  onToggleComplete,
  canDelete,
  checklistCounts,
}: Props) {
  // A column is both a sortable item (drag its header to reorder columns)
  // and the droppable zone cards are dropped into — dnd-kit's useSortable
  // covers both with the same id, which is what the task drag handlers
  // already look up via `columns.some(c => c.id === overId)`.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: column.id,
    data: { type: "column", column },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const accent = COLUMN_ACCENT[column.status] || "from-primary/30 to-primary/0";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "min-w-[300px] w-[300px] max-h-full flex flex-col rounded-2xl",
        "bg-muted/30 backdrop-blur-sm border border-border/60",
        "transition-all duration-200",
        isOver && "ring-2 ring-primary/50 bg-primary/5 scale-[1.01]",
        isDragging && "opacity-40",
      )}
    >
      {/* Header with subtle accent — also the column's drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "relative rounded-t-2xl px-3 py-2.5 bg-gradient-to-b cursor-grab active:cursor-grabbing",
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
        <div className="flex-1 min-h-[120px] px-2 pb-2 space-y-2 overflow-y-auto">
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
                onToggleComplete={onToggleComplete ? () => onToggleComplete(t) : undefined}
                checklistTotal={checklistCounts?.[t.id]?.total || 0}
                checklistDone={checklistCounts?.[t.id]?.done || 0}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
