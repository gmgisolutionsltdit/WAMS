import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  MoreHorizontal, X, UserPlus, Info, Lock, Star, Archive,
} from "lucide-react";
import { isBoardStarred, toggleStarredBoard } from "@/lib/boardPrefs";
import { cn } from "@/lib/utils";

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
export const BoardMenu = ({ project, canEdit, onOpenMembers, onProjectUpdated }: {
  project: Project;
  canEdit: boolean;
  onOpenMembers: () => void;
  onProjectUpdated: (patch: Partial<Project>) => void;
}) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "about" | "visibility">("menu");
  const [description, setDescription] = useState(project.description || "");
  const [starred, setStarred] = useState(() => isBoardStarred(project.id));
  const [saving, setSaving] = useState(false);

  const close = () => { setOpen(false); setPanel("menu"); };

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
          <span className="text-sm font-medium">Menu</span>
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
