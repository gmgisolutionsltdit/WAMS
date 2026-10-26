import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { colorForBoard, getRecentBoardIds } from "@/lib/boardPrefs";
import { BoardCreatePopover } from "@/components/tasks/BoardCreatePopover";
import { cn } from "@/lib/utils";

type Board = {
  id: string; key: string; name: string; description: string | null;
  wing: string | null; owner_id: string; archived: boolean;
};

// Shared Trello-style "search boards / create board" bar — used on the Tasks
// home screen and, identically, inside every board's own header so you never
// have to go back to Tasks just to jump to or create another board.
export const BoardSearchCreate = ({ className }: { className?: string }) => {
  const navigate = useNavigate();

  const [boards, setBoards] = useState<Board[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecentBoardIds());
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchBoards = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").eq("archived", false).order("created_at", { ascending: false });
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

  return (
    <div className={cn("flex items-center gap-2 w-full max-w-xl", className)}>
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchInputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          placeholder="Search boards"
          className="pl-8"
        />
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
      <BoardCreatePopover
        trigger={<Button><Plus className="mr-1 h-4 w-4" /> Create</Button>}
        align="end"
        onCreated={(id) => navigate(`/tasks/${id}`)}
      />
    </div>
  );
};
