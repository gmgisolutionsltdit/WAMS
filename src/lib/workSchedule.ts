/**
 * Per-employee work schedule and the single source of truth for daily
 * worked-hours / overtime maths.
 *
 * A scheduled day is defined as `standard_daily_hours` of *net* work plus an
 * unpaid break that sits inside the office window. So the default 8h day with a
 * 60m break means an employee starting at 09:00 is due to leave at 18:00.
 *
 * Overtime is measured against the employee's own standard hours after the
 * unpaid break is deducted — a 09:00-17:00 day is a 7h day, not 8h + 1h OT.
 */

import { officeEnd, officeStart, timeToMinutes, type OfficeTime } from "./officeTime";

/** Net work required per day when the profile does not override it. */
export const DEFAULT_STANDARD_DAILY_HOURS = 8;
/** Unpaid break that sits inside the office window. */
export const DEFAULT_UNPAID_BREAK_MINUTES = 60;
/** Sunday-Thursday, the standard 5-day week. 0 = Sunday. */
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

export type WorkSchedule = OfficeTime & {
  standard_daily_hours?: number | null;
  unpaid_break_minutes?: number | null;
  /** Weekday numbers the employee is expected to work (0 = Sunday). */
  working_days?: number[] | null;
};

export const standardDailyHours = (s?: WorkSchedule | null): number => {
  const v = Number(s?.standard_daily_hours);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_STANDARD_DAILY_HOURS;
};

export const unpaidBreakMinutes = (s?: WorkSchedule | null): number => {
  const v = Number(s?.unpaid_break_minutes);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_UNPAID_BREAK_MINUTES;
};

export const workingDays = (s?: WorkSchedule | null): number[] => {
  const v = s?.working_days;
  return Array.isArray(v) && v.length > 0 ? v.map(Number) : DEFAULT_WORKING_DAYS;
};

export const workingDaysPerWeek = (s?: WorkSchedule | null): number => workingDays(s).length;

/** True when the given date falls on one of the employee's working days. */
export const isWorkingDay = (date: Date | string, s?: WorkSchedule | null): boolean => {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  return workingDays(s).includes(d.getDay());
};

/** Expected clock-out = office start + net hours + unpaid break, in minutes past midnight. */
export const expectedEndMinutes = (s?: WorkSchedule | null): number =>
  timeToMinutes(officeStart(s)) + standardDailyHours(s) * 60 + unpaidBreakMinutes(s);

/**
 * Break length in seconds. Kept at second precision so short breaks are not
 * silently rounded away to zero.
 */
export const breakSeconds = (
  start?: string | Date | null,
  end?: string | Date | null,
): number => {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms > 0 ? Math.round(ms / 1000) : 0;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export type DailyTotals = {
  /** Gross clock-in to clock-out span, in hours. */
  grossHours: number;
  /** Break actually deducted, in minutes (never less than the unpaid break). */
  breakMinutes: number;
  /** Net worked hours after the break is deducted. */
  totalHours: number;
  /** Hours beyond the employee's standard day. */
  overtimeHours: number;
  /** Hours short of the standard day (0 when the day is complete). */
  shortfallHours: number;
};

/**
 * Compute the worked/overtime split for one attendance session.
 *
 * The unpaid break is always deducted: an employee who records no break still
 * owes the scheduled one, which is what stops a plain 09:00-17:00 day from
 * being reported as 8h worked plus an hour of overtime.
 */
export const computeDailyTotals = (input: {
  clockIn: string | Date | null | undefined;
  clockOut: string | Date | null | undefined;
  /** Break recorded by the employee, in minutes. Fractions are kept. */
  breakMinutes?: number | null;
  schedule?: WorkSchedule | null;
}): DailyTotals => {
  const { clockIn, clockOut, schedule } = input;
  const empty: DailyTotals = {
    grossHours: 0,
    breakMinutes: 0,
    totalHours: 0,
    overtimeHours: 0,
    shortfallHours: standardDailyHours(schedule),
  };
  if (!clockIn || !clockOut) return empty;

  const span = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000;
  if (!(span > 0)) return empty;

  const recorded = Math.max(0, Number(input.breakMinutes) || 0);
  const deducted = Math.max(recorded, unpaidBreakMinutes(schedule));
  const net = Math.max(0, span - deducted / 60);
  const standard = standardDailyHours(schedule);

  return {
    grossHours: round2(span),
    breakMinutes: round2(deducted),
    totalHours: round2(net),
    overtimeHours: round2(Math.max(0, net - standard)),
    shortfallHours: round2(Math.max(0, standard - net)),
  };
};

/** Convenience: office window label, e.g. "09:00 - 18:00". */
export const scheduleLabel = (s?: WorkSchedule | null): string =>
  `${officeStart(s)} - ${officeEnd(s)}`;
