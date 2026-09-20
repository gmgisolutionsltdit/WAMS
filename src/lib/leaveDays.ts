import { format } from "date-fns";

/**
 * Compute leave days.
 *
 * - `bridgeHolidays=true` (default ON for most leave types): every day in
 *   the range counts, weekends and holidays included. This implements the
 *   "holiday encapsulation" rule (e.g. Thu→Sat with Fri/Sat weekend = 3d).
 * - `bridgeHolidays=false`: weekends/holidays excluded by default;
 *   `sandwich` then counts weekend/holiday days adjacent (either side)
 *   to working leave days within the range.
 * - Half-day always = 0.5.
 */
export const computeWorkingDays = (
  start: string,
  end: string,
  dayType: string,
  weekendDays: number[],
  holidaySet: Set<string>,
  sandwich = false,
  bridgeHolidays = false,
): number => {
  if (dayType !== "full") return 0.5;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (e < s) return 0;

  const isNonWorking = (d: Date) =>
    weekendDays.includes(d.getDay()) || holidaySet.has(format(d, "yyyy-MM-dd"));

  if (bridgeHolidays) {
    let extStart = new Date(s);
    let extEnd = new Date(e);
    if (!isNonWorking(extStart)) {
      while (true) {
        const prev = new Date(extStart); prev.setDate(prev.getDate() - 1);
        if (isNonWorking(prev)) extStart = prev; else break;
      }
    }
    if (!isNonWorking(extEnd)) {
      while (true) {
        const next = new Date(extEnd); next.setDate(next.getDate() + 1);
        if (isNonWorking(next)) extEnd = next; else break;
      }
    }
    let count = 0;
    for (let d = new Date(extStart); d <= extEnd; d.setDate(d.getDate() + 1)) count += 1;
    return count;
  }

  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (!isNonWorking(d)) { count += 1; continue; }
    if (!sandwich) continue;
    const prev = new Date(d); prev.setDate(prev.getDate() - 1);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const prevInRange = prev >= s && prev <= e && !isNonWorking(prev);
    const nextInRange = next >= s && next <= e && !isNonWorking(next);
    if (prevInRange || nextInRange) count += 1;
  }
  return count;
};
