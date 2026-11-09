import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { LIST_BACKGROUND_COLOR } from "@/lib/boardPrefs";
import { cn } from "@/lib/utils";

interface Props {
  /** "Add a list" for the first/only trigger, "Add another list" once at
   * least one list already exists — matching Trello's own wording. */
  label: string;
  onAdd: (name: string) => Promise<void> | void;
}

// Trello's own "+ Add a list" flow: a plain trigger that turns into an
// inline textarea + Add list/X right on the board canvas — never a modal.
// Submitting keeps the input open (cleared) so several lists can be added
// back to back, same as Trello.
export const AddListInline = ({ label, onAdd }: Props) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const start = () => {
    setEditing(true);
    setName("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setEditing(false); return; }
    await onAdd(trimmed);
    setName("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={start}
        className="shrink-0 w-[272px] h-10 rounded-xl bg-white/60 hover:bg-white/90 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 transition-colors"
      >
        <Plus className="h-4 w-4" /> {label}
      </button>
    );
  }

  return (
    <div className={cn("shrink-0 w-[272px] rounded-xl p-2 space-y-2", LIST_BACKGROUND_COLOR)}>
      <Textarea
        ref={textareaRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter list name..."
        rows={1}
        className="min-h-[36px] resize-none bg-card text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          else if (e.key === "Escape") setEditing(false);
        }}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit}>Add list</Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(false)} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default AddListInline;
