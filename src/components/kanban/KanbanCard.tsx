import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, AlertTriangle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export type KanbanTask = {
  id: string;
  ticket_key: string | null;
  title: string;
  description: string | null;
  priority: string;
  assignee_id: string | null;
  due_date: string | null;
  column_id: string | null;
  status: string;
  position: number;
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
  isOverlay?: boolean;
  commentCount?: number;
}

export function KanbanCard({ task, assignee, onClick, isOverlay, commentCount = 0 }: Props) {
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
        "group cursor-grab active:cursor-grabbing select-none",
        "bg-card/70 backdrop-blur-md border border-border/60 rounded-xl p-3",
        "shadow-sm hover:shadow-md hover:border-primary/40",
        "transition-all duration-200",
        "hover:-translate-y-0.5",
        isOverlay && "rotate-2 scale-105 shadow-2xl ring-2 ring-primary/40 cursor-grabbing",
      )}
    >
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
      </div>

      <h4 className="text-sm font-medium leading-snug mb-2 line-clamp-2">{task.title}</h4>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
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
    </div>
  );
}
