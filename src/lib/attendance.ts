/**
 * Helpers to merge multiple attendance punches of the same day into a single
 * daily record while keeping every individual session available for drill-down.
 */

export type AttendanceSession = {
  id: string;
  user_id?: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  overtime_hours?: number | null;
  break_minutes?: number | null;
  break_start?: string | null;
  break_end?: string | null;
  ip_address?: string | null;
  device_source?: string | null;
  [key: string]: unknown;
};

export type MergedDay<T extends AttendanceSession = AttendanceSession> = {
  key: string;
  date: string;
  userId: string | null;
  /** Earliest clock-in of the day. */
  firstIn: string | null;
  /** Latest clock-out of the day (null when a session is still open). */
  lastOut: string | null;
  /** Total worked seconds across all sessions (breaks already excluded). */
  workedSeconds: number;
  /** Total break seconds across all sessions. */
  breakSeconds: number;
  /** Sum of stored overtime hours across sessions. */
  overtimeHours: number;
  /** True when at least one session has no clock-out yet. */
  open: boolean;
  sessions: T[];
  /** Convenience passthrough of the first session's profile join, if present. */
  profiles?: unknown;
};

/** Worked seconds for a single session (falls back to clock in/out span). */
export const sessionWorkedSeconds = (s: AttendanceSession, now = new Date()): number => {
  if (s.total_hours != null && s.clock_out) return Math.max(0, Number(s.total_hours) * 3600);
  if (!s.clock_in) return 0;
  const end = s.clock_out ? new Date(s.clock_out).getTime() : now.getTime();
  const raw = (end - new Date(s.clock_in).getTime()) / 1000;
  return Math.max(0, raw - (Number(s.break_minutes) || 0) * 60);
};

/** Group attendance rows into one record per user+date. Preserves input ordering of days. */
export const mergeDailySessions = <T extends AttendanceSession>(
  rows: T[],
  now = new Date(),
): MergedDay<T>[] => {
  const map = new Map<string, MergedDay<T>>();

  for (const row of rows) {
    const userId = (row.user_id as string) ?? null;
    const key = `${userId ?? "self"}|${row.date}`;
    let day = map.get(key);
    if (!day) {
      day = {
        key,
        date: row.date,
        userId,
        firstIn: null,
        lastOut: null,
        workedSeconds: 0,
        breakSeconds: 0,
        overtimeHours: 0,
        open: false,
        sessions: [],
        profiles: (row as AttendanceSession).profiles,
      };
      map.set(key, day);
    }
    day.sessions.push(row);
    day.workedSeconds += sessionWorkedSeconds(row, now);
    day.breakSeconds += (Number(row.break_minutes) || 0) * 60;
    day.overtimeHours += Number(row.overtime_hours) || 0;
    if (row.clock_in && (!day.firstIn || row.clock_in < day.firstIn)) day.firstIn = row.clock_in;
    if (row.clock_out) {
      if (!day.lastOut || row.clock_out > day.lastOut) day.lastOut = row.clock_out;
    } else if (row.clock_in) {
      day.open = true;
    }
  }

  for (const day of map.values()) {
    day.sessions.sort((a, b) => (a.clock_in ?? "").localeCompare(b.clock_in ?? ""));
  }

  return Array.from(map.values());
};
