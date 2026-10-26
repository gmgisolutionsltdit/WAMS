import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Plus, Search, LayoutGrid } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { colorForBoard, getRecentBoardIds } from "@/lib/boardPrefs";
import { cn } from "@/lib/utils";

type Board = {
  id: string; key: string; name: string; description: string | null;
  wing: string | null; owner_id: string; archived: boolean;
};

// Shared Trello-style "search boards / create board" bar — used on the Tasks
// home screen and, identically, inside every board's own header so you never
// have to go back to Tasks just to jump to or create another board.
export const BoardSearchCreate = ({ className }: { className?: string }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [boards, setBoards] = useState<Board[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecentBoardIds());
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState<"menu" | "form">("menu");
  const [form, setForm] = useState({ key: "", name: "", description: "", wing: "GMGI" });

  const fetchBoards = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    setBoards((data || []) as Board[]);
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);
  useRealtimeSubscription("projects", fetchBoards, "task-boards-switcher");
  useEffect(() => { setRecentIds(getRecentBoardIds()); }, [boards]);

  // Trello-style "/" shortcut: focuses the search box unless the user is already typing somewhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const recentBoards = useMemo(
    () => recentIds.map((id) => boards.find((b) => b.id === id)).filter((b): b is Board => !!b).slice(0, 5),
    [recentIds, boards]
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recentBoards;
    return boards.filter((b) => b.name.toLowerCase().includes(q) || b.key.toLowerCase().includes(q)).slice(0, 8);
  }, [query, boards, recentBoards]);

  const openBoard = (id: string) => {
    setQuery("");
    searchInputRef.current?.blur();
    navigate(`/tasks/${id}`);
  };

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
    setCreateOpen(false);
    setCreateStep("menu");
    setForm({ key: "", name: "", description: "", wing: "GMGI" });
    navigate(`/tasks/${data.id}`);
  };

  return (
    <div className={cn("flex items-center gap-2 w-full max-w-md", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          placeholder="Search boards"
          className="pl-8 pr-8"
        />
        {!searchFocused && !query && (
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground border rounded px-1 py-0.5 pointer-events-none">/</kbd>
        )}
        {searchFocused && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
            <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground tracking-wide">
              {query.trim() ? "BOARDS" : "RECENT BOARDS"}
            </p>
            {searchResults.length === 0 ? (
              <p className="px-3 pb-3 text-sm text-muted-foreground">No boards found</p>
            ) : (
              <div className="pb-1">
                {searchResults.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => openBoard(b.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                  >
                    <span className={cn("h-6 w-9 rounded shrink-0", colorForBoard(b.id))} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{b.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{b.key}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Popover open={createOpen} onOpenChange={(o) => { setCreateOpen(o); setCreateStep("menu"); }}>
        <PopoverTrigger asChild>
          <Button><Plus className="mr-1 h-4 w-4" /> Create</Button>
        </PopoverTrigger>
        <PopoverContent align="end" aria-label="Create board" className={createStep === "menu" ? "w-56 p-1" : "w-80"}>
          {createStep === "menu" ? (
            <button
              type="button"
              onClick={() => setCreateStep("form")}
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
              <Button className="w-full" onClick={create}>Create</Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
