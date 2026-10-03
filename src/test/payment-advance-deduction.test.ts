import { describe, it, expect } from "vitest";
import { computeFinalSalary, roundMoneyHalfUp } from "@/lib/payrollAdjustments";

const GROSS = 15000;

describe("computeFinalSalary — Personal Advance deduction (additive, optional field)", () => {
  it("omitting advanceDeductionTotal behaves identically to before (matches spec case C)", () => {
    const r = computeFinalSalary({
      gross: GROSS, otPaymentTotal: 156.25, dueDeductionTotal: 93.75, recoveryTotal: 0, hasPendingDue: false,
    });
    expect(roundMoneyHalfUp(r.final as number)).toBe(15062.5);
    expect(r.deductionsExceedCap).toBe(false);
  });

  it("subtracts advanceDeductionTotal from Final when provided", () => {
    const r = computeFinalSalary({
      gross: GROSS, otPaymentTotal: 156.25, dueDeductionTotal: 93.75, recoveryTotal: 0,
      advanceDeductionTotal: 1000, hasPendingDue: false,
    });
    expect(roundMoneyHalfUp(r.final as number)).toBe(14062.5);
  });

  it("advanceDeductionTotal counts toward deductionsExceedCap", () => {
    const r = computeFinalSalary({
      gross: GROSS, otPaymentTotal: 0, dueDeductionTotal: 0, recoveryTotal: 0,
      advanceDeductionTotal: GROSS + 1, hasPendingDue: false,
    });
    expect(r.deductionsExceedCap).toBe(true);
  });

  it("hasPendingDue still returns PENDING regardless of advanceDeductionTotal", () => {
    const r = computeFinalSalary({
      gross: GROSS, otPaymentTotal: 156.25, dueDeductionTotal: 0, recoveryTotal: 0,
      advanceDeductionTotal: 500, hasPendingDue: true,
    });
    expect(r.final).toBe("PENDING");
    expect(roundMoneyHalfUp(r.currentApplicable)).toBe(15156.25);
  });
});
