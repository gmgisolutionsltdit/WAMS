import { format } from "date-fns";

/**
 * Compute leave days.
 *
 * - Default (`sandwich=false`, `bridgeHolidays=false`): weekends/holidays
 *   inside the selected range are excluded from the count entirely.
 * - `bridgeHolidays=true` or `sandwich=true`: the range is first extended
 *   outward to swallow any weekend/holiday block immediately touching the
 *   selected start/end date (on either side), then every day in that
 *   extended range counts — this is what actually "charges" the adjacent
 *   weekend for e.g. a single Monday (or Friday) leave request, since
 *   otherwise that weekend never falls inside the user-picked range at
 *   all. `bridgeHolidays` and `sandwich` use the same mechanism; a leave
 *   type can enable either (or both) to get this behavior.
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

  if (bridgeHolidays || sandwich) {
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
    if (!isNonWorking(d)) count += 1;
  }
  return count;
};
