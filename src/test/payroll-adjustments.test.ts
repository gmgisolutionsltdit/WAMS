import { describe, it, expect } from "vitest";
import {
  perMinuteRate, otPaymentAmount, dueDeductionAmount, leaveDeductionForMinutes,
  computeFinalSalary, roundMoneyHalfUp, validateMultiplier, timeInputToMinutes,
} from "@/lib/payrollAdjustments";

const GROSS = 15000;

describe("payroll adjustment math — spec test cases A-L", () => {
  it("A: OT 150 min, mult 1 -> paid 156.25, Final 15,156.25", () => {
    const ot = otPaymentAmount(GROSS, 1, 150);
    expect(roundMoneyHalfUp(ot)).toBe(156.25);
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: 0, recoveryTotal: 0, hasPendingDue: false });
    expect(roundMoneyHalfUp(r.final as number)).toBe(15156.25);
  });

  it("B: Due 90 min adjusted (0 cost) combined with A's OT -> 15,156.25", () => {
    const ot = otPaymentAmount(GROSS, 1, 150);
    const dueAdjusted = 0;
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: dueAdjusted, recoveryTotal: 0, hasPendingDue: false });
    expect(roundMoneyHalfUp(r.final as number)).toBe(15156.25);
  });

  it("C: Due 90 min salary-deducted (93.75) with OT 156.25 -> 15,062.50", () => {
    const ot = otPaymentAmount(GROSS, 1, 150);
    const due = dueDeductionAmount(GROSS, 1, 90);
    expect(roundMoneyHalfUp(due)).toBe(93.75);
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: due, recoveryTotal: 0, hasPendingDue: false });
    expect(roundMoneyHalfUp(r.final as number)).toBe(15062.5);
  });

  it("D: Due 90 min pending -> Current 15,156.25, Final PENDING", () => {
    const ot = otPaymentAmount(GROSS, 1, 150);
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: 0, recoveryTotal: 0, hasPendingDue: true });
    expect(roundMoneyHalfUp(r.currentApplicable)).toBe(15156.25);
    expect(r.final).toBe("PENDING");
  });

  it("E: OT mult 1.5, 150 min -> 234.38, Final 15,234.38", () => {
    const ot = otPaymentAmount(GROSS, 1.5, 150);
    expect(roundMoneyHalfUp(ot)).toBe(234.38);
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: 0, recoveryTotal: 0, hasPendingDue: false });
    expect(roundMoneyHalfUp(r.final as number)).toBe(15234.38);
  });

  it("F: Due mult 2, 90 min -> 187.50 deducted; with OT 156.25 -> 14,968.75", () => {
    const due = dueDeductionAmount(GROSS, 2, 90);
    expect(roundMoneyHalfUp(due)).toBe(187.5);
    const ot = otPaymentAmount(GROSS, 1, 150);
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: due, recoveryTotal: 0, hasPendingDue: false });
    expect(roundMoneyHalfUp(r.final as number)).toBe(14968.75);
  });

  it("G: OT 210 = 218.75, Due 75 = 78.125 -> 15,140.63 (unrounded intermediates)", () => {
    const ot = otPaymentAmount(GROSS, 1, 210);
    const due = dueDeductionAmount(GROSS, 1, 75);
    expect(roundMoneyHalfUp(ot)).toBe(218.75);
    expect(roundMoneyHalfUp(due)).toBe(78.13); // 78.125 -> 78.13 half-up
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: due, recoveryTotal: 0, hasPendingDue: false });
    expect(roundMoneyHalfUp(r.final as number)).toBe(15140.63);
  });

  it("H: G plus 3,000 recovery in 1,000 installments -> 14,140.63, remaining 2,000", () => {
    const ot = otPaymentAmount(GROSS, 1, 210);
    const due = dueDeductionAmount(GROSS, 1, 75);
    const installment = 1000;
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: due, recoveryTotal: installment, hasPendingDue: false });
    expect(roundMoneyHalfUp(r.final as number)).toBe(14140.63);
    const remaining = 3000 - installment;
    expect(remaining).toBe(2000);
  });

  it("I: OT 75 offset Due 75 inside a 210 OT / 75 Due record -> 15,140.63", () => {
    // Offsetting is 1:1 and generates neither payment nor deduction; only the
    // minutes left over after the offset are paid/deducted.
    const otMinutes = 210, dueMinutes = 75, offsetMinutes = 75;
    const otRemaining = otMinutes - offsetMinutes; // 135
    const dueRemaining = dueMinutes - offsetMinutes; // 0
    const ot = otPaymentAmount(GROSS, 1, otRemaining);
    const due = dueDeductionAmount(GROSS, 1, dueRemaining);
    const r = computeFinalSalary({ gross: GROSS, otPaymentTotal: ot, dueDeductionTotal: due, recoveryTotal: 0, hasPendingDue: false });
    expect(roundMoneyHalfUp(r.final as number)).toBe(15140.63);
  });

  it("J: 20h (1200 min) short, Casual 2 days -> 16h leave, 4h stays Due", () => {
    const { days, remainderMinutes } = leaveDeductionForMinutes(1200);
    expect(days).toBe(2);
    expect(remainderMinutes).toBe(240); // 4h
  });

  it("K: 20h (1200 min), 1 day leave -> 8h leave, 12h left; 8h of it salary-deducted = 500.00", () => {
    const { days, remainderMinutes } = leaveDeductionForMinutes(480); // admin picks exactly 1 day's worth to convert
    expect(days).toBe(1);
    expect(remainderMinutes).toBe(0);
    const afterOneLeaveDay = 1200 - 480;
    expect(afterOneLeaveDay).toBe(720); // 12h left
    const deducted = dueDeductionAmount(GROSS, 1, 480); // admin salary-deducts 8h of the remaining 12h
    expect(roundMoneyHalfUp(deducted)).toBe(500);
  });

  it("L: multiplier 0 / -1 / \"abc\" are blocked", () => {
    expect(validateMultiplier(0, "OT Multiplier")).toEqual({ ok: false, value: 0, error: "Invalid input: OT Multiplier must be a number greater than 0." });
    expect(validateMultiplier(-1, "Due Multiplier")).toEqual({ ok: false, value: 0, error: "Invalid input: Due Multiplier must be a number greater than 0." });
    expect(validateMultiplier("abc", "OT Multiplier")).toEqual({ ok: false, value: 0, error: "Invalid input: OT Multiplier must be a number greater than 0." });
    expect(validateMultiplier(1, "OT Multiplier")).toEqual({ ok: true, value: 1, error: null });
  });

  it("time input: 2h30m -> 150 minutes", () => {
    expect(timeInputToMinutes(2, 30)).toBe(150);
    expect(timeInputToMinutes(-1, 0)).toBeNull();
    expect(timeInputToMinutes(1, -5)).toBeNull();
  });

  it("perMinuteRate stays unrounded (Gross/14400)", () => {
    expect(perMinuteRate(15000)).toBeCloseTo(15000 / 14400, 10);
  });
});
