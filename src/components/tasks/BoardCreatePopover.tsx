import { ReactNode, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { LayoutGrid } from "lucide-react";

type Visibility = "private" | "workspace" | "public";

// Trello-style visibility: who can see the board, and (for "workspace") who
// can edit it too — "public" stays view-only for non-members, same as
// Trello's "anyone on the internet can see, only board members can edit".
const VISIBILITY_OPTIONS: Record<Visibility, { label: string; description: string }> = {
  private: { label: "Private", description: "Only board members can see and edit this board." },
  workspace: { label: "Workspace", description: "Everyone in the company can see and edit this board." },
  public: { label: "Public", description: "Everyone in the company can see this board. Only board members can edit." },
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
  const [form, setForm] = useState({ key: "", name: "", description: "", wing: "GMGI", visibility: "private" as Visibility });

  const create = async () => {
    if (!form.key || !form.name) { toast.error("Key and name required"); return; }
    const { data, error } = await supabase
      .from("projects")
      .insert({
        key: form.key.toUpperCase(),
        name: form.name,
        description: form.description || null,
        wing: form.wing as "GMGI" | "MORU",
        owner_id: user!.id,
        visibility: form.visibility,
      })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }

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
    setStep("menu");
    setForm({ key: "", name: "", description: "", wing: "GMGI", visibility: "private" });
    onCreated?.(data.id);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); setStep("menu"); }}>
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
            <div><Label>Board Key (e.g. ENG)</Label><Input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} maxLength={10} /></div>
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
            <div>
              <Label>Visibility</Label>
              <Select value={form.visibility} onValueChange={(v) => setForm((f) => ({ ...f, visibility: v as Visibility }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(VISIBILITY_OPTIONS) as Visibility[]).map((key) => (
                    <SelectItem key={key} value={key}>{VISIBILITY_OPTIONS[key].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{VISIBILITY_OPTIONS[form.visibility].description}</p>
            </div>
            <Button className="w-full" onClick={create}>Create</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
