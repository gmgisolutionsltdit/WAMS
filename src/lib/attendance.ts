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
  /** Minutes past the approved start time, fixed at clock-in. */
  late_minutes?: number | null;
  /** Extra work minutes owed for a late arrival, fixed at clock-in. */
  penalty_minutes?: number | null;
  /** True once late_minutes/penalty_minutes are authoritative for this row. */
  penalty_reviewed?: boolean | null;
  /** Start time that officially counts once approved (may waive a late arrival). */
  approved_start_time?: string | null;
  gmgi_task?: string | null;
  gm_task?: string | null;
  gmgi_time?: number | null;
  gm_time?: number | null;
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
  /** Late-arrival penalty recorded at clock-in for the day's first session, if any. */
  lateMinutes: number;
  penaltyMinutes: number;
  /** True when lateMinutes/penaltyMinutes are authoritative rather than a pre-feature default. */
  penaltyReviewed: boolean;
  /** Start time that officially counts once approved; equals firstIn until a waiver changes it. */
  approvedStartTime: string | null;
  /** Sum of GMGI task time across sessions, in hours. */
  gmgiTime: number;
  /** Sum of GM task time across sessions, in hours. */
  gmTime: number;
  /** True when at least one session has no clock-out yet. */
  open: boolean;
  sessions: T[];
  /** Convenience passthrough of the first session's profile join, if present. */
  profiles?: unknown;
};

/**
 * Worked seconds for a single session, computed from the raw clock in/out
 * span minus the break rather than from the stored total_hours - that
 * column is rounded to 2 decimal hours (36-second granularity), which
 * silently dropped real seconds from the displayed duration.
 */
export const sessionWorkedSeconds = (s: AttendanceSession, now = new Date()): number => {
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
        lateMinutes: 0,
        penaltyMinutes: 0,
        penaltyReviewed: false,
        approvedStartTime: null,
        gmgiTime: 0,
        gmTime: 0,
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
    day.gmgiTime += Number(row.gmgi_time) || 0;
    day.gmTime += Number(row.gm_time) || 0;
    // The penalty is a fact about the day's actual arrival, recorded on
    // whichever session was the first clock-in — carry it along as that
    // session is discovered rather than summing it across every punch.
    if (row.clock_in && (!day.firstIn || row.clock_in < day.firstIn)) {
      day.firstIn = row.clock_in;
      day.lateMinutes = Number(row.late_minutes) || 0;
      day.penaltyMinutes = Number(row.penalty_minutes) || 0;
      day.penaltyReviewed = !!row.penalty_reviewed;
      day.approvedStartTime = row.approved_start_time ?? row.clock_in;
    }
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
