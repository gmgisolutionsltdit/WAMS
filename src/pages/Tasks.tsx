import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Plus, FolderKanban, Star, Clock } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { colorForBoard, getStarredBoardIds, toggleStarredBoard, getRecentBoardIds } from "@/lib/boardPrefs";
import { BoardSearchCreate } from "@/components/tasks/BoardSearchCreate";
import { BoardCreatePopover } from "@/components/tasks/BoardCreatePopover";
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
  const navigate = useNavigate();
  const [boards, setBoards] = useState<Board[]>([]);

  const [starredIds, setStarredIds] = useState<string[]>(() => getStarredBoardIds());
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecentBoardIds());

  const fetchBoards = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    setBoards((data || []) as Board[]);
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);
  useRealtimeSubscription("projects", fetchBoards, "task-boards-list");

  // Refresh "recently viewed" whenever the board list changes (e.g. returning from a board just opened).
  useEffect(() => { setRecentIds(getRecentBoardIds()); }, [boards]);

  const toggleStar = (id: string) => setStarredIds(toggleStarredBoard(id));

  const boardsById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);
  const starredBoards = starredIds.map((id) => boardsById.get(id)).filter((b): b is Board => !!b);
  const recentBoards = recentIds.map((id) => boardsById.get(id)).filter((b): b is Board => !!b).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FolderKanban className="h-6 w-6" /> Tasks
        </h2>
        <BoardSearchCreate />
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
          <BoardCreatePopover
            trigger={
              <button
                type="button"
                className="min-h-[7.5rem] rounded-md border border-dashed flex items-center justify-center text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus className="h-4 w-4 mr-1" /> Create new board
              </button>
            }
            align="start"
            onCreated={fetchBoards}
          />
        </div>
      </section>
    </div>
  );
};

export default Tasks;
