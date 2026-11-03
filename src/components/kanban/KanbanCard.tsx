import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Calendar as CalendarIcon, AlertTriangle, MessageSquare, CheckSquare, CheckCircle2, Circle, Archive,
  MoreHorizontal, Copy, ArrowRightLeft, Sparkles, Tag,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TaskLabelsPanel } from "@/components/tasks/TaskLabelsPopover";
import type { TaskLabel } from "@/lib/taskLabels";
import { cn } from "@/lib/utils";

export type KanbanTask = {
  id: string;
  ticket_key: string | null;
  title: string;
  description: string | null;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  start_date?: string | null;
  recurring?: string | null;
  reminder?: string | null;
  column_id: string | null;
  status: string;
  position: number;
  completed_at?: string | null;
  archived?: boolean;
  labels?: string[] | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  photo_url: string | null;
};

const PRIORITY_STYLES: Record<string, { bg: string; ring: string; label: string }> = {
  low: { bg: "bg-slate-500/10 text-slate-600 dark:text-slate-300", ring: "ring-slate-400/30", label: "Low" },
  medium: { bg: "bg-blue-500/10 text-blue-600 dark:text-blue-300", ring: "ring-blue-400/30", label: "Medium" },
  high: { bg: "bg-orange-500/10 text-orange-600 dark:text-orange-300", ring: "ring-orange-400/40", label: "High" },
  urgent: { bg: "bg-red-500/10 text-red-600 dark:text-red-300", ring: "ring-red-400/50", label: "Urgent" },
};

interface Props {
  task: KanbanTask;
  assignee: Profile | null;
  onClick: () => void;
  onToggleComplete?: () => void;
  canToggleComplete?: boolean;
  onArchive?: () => void;
  canArchive?: boolean;
  isOverlay?: boolean;
  commentCount?: number;
  checklistTotal?: number;
  checklistDone?: number;
  /** Card-menu actions (Trello's hover ⋯ menu) — omitted entirely when the
   * viewer can't edit the board, same gating as archive/complete. */
  onCopy?: () => void;
  onMove?: () => void;
  boardId?: string;
  boardLabels?: TaskLabel[];
  onToggleLabel?: (labelId: string) => void;
  canManageCard?: boolean;
}

export function KanbanCard({
  task,
  assignee,
  onClick,
  onToggleComplete,
  canToggleComplete = true,
  onArchive,
  canArchive = true,
  isOverlay,
  commentCount = 0,
  checklistTotal = 0,
  checklistDone = 0,
  onCopy,
  onMove,
  boardId,
  boardLabels = [],
  onToggleLabel,
  canManageCard = true,
}: Props) {
  const [labelsOpen, setLabelsOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
  const overdue =
    task.due_date && new Date(task.due_date) < new Date(new Date().toDateString()) && task.status !== "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // Only fire click if it wasn't a drag
        if (!isDragging) onClick();
      }}
      className={cn(
        "group cursor-grab active:cursor-grabbing select-none text-left",
        "bg-card/70 backdrop-blur-md border border-border/60 rounded-xl p-3",
        "shadow-sm transition-all duration-200",
        task.completed_at
          ? "opacity-60 saturate-50 hover:opacity-90"
          : "hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5",
        isOverlay && "rotate-2 scale-105 shadow-2xl ring-2 ring-primary/40 cursor-grabbing",
      )}
    >
      {task.labels && task.labels.length > 0 && (
        <div className="flex gap-1 mb-1.5">
          {task.labels.map((id) => {
            const l = boardLabels.find((bl) => bl.id === id);
            if (!l) return null;
            return <span key={id} className="h-1.5 w-6 rounded-full" style={{ backgroundColor: l.color }} title={l.name} />;
          })}
        </div>
      )}

      <div className="flex items-center justify-between mb-1.5">
        {task.ticket_key && (
          <span className="text-[10px] font-mono text-muted-foreground tracking-wide">{task.ticket_key}</span>
        )}
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded-full ring-1",
            priority.bg,
            priority.ring,
          )}
        >
          {priority.label}
        </span>
        {!isOverlay && canManageCard && (onCopy || onMove || onToggleLabel || onArchive) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="shrink-0 ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                aria-label="Card menu"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
              {onCopy && (
                <DropdownMenuItem onClick={onCopy}>
                  <Copy className="h-3.5 w-3.5 mr-2" /> Copy card
                </DropdownMenuItem>
              )}
              {onMove && (
                <DropdownMenuItem onClick={onMove}>
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-2" /> Move
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled>
                <Sparkles className="h-3.5 w-3.5 mr-2" /> Mirror <span className="ml-auto text-[10px] text-muted-foreground">Coming soon</span>
              </DropdownMenuItem>
              {onToggleLabel && boardId && (
                <DropdownMenuItem onClick={() => setLabelsOpen(true)}>
                  <Tag className="h-3.5 w-3.5 mr-2" /> Edit labels
                </DropdownMenuItem>
              )}
              {onArchive && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onArchive} className="text-destructive focus:text-destructive">
                    <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex items-start gap-1.5 mb-2">
        {onToggleComplete && canToggleComplete && !isOverlay && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "shrink-0 mt-0.5 transition-opacity",
              task.completed_at ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            aria-label={task.completed_at ? "Mark incomplete" : "Mark complete"}
          >
            {task.completed_at ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            )}
          </button>
        )}
        {/* Title grows to fill the row and smoothly yields space to the
            hover-revealed archive icon, matching Trello's card hover. */}
        <h4
          className={cn(
            "flex-1 min-w-0 text-sm font-medium leading-snug line-clamp-2 text-left break-words transition-all duration-200",
            task.completed_at && "text-muted-foreground",
          )}
        >
          {task.title}
        </h4>
        {!isOverlay && task.completed_at && onArchive && canArchive && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onArchive(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "shrink-0 p-0.5 rounded hover:bg-muted focus-visible:bg-muted text-muted-foreground transition-opacity",
              "opacity-100 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            )}
            aria-label="Archive card"
          >
            <Archive className="h-3 w-3" />
          </button>
        )}
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2 break-words">{task.description}</p>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {task.due_date && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md",
                overdue
                  ? "bg-red-500/15 text-red-600 dark:text-red-300 font-medium"
                  : "bg-muted/60",
              )}
            >
              {overdue ? <AlertTriangle className="h-3 w-3" /> : <CalendarIcon className="h-3 w-3" />}
              {new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {commentCount}
            </span>
          )}
          {checklistTotal > 0 && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="h-3 w-3" />
              {checklistDone}/{checklistTotal}
            </span>
          )}
        </div>
        {assignee ? (
          <Avatar className="h-6 w-6 ring-2 ring-background">
            <AvatarImage src={assignee.photo_url || undefined} />
            <AvatarFallback className="text-[10px]">
              {(assignee.full_name || assignee.email || "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/30" />
        )}
      </div>

      {onToggleLabel && boardId && (
        <Dialog open={labelsOpen} onOpenChange={setLabelsOpen}>
          <DialogContent className="max-w-xs" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <DialogHeader><DialogTitle className="sr-only">Labels</DialogTitle></DialogHeader>
            <TaskLabelsPanel boardId={boardId} selectedIds={task.labels || []} onToggle={onToggleLabel} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
