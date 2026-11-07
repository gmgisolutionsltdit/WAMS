import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ChecklistOption {
  id: string;
  title: string;
}

interface Props {
  nextDefaultTitle: string;
  existingChecklists: ChecklistOption[];
  onAdd: (title: string, copyFromId: string | null) => void;
  trigger: React.ReactNode;
}

// Trello's "Add checklist" popover: a title (defaulting to "Checklist" /
// "Checklist 2" / ...) and an optional "copy items from" source checklist on
// this same card.
export const AddChecklistPopover = ({ nextDefaultTitle, existingChecklists, onAdd, trigger }: Props) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(nextDefaultTitle);
  const [copyFrom, setCopyFrom] = useState<string>("none");

  const openChange = (o: boolean) => {
    if (o) {
      setTitle(nextDefaultTitle);
      setCopyFrom("none");
    }
    setOpen(o);
  };

  const submit = () => {
    onAdd(title.trim() || nextDefaultTitle, copyFrom === "none" ? null : copyFrom);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <p className="text-sm font-semibold text-center">Add checklist</p>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        {existingChecklists.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Copy items from...</Label>
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">(none)</SelectItem>
                {existingChecklists.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button className="w-full" size="sm" onClick={submit}>Add</Button>
      </PopoverContent>
    </Popover>
  );
};

export default AddChecklistPopover;
