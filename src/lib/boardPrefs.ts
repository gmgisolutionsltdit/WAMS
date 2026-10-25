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

const BOARD_COLORS = [
  "bg-gradient-to-br from-blue-400 to-blue-600",
  "bg-gradient-to-br from-emerald-400 to-emerald-600",
  "bg-gradient-to-br from-purple-400 to-purple-600",
  "bg-gradient-to-br from-rose-400 to-rose-600",
  "bg-gradient-to-br from-amber-400 to-amber-600",
  "bg-gradient-to-br from-cyan-400 to-cyan-600",
  "bg-gradient-to-br from-indigo-400 to-indigo-600",
  "bg-gradient-to-br from-pink-400 to-pink-600",
  "bg-gradient-to-br from-teal-400 to-teal-600",
  "bg-gradient-to-br from-orange-400 to-orange-600",
];

/** Deterministic per-board color so each board tile looks distinct and stays the same color across reloads. */
export const colorForBoard = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return BOARD_COLORS[hash % BOARD_COLORS.length];
};
