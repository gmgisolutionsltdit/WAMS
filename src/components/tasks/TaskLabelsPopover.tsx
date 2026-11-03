import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChevronLeft, Pencil, X, Check } from "lucide-react";
import { toast } from "sonner";
import { LABEL_PALETTE, DEFAULT_LABEL_COLOR, TaskLabel } from "@/lib/taskLabels";

interface PanelProps {
  boardId: string;
  selectedIds: string[];
  onToggle: (labelId: string) => void;
}

/** The actual Trello-style labels editor — list (search + checkbox toggle +
 * pencil-edit) and the create/edit sub-view (title + color grid + save/
 * delete) — with no opinion on how it's hosted (Popover, Dialog, ...). */
export const TaskLabelsPanel = ({ boardId, selectedIds, onToggle }: PanelProps) => {
  const [labels, setLabels] = useState<TaskLabel[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [colorDraft, setColorDraft] = useState(DEFAULT_LABEL_COLOR);

  const fetchLabels = async () => {
    const { data } = await supabase.from("task_labels").select("*").eq("board_id", boardId).order("position");
    setLabels((data || []) as TaskLabel[]);
  };

  useEffect(() => { fetchLabels(); }, [boardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCreate = () => {
    setEditingId(null);
    setNameDraft("");
    setColorDraft(LABEL_PALETTE[Math.floor(Math.random() * LABEL_PALETTE.length)]);
    setView("edit");
  };

  const startEdit = (l: TaskLabel) => {
    setEditingId(l.id);
    setNameDraft(l.name);
    setColorDraft(l.color);
    setView("edit");
  };

  const save = async () => {
    if (editingId) {
      const { error } = await supabase.from("task_labels").update({ name: nameDraft.trim(), color: colorDraft }).eq("id", editingId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("task_labels").insert({
        board_id: boardId, name: nameDraft.trim(), color: colorDraft, position: labels.length,
      });
      if (error) { toast.error(error.message); return; }
    }
    await fetchLabels();
    setView("list");
  };

  const remove = async () => {
    if (!editingId) return;
    if (!confirm("Delete this label? It will be removed from every card.")) return;
    const { error } = await supabase.from("task_labels").delete().eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    await fetchLabels();
    setView("list");
  };

  const filtered = labels.filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()));

  if (view === "edit") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView("list")} aria-label="Back">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="flex-1 text-center text-sm font-semibold">{editingId ? "Edit label" : "Create label"}</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setView("list")} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-9 rounded-md flex items-center px-2 text-sm text-white font-medium" style={{ backgroundColor: colorDraft }}>
          {nameDraft || "Label preview"}
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8" />
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Select a color</Label>
          <div className="grid grid-cols-5 gap-1.5">
            {LABEL_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColorDraft(c)}
                className="h-7 rounded flex items-center justify-center"
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              >
                {colorDraft === c && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1" onClick={save}>Save</Button>
          {editingId && (
            <Button size="sm" variant="destructive" onClick={remove}>Delete</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-center">Labels</p>
      <Input
        placeholder="Search labels..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-8"
      />
      <div className="space-y-1">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No labels yet</p>
        )}
        {filtered.map((l) => {
          const checked = selectedIds.includes(l.id);
          return (
            <div key={l.id} className="flex items-center gap-2">
              <Checkbox checked={checked} onCheckedChange={() => onToggle(l.id)} />
              <button
                type="button"
                onClick={() => onToggle(l.id)}
                className="flex-1 h-8 rounded-md px-2 text-left text-sm text-white font-medium truncate"
                style={{ backgroundColor: l.color }}
              >
                {l.name}
              </button>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => startEdit(l)} aria-label="Edit label">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={startCreate}>Create a new label</Button>
    </div>
  );
};

interface Props extends PanelProps {
  trigger: ReactNode;
  align?: "start" | "end";
}

/** Popover-hosted labels editor, for a normal clickable trigger (e.g. the
 * "+" button next to a task's label chips). Not usable from inside a
 * DropdownMenu — its content unmounts with the menu before a nested
 * Popover can take over; see TaskLabelsPanel for that case. */
export const TaskLabelsPopover = ({ trigger, align = "start", ...panelProps }: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align={align} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <TaskLabelsPanel {...panelProps} />
      </PopoverContent>
    </Popover>
  );
};

export default TaskLabelsPopover;
