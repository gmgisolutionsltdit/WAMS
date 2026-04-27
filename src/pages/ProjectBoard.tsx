import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Settings as SettingsIcon, Calendar as CalendarIcon, MessageSquare,
} from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { EmployeePicker } from "@/components/EmployeePicker";
import { ProjectMemberSelector } from "@/components/ProjectMemberSelector";

type Column = { id: string; name: string; status: string; position: number; board_id: string };
type Task = {
  id: string; project_id: string; board_id: string | null; column_id: string | null;
  ticket_key: string | null; title: string; description: string | null;
  status: string; priority: string; assignee_id: string | null; reporter_id: string;
  due_date: string | null; labels: string[]; position: number; created_at: string;
};
type Profile = { id: string; full_name: string | null; email: string | null; photo_url: string | null };

const PRIORITIES = ["low", "medium", "high", "urgent"];
const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-300",
  medium: "bg-blue-100 text-blue-700 border-blue-300",
  high: "bg-orange-100 text-orange-700 border-orange-300",
  urgent: "bg-red-100 text-red-700 border-red-300",
};

const ProjectBoard = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<any>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createColId, setCreateColId] = useState<string | null>(null);
  const [taskCounter, setTaskCounter] = useState(0);
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium", assignee_id: "", due_date: "",
  });
  const [draggingTask, setDraggingTask] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    const [{ data: pj }, { data: brd }, { data: pf }, { data: mem }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).single(),
      supabase.from("task_boards").select("*").eq("project_id", projectId).order("position").limit(1).maybeSingle(),
      supabase.from("profiles").select("id, full_name, email, photo_url"),
      supabase.from("project_members").select("user_id, role").eq("project_id", projectId),
    ]);
    setProject(pj);
    setProfiles((pf || []) as Profile[]);
    setMembers((mem || []) as any);
    if (brd) {
      setBoardId(brd.id);
      const [{ data: cols }, { data: tks }] = await Promise.all([
        supabase.from("task_columns").select("*").eq("board_id", brd.id).order("position"),
        supabase.from("tasks").select("*").eq("project_id", projectId).order("position"),
      ]);
      setColumns((cols || []) as Column[]);
      setTasks((tks || []) as Task[]);
      setTaskCounter((tks || []).length);
    }
  }, [projectId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useRealtimeSubscription("tasks", fetchAll, `tasks-${projectId}`);
  useRealtimeSubscription("task_columns", fetchAll, `cols-${projectId}`);

  const memberProfiles = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.user_id));
    if (project?.owner_id) memberIds.add(project.owner_id);
    return profiles.filter((p) => memberIds.has(p.id));
  }, [members, profiles, project]);

  const tasksByColumn = useMemo(() => {
    const map: Record<string, Task[]> = {};
    columns.forEach((c) => { map[c.id] = []; });
    tasks.forEach((t) => {
      if (t.column_id && map[t.column_id]) map[t.column_id].push(t);
    });
    return map;
  }, [tasks, columns]);

  const profileFor = (id: string | null) => id ? profiles.find((p) => p.id === id) : null;

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

  const openTask = async (t: Task) => {
    setActiveTask(t);
    const { data } = await supabase
      .from("task_comments")
      .select("*")
      .eq("task_id", t.id)
      .order("created_at");
    setComments(data || []);
  };

  const updateTask = async (patch: Partial<Task>) => {
    if (!activeTask) return;
    const { error } = await supabase.from("tasks").update(patch as any).eq("id", activeTask.id);
    if (error) { toast.error(error.message); return; }
    setActiveTask({ ...activeTask, ...patch } as Task);
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

  const handleDragStart = (taskId: string) => setDraggingTask(taskId);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = async (colId: string) => {
    if (!draggingTask) return;
    const col = columns.find((c) => c.id === colId);
    if (!col) return;
    const { error } = await supabase
      .from("tasks")
      .update({ column_id: colId, status: col.status as any, ...(col.status === "done" ? { completed_at: new Date().toISOString() } : {}) })
      .eq("id", draggingTask);
    if (error) toast.error(error.message);
    setDraggingTask(null);
  };

  if (!project) return <div className="p-6 text-muted-foreground">Loading project…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={() => navigate("/projects")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Badge variant="outline">{project.key}</Badge>
              {project.name}
            </h2>
            {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <ProjectMemberSelector
            projectId={projectId!}
            project={project}
            members={members}
            onChanged={fetchAll}
          />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div
            key={col.id}
            className="min-w-[280px] w-[280px] bg-muted/40 rounded-lg p-3 flex flex-col"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(col.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{col.name}</span>
                <Badge variant="outline" className="text-xs">{tasksByColumn[col.id]?.length || 0}</Badge>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openCreate(col.id)}><Plus className="h-3 w-3" /></Button>
            </div>
            <div className="space-y-2 flex-1 min-h-[80px]">
              {(tasksByColumn[col.id] || []).map((t) => {
                const ap = profileFor(t.assignee_id);
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => handleDragStart(t.id)}
                    onClick={() => openTask(t)}
                    className="bg-card border rounded-md p-2 cursor-pointer hover:border-primary transition-colors"
                  >
                    <div className="text-xs text-muted-foreground mb-1">{t.ticket_key}</div>
                    <div className="text-sm font-medium mb-2 line-clamp-2">{t.title}</div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</Badge>
                      {ap && (
                        <Avatar className="h-6 w-6"><AvatarImage src={ap.photo_url || undefined} /><AvatarFallback className="text-[10px]">{(ap.full_name || "?").slice(0, 2)}</AvatarFallback></Avatar>
                      )}
                    </div>
                    {t.due_date && (
                      <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />{t.due_date}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>Add a new ticket to this column.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Due Date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} /></div>
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

      {/* Task Detail Drawer */}
      <Dialog open={!!activeTask} onOpenChange={(o) => !o && setActiveTask(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {activeTask && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline">{activeTask.ticket_key}</Badge>
                  <Input value={activeTask.title} onChange={(e) => setActiveTask({ ...activeTask, title: e.target.value })} onBlur={(e) => updateTask({ title: e.target.value })} className="border-0 text-lg font-semibold" />
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
                      rows={4}
                    />
                  </div>
                  <div>
                    <Label className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Comments</Label>
                    <div className="space-y-2 max-h-60 overflow-y-auto my-2">
                      {comments.map((c) => {
                        const cp = profileFor(c.user_id);
                        return (
                          <div key={c.id} className="flex gap-2 text-sm">
                            <Avatar className="h-6 w-6"><AvatarImage src={cp?.photo_url || undefined} /><AvatarFallback className="text-[10px]">{(cp?.full_name || "?").slice(0, 2)}</AvatarFallback></Avatar>
                            <div className="flex-1">
                              <div className="text-xs text-muted-foreground">{cp?.full_name || cp?.email} · {new Date(c.created_at).toLocaleString()}</div>
                              <div>{c.body}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." onKeyDown={(e) => e.key === "Enter" && addComment()} />
                      <Button size="sm" onClick={addComment}>Post</Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Status</Label>
                    <Select value={activeTask.column_id || ""} onValueChange={(v) => {
                      const col = columns.find((c) => c.id === v);
                      updateTask({ column_id: v, status: (col?.status || "todo") as any });
                    }}>
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
                  <div><Label>Due Date</Label><Input type="date" value={activeTask.due_date || ""} onChange={(e) => updateTask({ due_date: e.target.value || null })} /></div>
                  <div className="text-xs text-muted-foreground pt-2">
                    Reporter: {profileFor(activeTask.reporter_id)?.full_name || "—"}
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
