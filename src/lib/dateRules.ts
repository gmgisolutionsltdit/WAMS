/**
 * 48-hour retroactive date-entry lock.
 *
 * Used by attendance, OT request, leave request, and work log forms to
 * prevent users from submitting entries for dates more than 48 hours in
 * the past. Admins bypass this rule (enforced both client-side via
 * `canBypass48h` and server-side via DB triggers).
 */

export const RETRO_LOCK_HOURS = 48;
export const RETRO_LOCK_MESSAGE =
  "Submissions for dates older than 48 hours are restricted.";

/** Earliest ISO date (yyyy-MM-dd) that's still within the 48h window. */
export function min48hDateISO(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 2);
  return d.toISOString().slice(0, 10);
}

/** Earliest `Date` object inside the 48h window (00:00 local). */
export function min48hDate(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 2);
  return d;
}

/** Returns true when the given date string (yyyy-MM-dd) is within the 48h window. */
export function isWithin48h(dateISO: string, now: Date = new Date()): boolean {
  if (!dateISO) return true;
  return dateISO >= min48hDateISO(now);
}

/** Latest ISO date (yyyy-MM-dd) still within 2 days ahead of today. */
export function max2DaysAheadISO(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

/** Roles that bypass the 48h retro lock. */
export function canBypass48h(role: string): boolean {
  return role === "admin";
}

/** Helper for `<Calendar disabled={...}>` — disables dates older than 48h. */
export function disablePast48h(date: Date, now: Date = new Date()): boolean {
  const min = min48hDate(now);
  return date < min;
}

/**
 * Overtime lead-time rule: a request to work overtime starting in the
 * future must be submitted at least this many hours before that start
 * time (e.g. planning to start OT at 3:00pm requires applying by noon).
 * Already-worked (past) overtime, logged after the fact, isn't subject to
 * this — only a start time that's still ahead of "now".
 */
export const OT_MIN_LEAD_HOURS = 3;
export const OT_LEAD_TIME_MESSAGE =
  `Overtime for a future start time must be requested at least ${OT_MIN_LEAD_HOURS} hours in advance.`;

/** True when the planned OT start (date + "HH:mm") is less than OT_MIN_LEAD_HOURS away but still in the future. */
export function violatesOTLeadTime(dateISO: string, timeHHmm: string, now: Date = new Date()): boolean {
  if (!dateISO || !timeHHmm) return false;
  const plannedStart = new Date(`${dateISO}T${timeHHmm}:00`);
  if (Number.isNaN(plannedStart.getTime())) return false;
  const hoursUntilStart = (plannedStart.getTime() - now.getTime()) / 3_600_000;
  return hoursUntilStart > 0 && hoursUntilStart < OT_MIN_LEAD_HOURS;
}
