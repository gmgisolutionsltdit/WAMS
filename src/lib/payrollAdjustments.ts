/**
 * Payroll OT/Due adjustment math — the single source of truth for every rate,
 * payment and deduction amount shown or stored anywhere in Payroll.
 *
 * Rates are always derived from Gross using a fixed 30-day/8-hour/60-minute
 * month (Daily = Gross/30, Hourly = Daily/8, PerMin = Hourly/60) and kept at
 * full floating-point precision through every intermediate step. Nothing is
 * rounded until a money value is actually displayed — rounding intermediate
 * amounts and then summing them produces a different (wrong) total than
 * summing unrounded amounts and rounding once, and the spec's own worked
 * examples (e.g. 218.75 + -78.125 = 140.625 → 15,140.63, not 15,140.62) only
 * match when rounding happens exactly once, at the end.
 */

export const MINUTES_PER_WORKDAY = 8 * 60;
export const DAYS_PER_PAY_MONTH = 30;

/** Basic 50% / House Rent 35% / Conveyance 10% / Medical 5% = Gross. Gross itself never changes. */
export type SalaryBreakdown = {
  gross: number;
  basic: number;
  houseRent: number;
  conveyance: number;
  medical: number;
};

export const salaryBreakdown = (gross: number): SalaryBreakdown => ({
  gross,
  basic: gross * 0.5,
  houseRent: gross * 0.35,
  conveyance: gross * 0.1,
  medical: gross * 0.05,
});

export const dailyRate = (gross: number): number => gross / DAYS_PER_PAY_MONTH;
export const hourlyRate = (gross: number): number => dailyRate(gross) / 8;
/** Unrounded — every per-minute amount is computed from this full-precision value. */
export const perMinuteRate = (gross: number): number => hourlyRate(gross) / 60;

export type MultiplierCheck = { ok: boolean; value: number; error: string | null };

/** OT and Due multipliers default to 1 and must be a number greater than 0. */
export const validateMultiplier = (raw: unknown, name: string): MultiplierCheck => {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (raw === "" || raw == null || !Number.isFinite(value) || value <= 0) {
    return { ok: false, value: 0, error: `Invalid input: ${name} must be a number greater than 0.` };
  }
  return { ok: true, value, error: null };
};

/** h+m time input (both >= 0) -> total whole minutes. Returns null for invalid input. */
export const timeInputToMinutes = (hours: unknown, minutes: unknown): number | null => {
  const h = typeof hours === "number" ? hours : Number(hours);
  const m = typeof minutes === "number" ? minutes : Number(minutes);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) return null;
  return Math.round(h * 60 + m);
};

/** Unrounded OT payment for a number of minutes at the given multiplier. */
export const otPaymentAmount = (gross: number, otMultiplier: number, minutes: number): number =>
  perMinuteRate(gross) * otMultiplier * minutes;

/** Unrounded salary-deduction amount for a number of Due minutes at the given multiplier. */
export const dueDeductionAmount = (gross: number, dueMultiplier: number, minutes: number): number =>
  perMinuteRate(gross) * dueMultiplier * minutes;

/** Each full 8h of Due minutes converts to 1 leave day; any remainder stays Due. */
export const leaveDeductionForMinutes = (minutes: number): { days: number; remainderMinutes: number } => {
  const days = Math.floor(minutes / MINUTES_PER_WORKDAY);
  return { days, remainderMinutes: minutes - days * MINUTES_PER_WORKDAY };
};

/** Round-half-up to 2 decimals (78.125 -> 78.13), safe against float drift. */
export const roundMoneyHalfUp = (n: number): number => {
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  return (sign * Math.round((abs + 1e-9) * 100)) / 100;
};

/** "BDT 0,000.00", negative values keep a leading minus. */
export const fmtBDT = (n: number): string => {
  const rounded = roundMoneyHalfUp(n);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  return `${sign}BDT ${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export type FinalSalaryInput = {
  gross: number;
  /** Sum of every "Pay" decision's unrounded amount for the month. */
  otPaymentTotal: number;
  /** Sum of every "Salary Deduction" decision's unrounded amount for the month. */
  dueDeductionTotal: number;
  /** Sum of unrounded recovery deductions applied this month. */
  recoveryTotal: number;
  /** Sum of unrounded Personal Advance installment deductions applied this month. Defaults to 0 when omitted. */
  advanceDeductionTotal?: number;
  /** True when any Due record for the month is still Pending (undecided). */
  hasPendingDue: boolean;
};

export type FinalSalaryResult = {
  /** OT Payment - Due Deduction, unrounded. */
  netAdjustment: number;
  /** Gross + OT Payment, before Due/Recovery — shown whenever a Due is Pending. */
  currentApplicable: number;
  /** The settled take-home amount, or "PENDING" while a Due decision is outstanding. */
  final: number | "PENDING";
  /** True when Due Deduction + Recovery would exceed Gross + OT Payment. */
  deductionsExceedCap: boolean;
};

/**
 * Final = Gross + OT Payment - Due Deduction - Recovery (Due deducted first).
 * Deductions must never exceed Gross + OT Payment. Any Due left Pending means
 * the month can't be settled yet: show Current Applicable Salary instead of a
 * Final figure, and never label that Current figure "Final".
 */
export const computeFinalSalary = (input: FinalSalaryInput): FinalSalaryResult => {
  const advanceDeductionTotal = input.advanceDeductionTotal ?? 0;
  const netAdjustment = input.otPaymentTotal - input.dueDeductionTotal;
  const currentApplicable = input.gross + input.otPaymentTotal;
  const cap = input.gross + input.otPaymentTotal;
  const deductionsExceedCap = input.dueDeductionTotal + input.recoveryTotal + advanceDeductionTotal > cap + 1e-9;
  if (input.hasPendingDue) {
    return { netAdjustment, currentApplicable, final: "PENDING", deductionsExceedCap };
  }
  const final = input.gross + input.otPaymentTotal - input.dueDeductionTotal - input.recoveryTotal - advanceDeductionTotal;
  return { netAdjustment, currentApplicable, final, deductionsExceedCap };
};

/** Every "yyyy-MM" month between two "yyyy-MM-dd" dates, inclusive. */
export const monthsInRange = (fromISO: string, toISO: string): string[] => {
  if (!fromISO || !toISO) return [];
  const [fy, fm] = fromISO.split("-").map(Number);
  const [ty, tm] = toISO.split("-").map(Number);
  const months: string[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
};
