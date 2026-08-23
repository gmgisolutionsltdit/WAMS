/**
 * Office time / late arrival rules.
 *
 * Default office hours are 09:00–17:00. Arrival later than the approved start
 * time plus the grace period (11 minutes by default) is recorded as late, and a
 * late day requires an extra 2h 40m (160 minutes) of work. Adjusting that
 * penalty — or changing the approved office time — requires approval from the
 * employee's reporting manager or an admin, and office-time changes must be
 * requested at least one day in advance.
 */

export const DEFAULT_OFFICE_START = "09:00";
export const DEFAULT_OFFICE_END = "17:00";
export const DEFAULT_GRACE_MINUTES = 11;
/** Extra work required for a late day: 2 hours 40 minutes. */
export const LATE_PENALTY_MINUTES = 160;

export type OfficeTime = {
  office_start_time?: string | null;
  office_end_time?: string | null;
  late_grace_minutes?: number | null;
};

/** "09:00:00" | "09:00" -> minutes past midnight. */
export const timeToMinutes = (value?: string | null): number => {
  if (!value) return 0;
  const [h, m] = value.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
};

export const minutesToTime = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** Human readable minutes, e.g. "2h 40m". */
export const humanMinutes = (mins: number): string => {
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h > 0 ? `${h}h ` : ""}${m}m`.trim();
};

export const officeStart = (p?: OfficeTime | null) => p?.office_start_time || DEFAULT_OFFICE_START;
export const officeEnd = (p?: OfficeTime | null) => p?.office_end_time || DEFAULT_OFFICE_END;
export const graceMinutes = (p?: OfficeTime | null) =>
  p?.late_grace_minutes == null ? DEFAULT_GRACE_MINUTES : Number(p.late_grace_minutes);

/**
 * Evaluate an arrival against the approved office start time.
 * Returns how many minutes late (0 when within grace) and the extra work owed.
 */
export const evaluateArrival = (
  clockIn: string | Date | null | undefined,
  profile?: OfficeTime | null,
): { late: boolean; lateMinutes: number; penaltyMinutes: number } => {
  if (!clockIn) return { late: false, lateMinutes: 0, penaltyMinutes: 0 };
  const d = new Date(clockIn);
  const arrival = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const cutoff = timeToMinutes(officeStart(profile)) + graceMinutes(profile);
  if (arrival <= cutoff) return { late: false, lateMinutes: 0, penaltyMinutes: 0 };
  return {
    late: true,
    lateMinutes: Math.round(arrival - timeToMinutes(officeStart(profile))),
    penaltyMinutes: LATE_PENALTY_MINUTES,
  };
};

/** Earliest date an office-time change may take effect (tomorrow). */
export const minOfficeChangeDateISO = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
