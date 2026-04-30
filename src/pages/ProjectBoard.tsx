import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
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
import { ArrowLeft, Plus, MessageSquare, Loader2, AlertCircle } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { EmployeePicker } from "@/components/EmployeePicker";
import { ProjectMemberSelector } from "@/components/ProjectMemberSelector";
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
import { arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn, KanbanColumnData } from "@/components/kanban/KanbanColumn";
import { KanbanCard, KanbanTask, Profile } from "@/components/kanban/KanbanCard";
import { KanbanEmptyState } from "@/components/kanban/KanbanEmptyState";

const PRIORITIES = ["low", "medium", "high", "urgent"];

const ProjectBoard = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

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

  const [createOpen, setCreateOpen] = useState(false);
  const [createColId, setCreateColId] = useState<string | null>(null);
  const [taskCounter, setTaskCounter] = useState(0);
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", assignee_id: "", due_date: "" });

  const [addColOpen, setAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState("");

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
      console.error("[ProjectBoard] failed to create board:", error);
      return null;
    }
    const { error: colErr } = await supabase.from("task_columns").insert([
      { board_id: created.id, name: "To Do", status: "todo", position: 0 },
      { board_id: created.id, name: "In Progress", status: "in_progress", position: 1 },
      { board_id: created.id, name: "Completed", status: "done", position: 2 },
    ]);
    if (colErr) console.error("[ProjectBoard] failed to seed columns:", colErr);
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
        setLoadError("Project not found or you don't have access.");
        setLoading(false);
        return;
      }
      setProject(pj);
      setProfiles((pf || []) as Profile[]);
      setMembers((mem || []) as any);

      const bId = await ensureBoard(projectId);
      if (!bId) {
        setLoadError("Could not load or create the board for this project.");
        setLoading(false);
        return;
      }
      setBoardId(bId);

      const [{ data: cols }, { data: tks }] = await Promise.all([
        supabase.from("task_columns").select("*").eq("board_id", bId).order("position"),
        supabase.from("tasks").select("*").eq("project_id", projectId).order("position"),
      ]);
      setColumns((cols || []) as KanbanColumnData[]);
      setTasks((tks || []) as KanbanTask[]);
      setTaskCounter((tks || []).length);
    } catch (e: any) {
      console.error("[ProjectBoard] fetchAll error:", e);
      setLoadError(e.message || "Failed to load project.");
    } finally {
      setLoading(false);
    }
  }, [projectId, ensureBoard]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useRealtimeSubscription("tasks", fetchAll, `tasks-${projectId}`);
  useRealtimeSubscription("task_columns", fetchAll, `cols-${projectId}`);

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
    const t = tasks.find((x) => x.id === e.active.id);
    if (t) setDraggingTask(t);
  };

  const handleDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
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

  const openTask = async (t: KanbanTask) => {
    setActiveTask(t);
    const { data } = await supabase
      .from("task_comments")
      .select("*")
      .eq("task_id", t.id)
      .order("created_at");
    setComments(data || []);
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

  /* ---------- Render ---------- */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading project…
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
        <h3 className="font-semibold mb-1">Couldn't open this project</h3>
        <p className="text-sm text-muted-foreground mb-4">{loadError || "Unknown error"}</p>
        <Button variant="outline" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Projects
        </Button>
      </div>
    );
  }

  const totalTasks = tasks.length;
  const isOwnerOrAdmin = project.owner_id === user?.id;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={() => navigate("/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Badge variant="outline">{project.key}</Badge>
              {project.name}
            </h2>
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddColOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Column
          </Button>
          <ProjectMemberSelector
            projectId={projectId!}
            project={project}
            members={members}
            onChanged={fetchAll}
          />
        </div>
      </div>

      {/* Hint banner when board is empty — but always render the columns below */}
      {totalTasks === 0 && columns.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-b from-muted/30 to-transparent border border-border/60">
          <KanbanEmptyState onCreate={() => openCreate(columns[0].id)} />
        </div>
      )}

      {columns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
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
          <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
            {columns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={tasksByColumn[col.id] || []}
                profiles={profiles}
                onCreateTask={openCreate}
                onOpenTask={openTask}
                onDeleteColumn={deleteColumn}
                canDelete={isOwnerOrAdmin}
              />
            ))}
          </div>

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
      <Dialog open={!!activeTask} onOpenChange={(o) => !o && setActiveTask(null)}>
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

export default ProjectBoard;
