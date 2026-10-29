import { useRef, useState } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, MoreVertical, Trash2, X } from "lucide-react";
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
  onQuickCreateTask: (columnId: string, title: string) => Promise<boolean>;
  onOpenTask: (task: KanbanTask) => void;
  onDeleteColumn?: (columnId: string) => void;
  onRenameColumn?: (columnId: string, name: string) => void;
  onToggleComplete?: (task: KanbanTask) => void;
  onArchiveTask?: (task: KanbanTask) => void;
  canDelete?: boolean;
  canDrag?: boolean;
  // Board-level edit access (member/admin/workspace visibility). A task's
  // own assignee can also toggle it complete even without board-level
  // access — the "Members update tasks" RLS policy allows that too — so
  // this alone doesn't decide per-card; see canToggleComplete below.
  canEditBoard?: boolean;
  currentUserId?: string;
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
  onQuickCreateTask,
  onOpenTask,
  onDeleteColumn,
  onRenameColumn,
  onToggleComplete,
  onArchiveTask,
  canDelete,
  canDrag = true,
  canEditBoard,
  currentUserId,
  checklistCounts,
}: Props) {
  // A column is both a sortable item (drag its header to reorder columns)
  // and the droppable zone cards are dropped into — dnd-kit's useSortable
  // covers both with the same id, which is what the task drag handlers
  // already look up via `columns.some(c => c.id === overId)`. Dragging
  // (not dropping) is disabled for read-only viewers (e.g. a non-member
  // on a Public board) since task_columns RLS would reject their reorder.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: column.id,
    data: { type: "column", column },
    // Only disable dragging, not dropping — a boolean `disabled` would
    // disable both, which would stop a task's own assignee (allowed to
    // move their task even without board-level edit access) from
    // dropping it into this column.
    disabled: { draggable: !canDrag, droppable: false },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const accent = COLUMN_ACCENT[column.status] || "from-primary/30 to-primary/0";

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(column.name);
  const canRename = !!canEditBoard && !!onRenameColumn;

  const startEditingName = () => {
    if (!canRename) return;
    setNameDraft(column.name);
    setEditingName(true);
  };
  const commitName = () => {
    setEditingName(false);
    if (nameDraft.trim() && nameDraft.trim() !== column.name) onRenameColumn?.(column.id, nameDraft);
  };

  // Trello-style inline "+ Add a card" — a textarea that stays open after
  // each submit (refocused and cleared) so adding several cards in a row
  // doesn't need re-opening it each time.
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [submittingCard, setSubmittingCard] = useState(false);
  const newCardRef = useRef<HTMLTextAreaElement>(null);

  const openAddCard = () => { setAddingCard(true); setNewCardTitle(""); };
  const closeAddCard = () => { setAddingCard(false); setNewCardTitle(""); };
  const submitNewCard = async () => {
    const trimmed = newCardTitle.trim();
    if (!trimmed || submittingCard) { if (!trimmed) closeAddCard(); return; }
    setSubmittingCard(true);
    const ok = await onQuickCreateTask(column.id, trimmed);
    setSubmittingCard(false);
    // Only clear the draft on success — on failure (e.g. a transient error)
    // keep what was typed so it isn't silently lost, same as the old
    // Create Task dialog did.
    if (ok) setNewCardTitle("");
    newCardRef.current?.focus();
  };

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
        {...(canDrag ? listeners : {})}
        className={cn(
          "relative rounded-t-2xl px-3 py-2.5 bg-gradient-to-b",
          canDrag && "cursor-grab active:cursor-grabbing",
          accent,
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {editingName ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitName(); }
                  if (e.key === "Escape") { setEditingName(false); setNameDraft(column.name); }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="h-7 text-sm font-semibold px-1.5 py-1"
              />
            ) : (
              <span
                className={cn("font-semibold text-sm truncate", canRename && "cursor-text hover:bg-background/40 rounded px-1 -mx-1")}
                onClick={(e) => { if (canRename) { e.stopPropagation(); startEditingName(); } }}
                onPointerDown={(e) => canRename && e.stopPropagation()}
              >
                {column.name}
              </span>
            )}
            <span className="text-xs px-1.5 py-0.5 rounded-md bg-background/60 text-muted-foreground font-medium shrink-0">
              {tasks.length}
            </span>
          </div>
          {canDelete && onDeleteColumn && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
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

      {/* Cards */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 min-h-[60px] px-2 pt-2 space-y-2 overflow-y-auto">
          {tasks.map((t) => (
            <KanbanCard
              key={t.id}
              task={t}
              assignee={profiles.find((p) => p.id === t.assignee_id) || null}
              onClick={() => onOpenTask(t)}
              onToggleComplete={onToggleComplete ? () => onToggleComplete(t) : undefined}
              canToggleComplete={!!canEditBoard || t.assignee_id === currentUserId}
              onArchive={onArchiveTask ? () => onArchiveTask(t) : undefined}
              canArchive={!!canEditBoard || t.assignee_id === currentUserId}
              checklistTotal={checklistCounts?.[t.id]?.total || 0}
              checklistDone={checklistCounts?.[t.id]?.done || 0}
            />
          ))}
        </div>
      </SortableContext>

      {/* Trello-style "+ Add a card" — a textarea in place of the button,
          at the bottom of the list rather than a small icon in the header. */}
      <div className="px-2 pb-2">
        {addingCard ? (
          <div onPointerDown={(e) => e.stopPropagation()}>
            <Textarea
              ref={newCardRef}
              autoFocus
              disabled={submittingCard}
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitNewCard(); }
                if (e.key === "Escape") closeAddCard();
              }}
              placeholder="Enter a title or paste a link"
              className="min-h-[60px] text-sm resize-none bg-card"
            />
            <div className="flex items-center gap-1.5 mt-2">
              <Button size="sm" onClick={submitNewCard} disabled={submittingCard}>Add card</Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={closeAddCard} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openAddCard}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-full flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-background/60 hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" /> Add a card
          </button>
        )}
      </div>
    </div>
  );
}
