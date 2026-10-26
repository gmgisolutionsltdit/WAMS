import { ReactNode, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { ChevronLeft, LayoutGrid, X } from "lucide-react";

type Visibility = "private" | "workspace" | "public";

// Trello-style visibility: who can see the board, and (for "workspace") who
// can edit it too — "public" stays view-only for non-members, same as
// Trello's "anyone on the internet can see, only board members can edit".
const VISIBILITY_OPTIONS: Record<Visibility, { label: string; description: string }> = {
  private: { label: "Private", description: "Only board members can see and edit this board." },
  workspace: { label: "Workspace", description: "Everyone in the company can see and edit this board." },
  public: { label: "Public", description: "Everyone in the company can see this board. Only board members can edit." },
};

// projects.key must be a unique, short identifier (it prefixes every ticket,
// e.g. "ENG-1") but Trello's own create form has no such field — derive one
// from the title instead, so the person only ever types a title.
const slugKey = (title: string) => {
  const letters = title.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (letters || "BRD").slice(0, 5);
};

// Shared "Create board" popover (menu -> form) used both by the header
// Create button and the dashed "Create new board" tile, so the board
// creation flow — including visibility — only needs to be implemented once.
export const BoardCreatePopover = ({ trigger, align = "end", onCreated }: {
  trigger: ReactNode;
  align?: "start" | "end";
  onCreated?: (projectId: string) => void;
}) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"menu" | "form">("menu");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setStep("menu");
    setTitle("");
    setVisibility("private");
  };

  const create = async () => {
    const name = title.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const baseKey = slugKey(name);
      let data: { id: string } | null = null;
      let error: { code?: string; message: string } | null = null;
      // Sequential suffixes (BRD2, BRD3, ...) first, since those read best;
      // after a handful of collisions (e.g. many boards whose titles all
      // reduce to the same short key) fall back to a random suffix so
      // creation can't get permanently stuck for a valid title.
      for (let attempt = 0; attempt < 20; attempt++) {
        const key = attempt === 0 ? baseKey
          : attempt < 5 ? `${baseKey}${attempt + 1}`
          : `${baseKey}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const res = await supabase
          .from("projects")
          .insert({ key, name, owner_id: user!.id, visibility })
          .select("id")
          .single();
        data = res.data;
        error = res.error;
        if (!error || error.code !== "23505") break;
      }
      if (error || !data) { toast.error(error?.message || "Could not create board"); return; }

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

      toast.success("Board created");
      setOpen(false);
      reset();
      onCreated?.(data.id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); reset(); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} aria-label="Create board" className={step === "menu" ? "w-56 p-1" : "w-80"}>
        {step === "menu" ? (
          <button
            type="button"
            onClick={() => setStep("form")}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent text-left"
          >
            <LayoutGrid className="h-4 w-4 text-muted-foreground" /> Create board
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between -mt-1 -mx-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setStep("menu")} aria-label="Back">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">Create board</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setOpen(false); reset(); }} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div>
              <Label>Board title *</Label>
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={title.trim() ? "" : "border-destructive focus-visible:ring-destructive"}
              />
              {!title.trim() && <p className="text-xs text-muted-foreground mt-1">👋 Board title is required</p>}
            </div>
            <div>
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(VISIBILITY_OPTIONS) as Visibility[]).map((key) => (
                    <SelectItem key={key} value={key}>{VISIBILITY_OPTIONS[key].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{VISIBILITY_OPTIONS[visibility].description}</p>
            </div>
            <Button className="w-full" onClick={create} disabled={!title.trim() || creating}>Create</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
