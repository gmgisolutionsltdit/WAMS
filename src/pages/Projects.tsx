import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FolderKanban, ArrowRight } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

type Project = {
  id: string; key: string; name: string; description: string | null;
  wing: string | null; owner_id: string; archived: boolean;
};

const Projects = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ key: "", name: "", description: "", wing: "GMGI" });

  const fetchProjects = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    setProjects((data || []) as Project[]);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useRealtimeSubscription("projects", fetchProjects, "projects-list");

  const create = async () => {
    if (!form.key || !form.name) { toast.error("Key and name required"); return; }
    const { data, error } = await supabase
      .from("projects")
      .insert({
        key: form.key.toUpperCase(),
        name: form.name,
        description: form.description || null,
        wing: form.wing as any,
        owner_id: user!.id,
      })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }

    // Create a default board with default columns
    const { data: board } = await supabase
      .from("task_boards")
      .insert({ project_id: data.id, name: "Main Board", position: 0 })
      .select("id")
      .single();

    if (board) {
      await supabase.from("task_columns").insert([
        { board_id: board.id, name: "To Do", status: "todo", position: 0 },
        { board_id: board.id, name: "In Progress", status: "in_progress", position: 1 },
        { board_id: board.id, name: "In Review", status: "in_review", position: 2 },
        { board_id: board.id, name: "Done", status: "done", position: 3 },
      ]);
    }

    toast.success("Project created");
    setOpen(false);
    setForm({ key: "", name: "", description: "", wing: "GMGI" });
    fetchProjects();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FolderKanban className="h-6 w-6" /> Projects
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> New Project</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>Projects are work spaces with kanban boards and tickets.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Project Key (e.g. ENG)</Label><Input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} maxLength={10} /></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
              <div>
                <Label>Wing</Label>
                <Select value={form.wing} onValueChange={(v) => setForm((f) => ({ ...f, wing: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GMGI">GMGI</SelectItem>
                    <SelectItem value="MORU">MORU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={create}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">
          <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No projects yet. Create your first project to start organizing tasks.</p>
        </CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate(`/projects/${p.id}`)}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{p.key}</Badge>
                    {p.name}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-2">{p.description || "No description"}</p>
                {p.wing && <Badge className="mt-2" variant="secondary">{p.wing}</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Projects;
