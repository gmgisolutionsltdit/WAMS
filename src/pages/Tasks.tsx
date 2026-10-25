import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import { Plus, FolderKanban, Search, Star, Clock, LayoutGrid } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { colorForBoard, getStarredBoardIds, toggleStarredBoard, getRecentBoardIds } from "@/lib/boardPrefs";
import { cn } from "@/lib/utils";

type Board = {
  id: string; key: string; name: string; description: string | null;
  wing: string | null; owner_id: string; archived: boolean;
};

const BoardTile = ({ board, starred, onToggleStar, onOpen }: {
  board: Board; starred: boolean; onToggleStar: (id: string) => void; onOpen: () => void;
}) => (
  <div
    className="group relative rounded-md border overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
    onClick={onOpen}
  >
    <div className={cn("h-24 relative", colorForBoard(board.id))}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleStar(board.id); }}
        className={cn(
          "absolute top-2 right-2 rounded p-1 text-white hover:bg-white/20 transition-opacity",
          starred ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        )}
        aria-label={starred ? "Unstar board" : "Star board"}
      >
        <Star className={cn("h-4 w-4", starred && "fill-white")} />
      </button>
    </div>
    <div className="bg-card px-3 py-2">
      <p className="text-sm font-medium truncate">{board.name}</p>
      <p className="text-xs text-muted-foreground truncate">{board.key}</p>
    </div>
  </div>
);

const Tasks = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);
  const [createTrigger, setCreateTrigger] = useState<"header" | "tile" | null>(null);
  const [createStep, setCreateStep] = useState<"menu" | "form">("menu");
  const [form, setForm] = useState({ key: "", name: "", description: "", wing: "GMGI" });

  const [starredIds, setStarredIds] = useState<string[]>(() => getStarredBoardIds());
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecentBoardIds());
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchBoards = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    setBoards((data || []) as Board[]);
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);
  useRealtimeSubscription("projects", fetchBoards, "task-boards-list");

  // Refresh "recently viewed" whenever the board list changes (e.g. returning from a board just opened).
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

  const toggleStar = (id: string) => setStarredIds(toggleStarredBoard(id));

  const boardsById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);
  const starredBoards = starredIds.map((id) => boardsById.get(id)).filter((b): b is Board => !!b);
  const recentBoards = recentIds.map((id) => boardsById.get(id)).filter((b): b is Board => !!b).slice(0, 5);

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
        wing: form.wing as any,
        owner_id: user!.id,
      })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }

    // Create a default board with default columns
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
    setCreateTrigger(null);
    setCreateStep("menu");
    setForm({ key: "", name: "", description: "", wing: "GMGI" });
    fetchBoards();
  };

  const handleCreatePopoverChange = (trigger: "header" | "tile", isOpen: boolean) => {
    setCreateTrigger(isOpen ? trigger : null);
    setCreateStep("menu");
  };

  const createPopoverBody = (
    createStep === "menu" ? (
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
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FolderKanban className="h-6 w-6" /> Tasks
        </h2>
        <div className="flex items-center gap-2 w-full max-w-md">
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
          <Popover open={createTrigger === "header"} onOpenChange={(o) => handleCreatePopoverChange("header", o)}>
            <PopoverTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> Create</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className={createStep === "menu" ? "w-56 p-1" : "w-80"}>
              {createPopoverBody}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {boards.length === 0 && (
        <p className="text-sm text-muted-foreground">No boards yet. Create your first board to start organizing tasks.</p>
      )}

      {starredBoards.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Star className="h-4 w-4" /> Starred boards
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {starredBoards.map((b) => (
              <BoardTile key={b.id} board={b} starred onToggleStar={toggleStar} onOpen={() => navigate(`/tasks/${b.id}`)} />
            ))}
          </div>
        </section>
      )}

      {recentBoards.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Clock className="h-4 w-4" /> Recently viewed
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentBoards.map((b) => (
              <BoardTile key={b.id} board={b} starred={starredIds.includes(b.id)} onToggleStar={toggleStar} onOpen={() => navigate(`/tasks/${b.id}`)} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Your boards</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {boards.map((b) => (
            <BoardTile key={b.id} board={b} starred={starredIds.includes(b.id)} onToggleStar={toggleStar} onOpen={() => navigate(`/tasks/${b.id}`)} />
          ))}
          <Popover open={createTrigger === "tile"} onOpenChange={(o) => handleCreatePopoverChange("tile", o)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="min-h-[7.5rem] rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4 mr-1" /> Create new board
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className={createStep === "menu" ? "w-56 p-1" : "w-80"}>
              {createPopoverBody}
            </PopoverContent>
          </Popover>
        </div>
      </section>
    </div>
  );
};

export default Tasks;
