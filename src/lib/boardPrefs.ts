/**
 * Per-browser board preferences for the Tasks page (starred + recently
 * viewed boards, and a stable color per board) — mirrors Trello's home
 * screen. These are personal view conveniences, not shared data, so they
 * live in localStorage rather than a DB table.
 */

const STARRED_KEY = "wams.taskBoards.starred";
const RECENT_KEY = "wams.taskBoards.recent";
const RECENT_LIMIT = 8;

const readIds = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const writeIds = (key: string, ids: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // ignore (private browsing, storage disabled, etc.)
  }
};

export const getStarredBoardIds = (): string[] => readIds(STARRED_KEY);

export const isBoardStarred = (id: string): boolean => getStarredBoardIds().includes(id);

export const toggleStarredBoard = (id: string): string[] => {
  const current = getStarredBoardIds();
  const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
  writeIds(STARRED_KEY, next);
  return next;
};

export const getRecentBoardIds = (): string[] => readIds(RECENT_KEY);

export const recordRecentBoard = (id: string): string[] => {
  const next = [id, ...getRecentBoardIds().filter((v) => v !== id)].slice(0, RECENT_LIMIT);
  writeIds(RECENT_KEY, next);
  return next;
};

// Every new board uses the same flat background — matching Trello, where
// a newly created board gets one default color rather than a random one
// per board. Darkens slightly on hover via the caller's `group` class.
const DEFAULT_BOARD_COLOR = "bg-indigo-100 group-hover:bg-indigo-200 transition-colors";

/** Still takes a board id for call-site compatibility, but every board
    gets the same flat color now (kept as a function in case per-board
    colors come back as a user-chosen setting later). */
export const colorForBoard = (_id: string): string => DEFAULT_BOARD_COLOR;

// A list's own background on the board — same light-blue family as the
// board tile color above, matching Trello (where a list's background tints
// to the board's color), without the hover-darken variant a column isn't
// rendered inside a `group` for.
export const LIST_BACKGROUND_COLOR = "bg-indigo-100/70";
