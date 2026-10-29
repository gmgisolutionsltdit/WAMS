import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Plus, MessageSquare, Loader2, AlertCircle, CheckSquare, X, UserPlus } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { EmployeePicker } from "@/components/EmployeePicker";
import { ProjectMemberSelector } from "@/components/ProjectMemberSelector";
import { BoardMenu } from "@/components/tasks/BoardMenu";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanColumn, KanbanColumnData } from "@/components/kanban/KanbanColumn";
import { KanbanCard, KanbanTask, Profile } from "@/components/kanban/KanbanCard";
import { KanbanEmptyState } from "@/components/kanban/KanbanEmptyState";
import { BoardSearchCreate } from "@/components/tasks/BoardSearchCreate";
import { cn } from "@/lib/utils";
import { recordRecentBoard } from "@/lib/boardPrefs";

const PRIORITIES = ["low", "medium", "high", "urgent"];

const TaskBoard = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [project, setProject] = useState<any>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<KanbanColumnData[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [draggingTask, setDraggingTask] = useState<KanbanTask | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [checklistItems, setChecklistItems] = useState<any[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [checklistCounts, setChecklistCounts] = useState<Record<string, { done: number; total: number }>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [createColId, setCreateColId] = useState<string | null>(null);
  const [taskCounter, setTaskCounter] = useState(0);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", assignee_id: "", due_date: "" });

  const [addColOpen, setAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState("");

  const [membersOpen, setMembersOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  /**
   * Ensure the project has a board with default columns.
   * This fixes the "blank screen" bug for projects created before
   * board auto-creation, or when a previous insert failed under RLS.
   */
  const ensureBoard = useCallback(async (pjId: string): Promise<string | null> => {
    const { data: existing } = await supabase
      .from("task_boards")
      .select("id")
      .eq("project_id", pjId)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id;

    const { data: created, error } = await supabase
      .from("task_boards")
      .insert({ project_id: pjId, name: "Main Board", position: 0 })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[TaskBoard] failed to create board:", error);
      return null;
    }
    const { error: colErr } = await supabase.from("task_columns").insert([
      { board_id: created.id, name: "To Do", status: "todo", position: 0 },
      { board_id: created.id, name: "In Progress", status: "in_progress", position: 1 },
      { board_id: created.id, name: "Completed", status: "done", position: 2 },
    ]);
    if (colErr) console.error("[TaskBoard] failed to seed columns:", colErr);
    return created.id;
  }, []);

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    setLoadError(null);
    try {
      const [{ data: pj, error: pjErr }, { data: pf }, { data: mem }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
        supabase.from("profiles").select("id, full_name, email, photo_url"),
        supabase.from("project_members").select("user_id, role").eq("project_id", projectId),
      ]);
      if (pjErr) throw pjErr;
      if (!pj) {
        setLoadError("Board not found or you don't have access.");
        setLoading(false);
        return;
      }
      if (pj.archived) {
        setLoadError("This board has been closed.");
        setLoading(false);
        return;
      }
      setProject(pj);
      recordRecentBoard(projectId);
      setProfiles((pf || []) as Profile[]);
      setMembers((mem || []) as any);

      const bId = await ensureBoard(projectId);
      if (!bId) {
        setLoadError("Could not load or create this board.");
        setLoading(false);
        return;
      }
      setBoardId(bId);

      const [{ data: cols }, { data: tks }, { count: totalCount }] = await Promise.all([
        supabase.from("task_columns").select("*").eq("board_id", bId).order("position"),
        supabase.from("tasks").select("*").eq("project_id", projectId).eq("archived", false).order("position"),
        // Ticket keys must stay unique even once a task is archived (it keeps
        // its key), so count all tasks here, not just the active ones above.
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      ]);
      setColumns((cols || []) as KanbanColumnData[]);
      setTasks((tks || []) as KanbanTask[]);
      setTaskCounter(totalCount || 0);

      const taskIds = (tks || []).map((t: any) => t.id);
      if (taskIds.length > 0) {
        const { data: items } = await supabase
          .from("task_checklist_items")
          .select("task_id, done")
          .in("task_id", taskIds);
        const counts: Record<string, { done: number; total: number }> = {};
        (items || []).forEach((it: any) => {
          if (!counts[it.task_id]) counts[it.task_id] = { done: 0, total: 0 };
          counts[it.task_id].total += 1;
          if (it.done) counts[it.task_id].done += 1;
        });
        setChecklistCounts(counts);
      } else {
        setChecklistCounts({});
      }
    } catch (e: any) {
      console.error("[TaskBoard] fetchAll error:", e);
      setLoadError(e.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [projectId, ensureBoard]);

  // Switching boards (e.g. via the BoardSearchCreate bar) changes projectId
  // but keeps this same TaskBoard instance mounted — without this, the old
  // board's columns/tasks stay rendered and interactive while the new
  // project's data is still loading, so a task created in that window could
  // get the new project_id but the previous board's stale column/board ids.
  useEffect(() => {
    setLoading(true);
    setProject(null);
    setBoardId(null);
    setColumns([]);
    setTasks([]);
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useRealtimeSubscription("tasks", fetchAll, `tasks-${projectId}`);
  useRealtimeSubscription("task_columns", fetchAll, `cols-${projectId}`);
  useRealtimeSubscription("task_checklist_items", fetchAll, `checklist-${projectId}`);

  const memberProfiles = useMemo(() => {
    const ids = new Set(members.map((m) => m.user_id));
    if (project?.owner_id) ids.add(project.owner_id);
    return profiles.filter((p) => ids.has(p.id));
  }, [members, profiles, project]);

  const tasksByColumn = useMemo(() => {
    const map: Record<string, KanbanTask[]> = {};
    columns.forEach((c) => { map[c.id] = []; });
    tasks.forEach((t) => {
      if (t.column_id && map[t.column_id]) map[t.column_id].push(t);
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => a.position - b.position));
    return map;
  }, [tasks, columns]);

  const profileFor = (id: string | null) => (id ? profiles.find((p) => p.id === id) || null : null);

  /* ---------- DnD handlers ---------- */
  const findColumnIdForTask = (taskId: string) => tasks.find((t) => t.id === taskId)?.column_id || null;

  const handleDragStart = (e: DragStartEvent) => {
    if (e.active.data.current?.type === "column") return; // KanbanColumn styles its own drag state
    const t = tasks.find((x) => x.id === e.active.id);
    if (t) setDraggingTask(t);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    if (active.data.current?.type === "column") return; // columns reorder on drop only
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeColId = findColumnIdForTask(activeId);
    const overIsColumn = columns.some((c) => c.id === overId);
    const overColId = overIsColumn ? overId : findColumnIdForTask(overId);
    if (!activeColId || !overColId || activeColId === overColId) return;

    // Move between columns optimistically
    setTasks((prev) => prev.map((t) => (t.id === activeId ? { ...t, column_id: overColId } : t)));
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    setDraggingTask(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (active.data.current?.type === "column") {
      // closestCorners can resolve `over` to a card nested inside a column
      // (not the column itself) when dragging across a taller column —
      // fall back to that card's own column so the drop still lands.
      const overColumnId = columns.some((c) => c.id === overId) ? overId : findColumnIdForTask(overId);
      if (!overColumnId || activeId === overColumnId) return;
      const oldIndex = columns.findIndex((c) => c.id === activeId);
      const newIndex = columns.findIndex((c) => c.id === overColumnId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(columns, oldIndex, newIndex);
      setColumns(reordered);
      const results = await Promise.all(
        reordered.map((c, idx) => supabase.from("task_columns").update({ position: idx }).eq("id", c.id)),
      );
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) {
        toast.error(firstErr.error.message);
        fetchAll();
      }
      return;
    }

    const activeTaskRow = tasks.find((t) => t.id === activeId);
    if (!activeTaskRow) return;

    const overIsColumn = columns.some((c) => c.id === overId);
    const targetColId = overIsColumn ? overId : findColumnIdForTask(overId);
    if (!targetColId) return;
    const targetCol = columns.find((c) => c.id === targetColId);
    if (!targetCol) return;

    // Reorder within target column
    const inCol = tasks.filter((t) => t.column_id === targetColId);
    const oldIndex = inCol.findIndex((t) => t.id === activeId);
    const newIndex = overIsColumn
      ? inCol.length - 1
      : inCol.findIndex((t) => t.id === overId);
    const reordered = arrayMove(inCol, Math.max(oldIndex, 0), Math.max(newIndex, 0));

    // Optimistic local positions
    setTasks((prev) =>
      prev.map((t) => {
        if (t.column_id !== targetColId) return t;
        const idx = reordered.findIndex((r) => r.id === t.id);
        return { ...t, position: idx };
      }),
    );

    // Persist position + status/column for moved card
    const updates = reordered.map((t, idx) =>
      supabase
        .from("tasks")
        .update({
          column_id: targetColId,
          status: targetCol.status as any,
          position: idx,
          ...(t.id === activeId && targetCol.status === "done"
            ? { completed_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", t.id),
    );
    const results = await Promise.all(updates);
    const firstErr = results.find((r) => r.error);
    if (firstErr?.error) {
      toast.error(firstErr.error.message);
      fetchAll();
    }
  };

  /* ---------- Task CRUD ---------- */
  const openCreate = (colId: string) => {
    setCreateColId(colId);
    setForm({ title: "", description: "", priority: "medium", assignee_id: "", due_date: "" });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!form.title || !createColId || !boardId) { toast.error("Title required"); return; }
    const col = columns.find((c) => c.id === createColId);
    const ticketKey = `${project?.key}-${taskCounter + 1}`;
    const { error } = await supabase.from("tasks").insert({
      project_id: projectId!,
      board_id: boardId,
      column_id: createColId,
      ticket_key: ticketKey,
      title: form.title,
      description: form.description || null,
      status: (col?.status || "todo") as any,
      priority: form.priority as any,
      assignee_id: form.assignee_id || null,
      reporter_id: user!.id,
      due_date: form.due_date || null,
      position: tasksByColumn[createColId]?.length || 0,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Task created");
    setCreateOpen(false);
  };

  // Trello-style inline "+ Add a card" — just a title, created directly
  // without the full Create Task dialog; the rest (description, assignee,
  // due date, priority) gets filled in later by opening the card. Returns
  // whether it succeeded so the inline form can keep/restore the draft on
  // failure instead of silently dropping what was typed.
  //
  // `atIndex` places the new card at that position within the column
  // (0 = top; omitted/column length = append at the bottom), matching the
  // hover "+" gaps shown above each card. Existing cards at or after that
  // index get shifted up by one first, the same contiguous 0..n-1 position
  // scheme drag-and-drop reordering already keeps.
  const quickCreateTask = async (columnId: string, title: string, atIndex?: number): Promise<boolean> => {
    const trimmed = title.trim();
    if (!trimmed || !boardId) return false;
    const col = columns.find((c) => c.id === columnId);
    const colTasks = tasksByColumn[columnId] || [];
    const insertPos = atIndex ?? colTasks.length;
    const toShift = colTasks.filter((t) => t.position >= insertPos);
    if (toShift.length) {
      const shiftResults = await Promise.all(
        toShift.map((t) => supabase.from("tasks").update({ position: t.position + 1 }).eq("id", t.id)),
      );
      const shiftErr = shiftResults.find((r) => r.error);
      if (shiftErr?.error) { toast.error(shiftErr.error.message); return false; }
      const shiftedIds = new Set(toShift.map((t) => t.id));
      setTasks((prev) => prev.map((t) => (shiftedIds.has(t.id) ? { ...t, position: t.position + 1 } : t)));
    }
    const ticketKey = `${project?.key}-${taskCounter + 1}`;
    const { error } = await supabase.from("tasks").insert({
      project_id: projectId!,
      board_id: boardId,
      column_id: columnId,
      ticket_key: ticketKey,
      title: trimmed,
      status: (col?.status || "todo") as Database["public"]["Enums"]["task_status"],
      priority: "medium" as Database["public"]["Enums"]["task_priority"],
      reporter_id: user!.id,
      position: insertPos,
    });
    if (error) { toast.error(error.message); fetchAll(); return false; }
    // Advance locally rather than wait for the realtime refetch — the
    // inline form stays open for back-to-back submits, and two quick
    // creates before that refetch lands would otherwise reuse the same
    // ticket_key.
    setTaskCounter((c) => c + 1);
    return true;
  };

  const openTaskIdRef = useRef<string | null>(null);

  const openTask = async (t: KanbanTask) => {
    setActiveTask(t);
    openTaskIdRef.current = t.id;
    const [{ data }, { data: checklist }] = await Promise.all([
      supabase.from("task_comments").select("*").eq("task_id", t.id).order("created_at"),
      supabase.from("task_checklist_items").select("*").eq("task_id", t.id).order("position"),
    ]);
    if (openTaskIdRef.current !== t.id) return;
    setComments(data || []);
    setChecklistItems(checklist || []);
  };

  const refreshChecklist = async (taskId: string) => {
    const { data } = await supabase
      .from("task_checklist_items")
      .select("*")
      .eq("task_id", taskId)
      .order("position");
    if (openTaskIdRef.current !== taskId) return;
    setChecklistItems(data || []);
  };

  const addChecklistItem = async () => {
    if (!activeTask || !newChecklistItem.trim()) return;
    const { error } = await supabase.from("task_checklist_items").insert({
      task_id: activeTask.id,
      text: newChecklistItem.trim(),
      position: checklistItems.length,
      created_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    setNewChecklistItem("");
    refreshChecklist(activeTask.id);
  };

  const toggleChecklistItem = async (itemId: string, done: boolean) => {
    const { error } = await supabase.from("task_checklist_items").update({ done }).eq("id", itemId);
    if (error) { toast.error(error.message); return; }
    if (activeTask) refreshChecklist(activeTask.id);
  };

  const deleteChecklistItem = async (itemId: string) => {
    const { error } = await supabase.from("task_checklist_items").delete().eq("id", itemId);
    if (error) { toast.error(error.message); return; }
    if (activeTask) refreshChecklist(activeTask.id);
  };

  const updateTask = async (patch: Partial<KanbanTask>) => {
    if (!activeTask) return;
    const { error } = await supabase.from("tasks").update(patch as any).eq("id", activeTask.id);
    if (error) { toast.error(error.message); return; }
    setActiveTask({ ...activeTask, ...patch } as KanbanTask);
    fetchAll();
  };

  const addComment = async () => {
    if (!activeTask || !newComment.trim()) return;
    const { error } = await supabase.from("task_comments").insert({
      task_id: activeTask.id, user_id: user!.id, body: newComment.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setNewComment("");
    const { data } = await supabase.from("task_comments").select("*").eq("task_id", activeTask.id).order("created_at");
    setComments(data || []);
  };

  // Trello-style "mark complete" toggle on a card — independent of which
  // column/status the task is in, unlike moving it to a "Done" column.
  const toggleComplete = async (task: KanbanTask) => {
    const next = task.completed_at ? null : new Date().toISOString();
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed_at: next } : t)));
    const { error } = await supabase.from("tasks").update({ completed_at: next }).eq("id", task.id);
    if (error) { toast.error(error.message); fetchAll(); }
  };

  // Trello-style "archive" on a completed card — hides it from the board
  // without deleting it, so comments/checklist/attachments/activity stay
  // intact. A soft update (not delete) also goes through the same "Members
  // update tasks" RLS policy as the complete-toggle, so a board member or
  // the task's own assignee (not just the owner/admin) can archive it too.
  const archiveTask = async (task: KanbanTask) => {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    const { error } = await supabase.from("tasks").update({ archived: true }).eq("id", task.id);
    if (error) { toast.error(error.message); fetchAll(); return; }
    toast.success("Card archived");
  };

  /* ---------- Column CRUD ---------- */
  const addColumn = async () => {
    if (!newColName.trim() || !boardId) return;
    const { error } = await supabase.from("task_columns").insert({
      board_id: boardId,
      name: newColName.trim(),
      status: "todo",
      position: columns.length,
    });
    if (error) { toast.error(error.message); return; }
    setNewColName("");
    setAddColOpen(false);
    toast.success("Column added");
  };

  const deleteColumn = async (colId: string) => {
    if ((tasksByColumn[colId] || []).length > 0) {
      toast.error("Move or delete tasks in this column first.");
      return;
    }
    const { error } = await supabase.from("task_columns").delete().eq("id", colId);
    if (error) { toast.error(error.message); return; }
    toast.success("Column deleted");
  };

  const renameColumn = async (colId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setColumns((prev) => prev.map((c) => (c.id === colId ? { ...c, name: trimmed } : c)));
    const { error } = await supabase.from("task_columns").update({ name: trimmed }).eq("id", colId);
    if (error) { toast.error(error.message); fetchAll(); }
  };

  /* ---------- Render ---------- */
  if (loading) {
    // Keep the same page shell (back button, search bar) in place instead of
    // blanking the whole panel to a bare spinner — less jarring when
    // switching into a board from the sidebar.
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-center shrink-0">
          <BoardSearchCreate />
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button size="icon" variant="ghost" onClick={() => navigate("/tasks")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading board…
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
        <h3 className="font-semibold mb-1">Couldn't open this board</h3>
        <p className="text-sm text-muted-foreground mb-4">{loadError || "Unknown error"}</p>
        <Button variant="outline" onClick={() => navigate("/tasks")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Tasks
        </Button>
      </div>
    );
  }

  const totalTasks = tasks.length;
  const isOwnerOrAdmin = project.owner_id === user?.id || role === "admin";
  // A Public-visibility board can be viewed by non-members, but the
  // "Members view tasks"/"Members manage boards" RLS policies only let
  // members, admins, or Workspace-visibility viewers mutate it — gate the
  // column drag and card-complete toggle the same way so read-only
  // viewers aren't offered actions that will just be rejected.
  const canEditBoard = isOwnerOrAdmin
    || members.some((m) => m.user_id === user?.id)
    || project.visibility === "workspace";

  // Trello-style inline-editable board title: click the title to edit it in place.
  const saveTitle = async () => {
    setEditingTitle(false);
    const name = titleDraft.trim();
    if (!name || name === project.name) return;
    const { error } = await supabase.from("projects").update({ name }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    setProject((p) => ({ ...p, name }));
  };

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-3.5rem-1.5rem)] sm:h-[calc(100vh-3.5rem-2rem)] md:h-[calc(100vh-3.5rem-3rem)]">
      {/* Same search-boards / create-board bar as the Tasks home screen, so you
          can jump to or create another board without leaving this one. */}
      <div className="flex justify-center shrink-0">
        <BoardSearchCreate />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button size="icon" variant="ghost" onClick={() => navigate("/tasks")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            {editingTitle ? (
              <Input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.currentTarget.blur(); }
                  else if (e.key === "Escape") { setEditingTitle(false); }
                }}
                className="text-2xl font-semibold h-auto py-0.5 px-1 -mx-1 w-auto min-w-[12rem]"
              />
            ) : (
              <h2
                className={cn(
                  "text-2xl font-semibold truncate rounded px-1 -mx-1",
                  isOwnerOrAdmin && "cursor-text hover:bg-accent"
                )}
                onClick={() => { if (!isOwnerOrAdmin) return; setTitleDraft(project.name); setEditingTitle(true); }}
              >
                {project.name}
              </h2>
            )}
            {project.description && !editingTitle && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddColOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Column
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" /> Members ({members.length})
          </Button>
          <ProjectMemberSelector
            projectId={projectId!}
            project={project}
            members={members}
            onChanged={fetchAll}
            open={membersOpen}
            onOpenChange={setMembersOpen}
          />
          <BoardMenu
            project={project}
            canEdit={isOwnerOrAdmin}
            onOpenMembers={() => setMembersOpen(true)}
            onProjectUpdated={(patch) => setProject((p) => ({ ...p, ...patch }))}
            onTaskRestored={fetchAll}
          />
        </div>
      </div>

      {/* Hint banner when board is empty — but always render the columns below */}
      {totalTasks === 0 && columns.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-b from-muted/30 to-transparent border border-border/60 shrink-0">
          <KanbanEmptyState onCreate={() => openCreate(columns[0].id)} />
        </div>
      )}

      {columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground shrink-0">
          No columns yet. Click <span className="font-medium">+ Column</span> above to add one.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* flex-1 + min-h-0 lets this row fill the rest of the viewport
              (instead of stopping wherever the cards end), so the
              horizontal scrollbar sits at the bottom of the page like
              Trello's board view. items-start keeps each column sized to
              its own cards (not stretched to the row's full height) —
              KanbanColumn caps itself at max-h-full and scrolls internally
              once a column's own cards exceed that. */}
          <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex-1 min-h-0 flex items-start gap-3 overflow-x-auto pb-4 -mx-1 px-1">
              {columns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  tasks={tasksByColumn[col.id] || []}
                  profiles={profiles}
                  onQuickCreateTask={quickCreateTask}
                  onOpenTask={openTask}
                  onDeleteColumn={deleteColumn}
                  onRenameColumn={renameColumn}
                  onToggleComplete={toggleComplete}
                  onArchiveTask={archiveTask}
                  canDelete={isOwnerOrAdmin}
                  canDrag={canEditBoard}
                  canEditBoard={canEditBoard}
                  currentUserId={user?.id}
                  checklistCounts={checklistCounts}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {draggingTask && (
              <KanbanCard
                task={draggingTask}
                assignee={profileFor(draggingTask.assignee_id)}
                onClick={() => {}}
                isOverlay
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>Add a new ticket to this column.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Assignee</Label>
              <EmployeePicker
                value={form.assignee_id || null}
                onChange={(id) => setForm((f) => ({ ...f, assignee_id: id || "" }))}
                placeholder="Select assignee"
                restrictToIds={memberProfiles.map((p) => p.id)}
              />
            </div>
          </div>
          <DialogFooter><Button onClick={submitCreate}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog open={addColOpen} onOpenChange={setAddColOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
            <DialogDescription>Create a custom column for this board.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Column name</Label>
            <Input
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="e.g. In Review"
              onKeyDown={(e) => e.key === "Enter" && addColumn()}
            />
          </div>
          <DialogFooter><Button onClick={addColumn}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task Detail Dialog */}
      <Dialog open={!!activeTask} onOpenChange={(o) => { if (!o) { setActiveTask(null); openTaskIdRef.current = null; } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {activeTask && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline">{activeTask.ticket_key}</Badge>
                  <Input
                    value={activeTask.title}
                    onChange={(e) => setActiveTask({ ...activeTask, title: e.target.value })}
                    onBlur={(e) => updateTask({ title: e.target.value })}
                    className="border-0 text-lg font-semibold"
                  />
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-3">
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={activeTask.description || ""}
                      onChange={(e) => setActiveTask({ ...activeTask, description: e.target.value })}
                      onBlur={(e) => updateTask({ description: e.target.value })}
                      rows={5}
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      <CheckSquare className="h-3 w-3" /> Checklist
                      {checklistItems.length > 0 && (
                        <span className="text-xs text-muted-foreground font-normal">
                          ({checklistItems.filter((i) => i.done).length}/{checklistItems.length})
                        </span>
                      )}
                    </Label>
                    <div className="space-y-1 my-2">
                      {checklistItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 group">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={(e) => toggleChecklistItem(item.id, e.target.checked)}
                            className="h-4 w-4"
                          />
                          <span className={cn("flex-1 text-sm", item.done && "line-through text-muted-foreground")}>
                            {item.text}
                          </span>
                          <button
                            onClick={() => deleteChecklistItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        placeholder="Add checklist item..."
                        onKeyDown={(e) => e.key === "Enter" && addChecklistItem()}
                      />
                      <Button size="sm" onClick={addChecklistItem}>Add</Button>
                    </div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Comments</Label>
                    <div className="space-y-2 max-h-60 overflow-y-auto my-2">
                      {comments.map((c) => {
                        const cp = profileFor(c.user_id);
                        return (
                          <div key={c.id} className="flex gap-2 text-sm">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={cp?.photo_url || undefined} />
                              <AvatarFallback className="text-[10px]">{(cp?.full_name || "?").slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="text-xs text-muted-foreground">
                                {cp?.full_name || cp?.email} · {new Date(c.created_at).toLocaleString()}
                              </div>
                              <div>{c.body}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        onKeyDown={(e) => e.key === "Enter" && addComment()}
                      />
                      <Button size="sm" onClick={addComment}>Post</Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Status</Label>
                    <Select
                      value={activeTask.column_id || ""}
                      onValueChange={(v) => {
                        const col = columns.find((c) => c.id === v);
                        updateTask({ column_id: v, status: (col?.status || "todo") as any });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={activeTask.priority} onValueChange={(v) => updateTask({ priority: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Assignee</Label>
                    <EmployeePicker
                      value={activeTask.assignee_id}
                      onChange={(id) => updateTask({ assignee_id: id })}
                      placeholder="Unassigned"
                      restrictToIds={memberProfiles.map((p) => p.id)}
                    />
                  </div>
                  <div>
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={activeTask.due_date || ""}
                      onChange={(e) => updateTask({ due_date: e.target.value || null })}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground pt-2">
                    Reporter: {profileFor((activeTask as any).reporter_id)?.full_name || "—"}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskBoard;
