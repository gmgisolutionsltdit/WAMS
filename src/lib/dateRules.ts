/**
 * 48-hour retroactive date-entry lock.
 *
 * Used by attendance, OT request, leave request, and work log forms to
 * prevent users from submitting entries for dates more than 48 hours in
 * the past. Admins and HR bypass this rule (enforced both client-side
 * via `canBypass48h` and server-side via DB triggers).
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

/** Roles that bypass the 48h retro lock. */
export function canBypass48h(role: string): boolean {
  return role === "admin" || role === "hr";
}

/** Helper for `<Calendar disabled={...}>` — disables dates older than 48h. */
export function disablePast48h(date: Date, now: Date = new Date()): boolean {
  const min = min48hDate(now);
  return date < min;
}
