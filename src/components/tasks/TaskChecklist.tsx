import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItemRow {
  id: string;
  text: string;
  done: boolean;
}

interface Props {
  id: string;
  title: string;
  items: ChecklistItemRow[];
  onRename: (title: string) => void;
  onDelete: () => void;
  onToggleItem: (itemId: string, done: boolean) => void;
  onDeleteItem: (itemId: string) => void;
  onConvertItem: (itemId: string, text: string) => void;
  onEditItem: (itemId: string, text: string) => void;
  onAddItem: (text: string) => void;
}

// Trello's per-item "..." → "Item actions" popover: Convert to card, Delete.
const ItemActionsMenu = ({
  onConvert,
  onDelete,
}: {
  onConvert: () => void;
  onDelete: () => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
          aria-label="Item actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <p className="text-xs font-semibold text-center text-muted-foreground py-1">Item actions</p>
        <button
          type="button"
          className="w-full text-left text-sm rounded px-2 py-1.5 hover:bg-accent"
          onClick={() => { onConvert(); setOpen(false); }}
        >
          Convert to card
        </button>
        <button
          type="button"
          className="w-full text-left text-sm rounded px-2 py-1.5 hover:bg-accent text-destructive"
          onClick={() => { onDelete(); setOpen(false); }}
        >
          Delete
        </button>
      </PopoverContent>
    </Popover>
  );
};

// Trello-style named checklist block: editable title, a progress bar, its
// items, and an "Add an item" row that expands into an input + Add/Cancel.
export const TaskChecklist = ({ id, title, items, onRename, onDelete, onToggleItem, onDeleteItem, onConvertItem, onEditItem, onAddItem }: Props) => {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [addingItem, setAddingItem] = useState(false);
  const [itemDraft, setItemDraft] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemDraft, setEditItemDraft] = useState("");

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const saveTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== title) onRename(trimmed);
    else setTitleDraft(title);
  };

  const submitItem = () => {
    const trimmed = itemDraft.trim();
    if (!trimmed) { setAddingItem(false); return; }
    onAddItem(trimmed);
    setItemDraft("");
  };

  const startEditItem = (item: ChecklistItemRow) => {
    setEditingItemId(item.id);
    setEditItemDraft(item.text);
  };

  const saveEditItem = () => {
    const trimmed = editItemDraft.trim();
    if (editingItemId && trimmed) onEditItem(editingItemId, trimmed);
    setEditingItemId(null);
  };

  return (
    <div className="space-y-2" data-checklist-id={id}>
      <div className="flex items-center gap-2">
        {editingTitle ? (
          <Input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") { setTitleDraft(title); setEditingTitle(false); }
            }}
            className="h-7 text-sm font-semibold px-1 -ml-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setTitleDraft(title); setEditingTitle(true); }}
            className="text-sm font-semibold text-left flex-1 rounded px-1 -ml-1 hover:bg-accent"
          >
            {title}
          </button>
        )}
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onDelete}>
          <Trash2 className="h-3 w-3 mr-1" /> Delete
        </Button>
      </div>

      {total > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-9 shrink-0">{pct}%</span>
          <Progress value={pct} className="h-2" />
        </div>
      )}

      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="group">
            {editingItemId === item.id ? (
              <div className="space-y-2 py-1">
                <Input
                  autoFocus
                  value={editItemDraft}
                  onChange={(e) => setEditItemDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveEditItem(); }
                    else if (e.key === "Escape") setEditingItemId(null);
                  }}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEditItem}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingItemId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={(e) => onToggleItem(item.id, e.target.checked)}
                  className="h-4 w-4"
                />
                <button
                  type="button"
                  onClick={() => startEditItem(item)}
                  className={cn(
                    "flex-1 text-left text-sm rounded px-1 -mx-1 hover:bg-accent",
                    item.done && "line-through text-muted-foreground",
                  )}
                >
                  {item.text}
                </button>
                <ItemActionsMenu
                  onConvert={() => onConvertItem(item.id, item.text)}
                  onDelete={() => onDeleteItem(item.id)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {addingItem ? (
        <div className="space-y-2">
          <Input
            autoFocus
            value={itemDraft}
            onChange={(e) => setItemDraft(e.target.value)}
            placeholder="Add an item..."
            onKeyDown={(e) => {
              if (e.key === "Enter") submitItem();
              else if (e.key === "Escape") { setItemDraft(""); setAddingItem(false); }
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={submitItem}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setItemDraft(""); setAddingItem(false); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddingItem(true)}>
          Add an item
        </Button>
      )}
    </div>
  );
};

export default TaskChecklist;
