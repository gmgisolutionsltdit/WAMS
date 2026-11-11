import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, Search } from "lucide-react";
import type { VisibleEmployee } from "@/hooks/useVisibleEmployees";

interface Props {
  assignees: VisibleEmployee[];
  allEmployees: VisibleEmployee[];
  onToggle: (userId: string, checked: boolean) => void;
  className?: string;
}

const initials = (name?: string | null, email?: string | null) =>
  (name || email || "?").slice(0, 2).toUpperCase();

// Trello's multi-select Members popover: every assignee can be checked
// independently, unlike the single-assignee picker used elsewhere.
export const TaskAssigneesPopover = ({ assignees, allEmployees, onToggle, className }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const assignedIds = useMemo(() => new Set(assignees.map((a) => a.id)), [assignees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allEmployees;
    return allEmployees.filter((e) =>
      [e.full_name, e.email, e.department, e.designation]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }, [allEmployees, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className || "h-auto py-1.5"}>
          {assignees.length > 0 ? (
            <span className="flex items-center -space-x-2 mr-1.5">
              {assignees.slice(0, 3).map((a) => (
                <Avatar key={a.id} className="h-5 w-5 border border-background">
                  <AvatarImage src={a.photo_url || undefined} />
                  <AvatarFallback className="text-[9px]">{initials(a.full_name, a.email)}</AvatarFallback>
                </Avatar>
              ))}
              {assignees.length > 3 && (
                <span className="h-5 w-5 rounded-full bg-muted border border-background text-[9px] flex items-center justify-center">
                  +{assignees.length - 3}
                </span>
              )}
            </span>
          ) : (
            <Users className="h-4 w-4 mr-1.5" />
          )}
          Members
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 space-y-2" align="start">
        <p className="text-xs font-semibold text-center text-muted-foreground">Members</p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search members"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7"
          />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No employees found.</p>
          ) : (
            filtered.map((e) => {
              const checked = assignedIds.has(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onToggle(e.id, !checked)}
                  className="w-full flex items-center gap-2 p-1.5 rounded-md hover:bg-accent text-left"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={e.photo_url || undefined} />
                    <AvatarFallback className="text-[10px]">{initials(e.full_name, e.email)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{e.full_name || e.email}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[e.designation, e.department, e.company_wing].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TaskAssigneesPopover;
