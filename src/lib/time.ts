import { format } from "date-fns";

/** Format a duration given in seconds as HH:MM:SS (hours are not capped at 24). */
export const fmtHMS = (totalSeconds: number): string => {
  if (!isFinite(totalSeconds) || totalSeconds <= 0) return "00:00:00";
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => n.toString().padStart(2, "0")).join(":");
};

/** Format a duration expressed in hours as HH:MM:SS. */
export const hoursToHMS = (hours: number | null | undefined): string =>
  fmtHMS((Number(hours) || 0) * 3600);

/** Format a duration expressed in minutes as HH:MM:SS. */
export const minutesToHMS = (minutes: number | null | undefined): string =>
  fmtHMS((Number(minutes) || 0) * 60);

/** Format a duration between two instants (ms epoch or ISO strings) as HH:MM:SS. */
export const spanToHMS = (from: string | number | Date, to: string | number | Date): string =>
  fmtHMS((new Date(to).getTime() - new Date(from).getTime()) / 1000);

/** Format a timestamp with seconds, e.g. "09:04:31 AM". Returns "—" when empty. */
export const fmtClock = (value: string | Date | null | undefined): string =>
  value ? format(new Date(value), "hh:mm:ss a") : "—";

/** Format a timestamp with seconds in 24h form, e.g. "09:04:31". */
export const fmtClock24 = (value: string | Date | null | undefined): string =>
  value ? format(new Date(value), "HH:mm:ss") : "—";

/** Split a total-minutes value (e.g. break_minutes) into whole hour/minute parts for an Hour/Minute input pair. */
export const minutesToHM = (totalMinutes: number | string | null | undefined): { h: string; m: string } => {
  const total = Math.max(0, Math.round(Number(totalMinutes) || 0));
  return { h: String(Math.floor(total / 60)), m: String(total % 60) };
};

/** Combine hour/minute input parts back into a total-minutes value. */
export const hmToMinutes = (h: string, m: string): number =>
  Math.max(0, Math.round(Number(h) || 0) * 60 + Math.max(0, Math.round(Number(m) || 0)));

/** Split a decimal-hours value (e.g. gmgi_time) into whole hour/minute parts for an Hour/Minute input pair. */
export const hoursToHM = (decimalHours: number | string | null | undefined): { h: string; m: string } => {
  const totalMinutes = Math.max(0, Math.round((Number(decimalHours) || 0) * 60));
  return { h: String(Math.floor(totalMinutes / 60)), m: String(totalMinutes % 60) };
};

/** Combine hour/minute input parts back into a decimal-hours value, rounded to 2 decimals. */
export const hmToHours = (h: string, m: string): number =>
  Math.round((hmToMinutes(h, m) / 60) * 100) / 100;
