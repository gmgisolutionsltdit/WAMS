import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  MoreHorizontal, X, UserPlus, Info, Lock, Star, Archive, ArchiveRestore, Loader2, ChevronLeft,
} from "lucide-react";
import { isBoardStarred, toggleStarredBoard } from "@/lib/boardPrefs";
import { cn } from "@/lib/utils";

type ArchivedTask = { id: string; ticket_key: string | null; title: string };
type ArchivedColumn = { id: string; name: string };

type Visibility = "private" | "workspace" | "public";

const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: "Private",
  workspace: "Workspace",
  public: "Public",
};

type Project = { id: string; description: string | null; visibility: Visibility };

// Trello-style board "Menu" (the three-dot button in the board header) —
// a focused subset of Trello's own menu limited to what WAMS can actually
// back: sharing (board members), the board description, visibility, the
// per-browser star, and archiving ("Close board"). Trello's paid-tier
// items (Power-Ups, Custom Fields, Stickers, templates) and ones with no
// WAMS equivalent (per-card archive, board-level Watch, Copy board,
// email-to-board, abuse reports) are left out rather than shown unwired.
export const BoardMenu = ({ project, canEdit, onOpenMembers, onProjectUpdated, onTaskRestored, onColumnRestored }: {
  project: Project;
  canEdit: boolean;
  onOpenMembers: () => void;
  onProjectUpdated: (patch: Partial<Project>) => void;
  // Called after an archived card is restored, so the board can refetch it.
  onTaskRestored?: () => void;
  // Called after an archived list is restored or deleted, so it reappears.
  onColumnRestored?: () => void;
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "about" | "visibility" | "archived">("menu");
  const [description, setDescription] = useState(project.description || "");
  const [starred, setStarred] = useState(() => isBoardStarred(project.id));
  const [saving, setSaving] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<ArchivedTask[]>([]);
  const [archivedColumns, setArchivedColumns] = useState<ArchivedColumn[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedTab, setArchivedTab] = useState<"cards" | "lists">("cards");
  const [archivedSearch, setArchivedSearch] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const close = () => { setOpen(false); setPanel("menu"); };

  const openArchived = async () => {
    setPanel("archived");
    setArchivedTab("cards");
    setArchivedSearch("");
    setArchivedLoading(true);
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, ticket_key, title")
      .eq("project_id", project.id)
      .eq("archived", true)
      .order("updated_at", { ascending: false });
    setArchivedTasks((tasks || []) as ArchivedTask[]);

    const { data: board } = await supabase.from("task_boards").select("id").eq("project_id", project.id).maybeSingle();
    if (board) {
      const { data: cols } = await supabase
        .from("task_columns")
        .select("id, name")
        .eq("board_id", board.id)
        .eq("archived", true)
        .order("position");
      setArchivedColumns((cols || []) as ArchivedColumn[]);
    } else {
      setArchivedColumns([]);
    }
    setArchivedLoading(false);
  };

  const restoreTask = async (taskId: string) => {
    setRestoringId(taskId);
    // "Members update tasks" RLS can reject this for a non-editor viewer of
    // a Public board without raising an error — ask for the row back so a
    // zero-row (RLS-filtered) update is reported as a failure, not success.
    const { data, error } = await supabase.from("tasks").update({ archived: false }).eq("id", taskId).select("id");
    setRestoringId(null);
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error("You don't have permission to restore this card."); return; }
    setArchivedTasks((prev) => prev.filter((t) => t.id !== taskId));
    onTaskRestored?.();
    toast.success("Card restored");
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm("Delete this card permanently?")) return;
    setRestoringId(taskId);
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    setRestoringId(null);
    if (error) { toast.error(error.message); return; }
    setArchivedTasks((prev) => prev.filter((t) => t.id !== taskId));
    toast.success("Card deleted");
  };

  const restoreColumn = async (colId: string) => {
    setRestoringId(colId);
    const { data, error } = await supabase.from("task_columns").update({ archived: false }).eq("id", colId).select("id");
    setRestoringId(null);
    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error("You don't have permission to restore this list."); return; }
    setArchivedColumns((prev) => prev.filter((c) => c.id !== colId));
    onColumnRestored?.();
    toast.success("List restored");
  };

  const deleteColumnPermanently = async (colId: string) => {
    if (!confirm("Delete this list permanently? Any cards left in it will be unassigned from a list.")) return;
    setRestoringId(colId);
    const { error } = await supabase.from("task_columns").delete().eq("id", colId);
    setRestoringId(null);
    if (error) { toast.error(error.message); return; }
    setArchivedColumns((prev) => prev.filter((c) => c.id !== colId));
    onColumnRestored?.();
    toast.success("List deleted");
  };

  const saveDescription = async () => {
    setSaving(true);
    const { error } = await supabase.from("projects").update({ description: description || null }).eq("id", project.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onProjectUpdated({ description: description || null });
    setPanel("menu");
  };

  const changeVisibility = async (v: Visibility) => {
    const { error } = await supabase.from("projects").update({ visibility: v }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    onProjectUpdated({ visibility: v });
    toast.success(`Visibility set to ${VISIBILITY_LABELS[v]}`);
  };

  const toggleStar = () => {
    const next = toggleStarredBoard(project.id);
    setStarred(next.includes(project.id));
  };

  const closeBoard = async () => {
    const { error } = await supabase.from("projects").update({ archived: true }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Board closed");
    close();
    navigate("/tasks");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPanel("menu"); }}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Board menu">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-1">
            {panel !== "menu" && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPanel("menu")} aria-label="Back">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <span className="text-sm font-medium">
              {panel === "archived" ? "Archived items" : panel === "about" ? "About" : panel === "visibility" ? "Visibility" : "Menu"}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={close} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {panel === "menu" && (
          <div className="py-1">
            <button
              type="button"
              onClick={() => { close(); onOpenMembers(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
            >
              <UserPlus className="h-4 w-4 text-muted-foreground" /> Share
            </button>
            <button
              type="button"
              onClick={() => setPanel("about")}
              className="w-full flex items-start gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
            >
              <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
              <span>
                About this board
                <span className="block text-xs text-muted-foreground">
                  {project.description || "Add a description to your board"}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPanel("visibility")}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
            >
              <Lock className="h-4 w-4 text-muted-foreground" /> Visibility: {VISIBILITY_LABELS[project.visibility]}
            </button>
            <button
              type="button"
              onClick={toggleStar}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
            >
              <Star className={cn("h-4 w-4", starred ? "fill-foreground text-foreground" : "text-muted-foreground")} />
              {starred ? "Starred" : "Star"}
            </button>
            <button
              type="button"
              onClick={openArchived}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
            >
              <ArchiveRestore className="h-4 w-4 text-muted-foreground" /> Archived items
            </button>
            {canEdit && (
              <>
                <div className="my-1 border-t" />
                <button
                  type="button"
                  onClick={closeBoard}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left text-destructive"
                >
                  <Archive className="h-4 w-4" /> Close board
                </button>
              </>
            )}
          </div>
        )}

        {panel === "about" && (
          <div className="p-3 space-y-2">
            <Textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a more detailed description…"
              disabled={!canEdit}
              rows={4}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveDescription} disabled={!canEdit || saving}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setDescription(project.description || ""); setPanel("menu"); }}>Cancel</Button>
            </div>
          </div>
        )}

        {panel === "archived" && (
          <div className="p-2 space-y-2">
            <div className="flex gap-1.5">
              <Input
                placeholder="Search"
                value={archivedSearch}
                onChange={(e) => setArchivedSearch(e.target.value)}
                className="h-8 flex-1"
              />
              <div className="flex rounded-md border overflow-hidden shrink-0">
                <button
                  type="button"
                  onClick={() => setArchivedTab("cards")}
                  className={cn("px-2.5 text-xs font-medium", archivedTab === "cards" ? "bg-accent" : "hover:bg-accent/50")}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setArchivedTab("lists")}
                  className={cn("px-2.5 text-xs font-medium border-l", archivedTab === "lists" ? "bg-accent" : "hover:bg-accent/50")}
                >
                  Lists
                </button>
              </div>
            </div>

            {archivedLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
              </div>
            ) : archivedTab === "cards" ? (
              (() => {
                const filtered = archivedTasks.filter((t) =>
                  t.title.toLowerCase().includes(archivedSearch.trim().toLowerCase()),
                );
                if (filtered.length === 0) {
                  return <p className="px-1 py-4 text-sm text-muted-foreground text-center">No archived cards</p>;
                }
                return (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filtered.map((t) => (
                      <div key={t.id} className="px-1 py-1.5 rounded hover:bg-accent">
                        <p className="text-sm truncate">
                          {t.ticket_key && <span className="text-xs font-mono text-muted-foreground mr-1.5">{t.ticket_key}</span>}
                          {t.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs">
                          <button
                            type="button"
                            disabled={restoringId === t.id}
                            onClick={() => restoreTask(t.id)}
                            className="text-primary hover:underline disabled:opacity-50"
                          >
                            Restore
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            disabled={restoringId === t.id}
                            onClick={() => deleteTask(t.id)}
                            className="text-destructive hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            ) : (
              (() => {
                const filtered = archivedColumns.filter((c) =>
                  c.name.toLowerCase().includes(archivedSearch.trim().toLowerCase()),
                );
                if (filtered.length === 0) {
                  return <p className="px-1 py-4 text-sm text-muted-foreground text-center">No archived lists</p>;
                }
                return (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {filtered.map((c) => (
                      <div key={c.id} className="px-1 py-1.5 rounded hover:bg-accent">
                        <p className="text-sm truncate">{c.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs">
                          <button
                            type="button"
                            disabled={restoringId === c.id}
                            onClick={() => restoreColumn(c.id)}
                            className="text-primary hover:underline disabled:opacity-50"
                          >
                            Restore
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            disabled={restoringId === c.id}
                            onClick={() => deleteColumnPermanently(c.id)}
                            className="text-destructive hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {panel === "visibility" && (
          <div className="p-3 space-y-2">
            <Select value={project.visibility} onValueChange={(v) => changeVisibility(v as Visibility)} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((v) => (
                  <SelectItem key={v} value={v}>{VISIBILITY_LABELS[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => setPanel("menu")}>Back</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
